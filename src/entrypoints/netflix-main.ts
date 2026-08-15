import { createLogger } from '@/shared/logger';
import {
  NETFLIX_PREFERRED_TEXT_PROFILES,
  isSubtitleResourceUrl,
  looksLikeTrackUrl,
} from '@/adapters/netflix/netflix-track-constants';

const logger = createLogger('NetflixMain');

const MAIN_SOURCE = 'owt-netflix-main';
const CONTENT_SOURCE = 'owt-netflix-content';

function post(type: string, payload: Record<string, unknown> = {}): void {
  window.postMessage(
    {
      source: MAIN_SOURCE,
      type,
      ...payload,
    },
    location.origin,
  );
}

function readAsciiPrefix(bytes: Uint8Array, length = 32) {
  return [...bytes.slice(0, length)]
    .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
    .join('');
}

function hasControlBytes(str: string): boolean {
  return /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(str);
}

function extractTextFromMp4Segment(bytes: Uint8Array): string | null {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const rawString = decoder.decode(bytes);

  const ttmlDocs: string[] = [];
  let searchIdx = 0;

  while (searchIdx < rawString.length) {
    let startIdx = rawString.indexOf('<?xml', searchIdx);
    const altStart1 = rawString.indexOf('<tt', searchIdx);
    const altStart2 = rawString.indexOf('<smpte:tt', searchIdx);

    const candidates = [startIdx, altStart1, altStart2].filter(idx => idx !== -1);
    if (candidates.length === 0) break;
    startIdx = Math.min(...candidates);

    let endTag = '';
    const prefix = rawString.substring(startIdx, startIdx + 15);
    if (prefix.startsWith('<?xml') || prefix.startsWith('<tt')) {
      endTag = '</tt>';
    } else if (prefix.startsWith('<smpte:tt')) {
      endTag = '</smpte:tt>';
    }

    let endIdx = rawString.indexOf(endTag, startIdx);
    if (endIdx === -1 && endTag === '</tt>') {
        endIdx = rawString.indexOf('</smpte:tt>', startIdx);
        if (endIdx !== -1) endTag = '</smpte:tt>';
    }

    if (endIdx !== -1) {
      let doc = rawString.substring(startIdx, endIdx + endTag.length);
      if (!hasControlBytes(doc)) {
        doc = doc.replace(/<\?xml[^>]*\?>/g, '').trim();
        ttmlDocs.push(doc);
      }
      searchIdx = endIdx + endTag.length;
    } else {
      break;
    }
  }

  if (ttmlDocs.length > 0) {
    if (ttmlDocs.length === 1) return ttmlDocs[0];
    return `<root>\n${ttmlDocs.join('\n')}\n</root>`;
  }

  const vttStart = rawString.indexOf('WEBVTT');
  if (vttStart !== -1) {
    const candidate = rawString.substring(vttStart);
    if (!hasControlBytes(candidate)) {
      return candidate;
    }
  }

  return null;
}

function detectSubtitleFormat(bytes: Uint8Array): 'webvtt' | 'ttml' | 'mp4-timed-text' | 'unknown' {
  logger.debug('[OWT-FORMAT-DETECTOR] invoked', {
    bytes: bytes.length,
    magic: readAsciiPrefix(bytes, 24),
  });

  const magic = readAsciiPrefix(bytes, 4096);
  const isMp4Container =
    magic.includes('midx') ||
    magic.includes('moof') ||
    magic.includes('mfhd') ||
    magic.includes('mdat') ||
    magic.includes('styp') ||
    magic.includes('SUBS');

  const prefix = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(0, 512))
    .trimStart();

  if (prefix.startsWith('WEBVTT')) return 'webvtt';
  if (prefix.startsWith('<?xml') || prefix.startsWith('<tt') || prefix.includes('<tt ')) return 'ttml';

  const extractedText = extractTextFromMp4Segment(bytes);
  if (extractedText) {
    logger.debug('[OWT-FORMAT-DETECTOR] Successfully extracted text segment', {
      extractedBytes: extractedText.length,
    });
    return extractedText.includes('WEBVTT') ? 'webvtt' : 'ttml';
  }

  if (isMp4Container) {
    return 'mp4-timed-text';
  }

  return 'unknown';
}

function getPlayerApi(): any {
  try {
    return (window as any).netflix?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
  } catch {
    return null;
  }
}

function getMainVideoPlayer(api?: any): { id: string; player: any } | null {
  const videoPlayerApi = api || getPlayerApi();
  if (!videoPlayerApi) return null;

  try {
    const sessionIds = videoPlayerApi.getAllPlayerSessionIds?.() || [];
    const watchSessionId = sessionIds.find((id: string) => id.startsWith('watch-'));
    const targetSessionId = watchSessionId || sessionIds[0];

    if (!targetSessionId) return null;
    const player = videoPlayerApi.getVideoPlayerBySessionId(targetSessionId);
    return player ? { id: targetSessionId, player } : null;
  } catch {
    return null;
  }
}

function getUrlsFromEntry(entry: any): string[] {
  if (!entry) return [];
  const urls: string[] = [];

  const raw = entry.downloadUrls || entry.urls || entry.url;
  if (typeof raw === 'string' && raw.startsWith('http')) {
    urls.push(raw);
  } else if (Array.isArray(raw)) {
    for (const u of raw) {
      if (typeof u === 'string' && u.startsWith('http')) {
        urls.push(u);
      } else if (u && typeof u === 'object') {
        const inner = u.url || u.downloadUrl;
        if (typeof inner === 'string' && inner.startsWith('http')) urls.push(inner);
      }
    }
  } else if (raw && typeof raw === 'object') {
    for (const u of Object.values(raw)) {
      if (typeof u === 'string' && u.startsWith('http')) {
        urls.push(u);
      } else if (u && typeof u === 'object') {
        const inner = (u as any).url || (u as any).downloadUrl;
        if (typeof inner === 'string' && inner.startsWith('http')) urls.push(inner);
      }
    }
  }

  return urls;
}

function findUrlsInObject(obj: any, depth = 0, maxDepth = 6): string[] {
  let urls: string[] = [];
  if (!obj || depth > maxDepth || typeof obj !== 'object') return urls;

  for (const key of Object.keys(obj)) {
    try {
      const val = obj[key];
      if (typeof val === 'string') {
        if (looksLikeTrackUrl(val)) {
          urls.push(val);
        }
      } else if (val && typeof val === 'object') {
        urls = urls.concat(findUrlsInObject(val, depth + 1, maxDepth));
      }
    } catch {}
  }
  return [...new Set(urls)];
}

function extractTrackUrlUniversal(t: any): string {
  if (!t) return '';

  const directUrls = getUrlsFromEntry(t);
  if (directUrls.length > 0) return directUrls[0];

  const downloadables = t.ttDownloadables || t.downloadables || t.rawTrack?.ttDownloadables || t.rawTrack?.downloadables;
  if (downloadables && typeof downloadables === 'object') {
    for (const prof of NETFLIX_PREFERRED_TEXT_PROFILES) {
      const entry = downloadables[prof];
      if (entry) {
        const urls = getUrlsFromEntry(entry);
        if (urls.length > 0) return urls[0];
      }
    }

    for (const [prof, entry] of Object.entries(downloadables as Record<string, any>)) {
      if (entry && !entry.isImage && !prof.includes('imsc')) {
        const urls = getUrlsFromEntry(entry);
        if (urls.length > 0) return urls[0];
      }
    }

    for (const entry of Object.values(downloadables as Record<string, any>)) {
      if (entry) {
        const urls = getUrlsFromEntry(entry);
        if (urls.length > 0) return urls[0];
      }
    }
  }

  // Deep scan for hidden URLs in the Cadmium track object
  const hiddenUrls = findUrlsInObject(t.rawTrack || t);
  if (hiddenUrls.length > 0) {
    const textUrl = hiddenUrls.find((u) => isSubtitleResourceUrl(u));
    return textUrl || hiddenUrls[0];
  }

  if (t.rawTrack && t.rawTrack !== t) {
    return extractTrackUrlUniversal(t.rawTrack);
  }

  return '';
}

function extractCandidateRepresentations(t: any): { profile: string, url: string, isText: boolean }[] {
  if (!t || typeof t !== 'object') return [];
  const candidates: { profile: string, url: string, isText: boolean }[] = [];

  const downloadables = t.ttDownloadables || t.downloadables || t.rawTrack?.ttDownloadables || t.rawTrack?.downloadables;
  if (downloadables && typeof downloadables === 'object') {
    for (const [prof, entry] of Object.entries(downloadables as Record<string, any>)) {
      if (entry) {
        const urls = getUrlsFromEntry(entry);
        if (urls.length > 0) {
          const isText = !entry.isImage && !prof.includes('imsc');
          candidates.push({ profile: prof, url: urls[0], isText });
        }
      }
    }
  }

  if (candidates.length === 0) {
     const url = extractTrackUrlUniversal(t);
     if (url) {
        candidates.push({ profile: 'unknown', url, isText: true });
     }
  }

  return candidates;
}

/** Raw Cadmium track list; normalization happens once, in emitManifestTracks. */
function extractRawCadmiumTracks(): any[] {
  const playerObj = getMainVideoPlayer();
  if (!playerObj?.player) return [];

  const player = playerObj.player;
  if (typeof player.getTimedTextTrackList !== 'function') return [];

  try {
    return player.getTimedTextTrackList() || [];
  } catch {
    return [];
  }
}

function extractTracksFromPerformanceEntries(): any[] {
  try {
    const entries = performance.getEntriesByType('resource');
    const timedTextEntries = entries.filter((e) => isSubtitleResourceUrl(e.name));
    if (timedTextEntries.length === 0) return [];

    return timedTextEntries.map((e, idx) => ({
      trackId: `perf_track_${idx}`,
      languageDescription: `Captured Track ${idx + 1}`,
      language: 'auto',
      url: e.name,
      isClosedCaptions: false,
    }));
  } catch {
    return [];
  }
}

export default defineUnlistedScript({
  main() {
    logger.info('[OWT-BOOT] version=v0.1.1');

    let capturedTracksStore: any[] = [];
    let lastCaptureSource = 'none';
    let tracksRevision = 0;
    let lastTracksFingerprint = '';
    let pollerTimer: ReturnType<typeof setInterval> | null = null;
    let pollerIdleTicks = 0;
    let jsonParseHookInstalled = false;

    const POLL_INTERVAL_MS = 2000;
    // Stop polling after this many consecutive ticks with no tracks at all
    // (10 min); a REQUEST_TRACKS message restarts it on demand.
    const POLL_MAX_IDLE_TICKS = 300;

    // Expose F12 Debug helper directly on MAIN window
    (window as any).__OWT_DEBUG__ = () => {
      const api = getPlayerApi();
      const playerObj = getMainVideoPlayer(api);
      console.group('🔍 OWT Netflix MAIN-World Diagnostic Dump');
      console.log('1. Player API Present:', Boolean(api));
      console.log('2. Main Video Player Object:', playerObj);
      console.log('3. Last Capture Source:', lastCaptureSource);
      console.log('4. Captured Tracks Count:', capturedTracksStore.length);
      console.log('5. Captured Tracks List:', capturedTracksStore);
      console.log('6. Cadmium TimedTextTrackList:', playerObj?.player?.getTimedTextTrackList?.() || []);
      console.log('7. Performance Log TimedText Entries:', extractTracksFromPerformanceEntries());
      console.groupEnd();
      return {
        boot: 'ok',
        version: 'v0.1.1',
        playerApi: Boolean(api),
        tracksCount: capturedTracksStore.length,
        tracksWithUrlCount: capturedTracksStore.filter((t) => Boolean(t.url)).length,
        source: lastCaptureSource,
        tracks: capturedTracksStore,
      };
    };
    (window as any).__OWT_MAIN_DEBUG__ = (window as any).__OWT_DEBUG__;

    function emitManifestTracks(sourceLabel: string, tracks: any[], force: boolean = false): void {
      if (!tracks || tracks.length === 0) return;

      // Single normalization point: candidates + best URL extracted once here.
      const normalizedTracks = tracks.map((t: any) => {
        const candidates = extractCandidateRepresentations(t);
        const bestCandidate = candidates.find(c => c.isText) || candidates[0];
        const url = bestCandidate ? bestCandidate.url : '';
        return {
          id: t.id ?? t.trackId ?? t.language,
          label: t.label || t.languageDescription || t.language,
          language: t.language || t.bcp47 || 'unknown',
          url,
          isCC: Boolean(t.isCC || t.isClosedCaptions || t.isCaption),
          rawTrack: t,
          downloadables: t.downloadables || t.ttDownloadables,
          candidates,
        };
      });

      const fingerprint = normalizedTracks
        .map((t) => `${t.id}:${t.language}:${Boolean(t.url)}`)
        .sort()
        .join('|');

      if (!force && fingerprint === lastTracksFingerprint) return;

      lastTracksFingerprint = fingerprint;
      tracksRevision += 1;
      capturedTracksStore = normalizedTracks;
      lastCaptureSource = sourceLabel;

      const tracksWithUrl = normalizedTracks.filter((t) => Boolean(t.url)).length;
      logger.info(
        `[Step 2 Publish] Captured ${normalizedTracks.length} tracks via ${sourceLabel} ` +
        `(With URLs: ${tracksWithUrl}, Revision: ${tracksRevision})`,
      );

      // Strictly JSON-serializable payload only — Firefox content scripts
      // reject structured-clone payloads containing page objects (DataCloneError),
      // so rawTrack/downloadables must never cross the bridge.
      const safeTracks = normalizedTracks.map(t => ({
        trackId: String(t.id),
        language: String(t.language),
        bcp47: String(t.language),
        url: typeof t.url === 'string' ? t.url : '',
        isCC: Boolean(t.isCC),
        profile: t.candidates?.length > 0 ? t.candidates[0].profile : 'unknown',
        candidates: t.candidates,
      }));

      const payload = {
        channel: 'owt',
        type: 'OWT_NETFLIX_TRACKS_UPDATED',
        revision: tracksRevision,
        tracks: safeTracks,
        source: sourceLabel,
      };

      try {
        window.postMessage(payload, location.origin);
        logger.debug('[Step2 Posted]', {
          revision: payload.revision,
          tracks: payload.tracks.length,
          tracksWithUrl: payload.tracks.filter(t => Boolean(t.url)).length,
          firstTrack: payload.tracks[0],
        });
      } catch (err: any) {
        logger.warn('[Step2 PostMessage failed]', { name: err?.name, message: err?.message });
      }

      // CustomEvent fallback channel for Firefox (payload is a JSON string to
      // avoid DataCloneError entirely); the content script listens for both.
      try {
        document.dispatchEvent(new CustomEvent('owt:tracks-updated', {
          detail: JSON.stringify(payload),
        }));
      } catch (err: any) {
        logger.warn('[CustomEvent dispatch failed]', { name: err?.name, message: err?.message });
      }

      // Mission accomplished: stop burning CPU once text tracks with real
      // download URLs are in hand.
      if (tracksWithUrl > 0) {
        uninstallManifestJsonHook();
        stopPoller();
      }
    }

    function findTimedTextTracks(obj: any, depth = 0): any[] | null {
      if (!obj || typeof obj !== 'object' || depth > 5) return null;
      if (Array.isArray(obj.timedtexttracks) && obj.timedtexttracks.length > 0) {
        return obj.timedtexttracks;
      }
      if (Array.isArray(obj.tracks) && obj.tracks.length > 0 && obj.tracks[0]?.ttDownloadables) {
        return obj.tracks;
      }
      for (const key of Object.keys(obj)) {
        if (obj[key] && typeof obj[key] === 'object') {
          const found = findTimedTextTracks(obj[key], depth + 1);
          if (found) return found;
        }
      }
      return null;
    }

    let originalJsonParse: typeof JSON.parse | null = null;

    function installManifestJsonHook(): void {
      if (jsonParseHookInstalled) return;
      jsonParseHookInstalled = true;
      originalJsonParse = JSON.parse;
      JSON.parse = function (text: string, reviver?: (key: string, value: any) => any) {
        const result = originalJsonParse!.call(this, text, reviver);

        try {
          // Cheap substring gate BEFORE the deep walk: Netflix pages call
          // JSON.parse constantly, and almost no payload contains manifests.
          if (
            typeof text === 'string' &&
            text.includes('timedtexttracks') &&
            result &&
            typeof result === 'object'
          ) {
            const tracks = findTimedTextTracks(result);
            if (tracks && tracks.length > 0) {
              logger.debug('[Manifest Deep Intercept] Found tracks in JSON.parse', tracks.length);
              emitManifestTracks('JSON.parse deep intercept', tracks);
            }
          }
        } catch {
          // ignore parsing error
        }

        return result;
      };
    }

    function uninstallManifestJsonHook(): void {
      if (!jsonParseHookInstalled || !originalJsonParse) return;
      JSON.parse = originalJsonParse;
      originalJsonParse = null;
      jsonParseHookInstalled = false;
      logger.debug('[Manifest JSON.parse hook restored]');
    }

    function installNetworkHooks(): void {
      const originalFetch = window.fetch;
      window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
        const response = await originalFetch.call(this, input, init);

        try {
          const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          if (urlStr.includes('/manifest') || urlStr.includes('/cadmium/')) {
            const clone = response.clone();
            clone.text().then((text) => {
              try {
                if (!text.includes('timedtexttracks')) return;
                const data = JSON.parse(text);
                const tracks = data?.timedtexttracks || data?.result?.timedtexttracks || data?.value?.timedtexttracks;
                if (Array.isArray(tracks) && tracks.length > 0) {
                  emitManifestTracks('fetch response clone', tracks);
                }
              } catch {}
            }).catch(() => {});
          }
        } catch {}

        return response;
      };
    }

    function stopPoller(): void {
      if (pollerTimer !== null) {
        clearInterval(pollerTimer);
        pollerTimer = null;
        logger.debug('[Cadmium poller stopped]', { source: lastCaptureSource, idleTicks: pollerIdleTicks });
      }
    }

    function pollOnce(): boolean {
      try {
        const tracks = extractRawCadmiumTracks();
        const perfTracks = extractTracksFromPerformanceEntries();

        if (tracks.length > 0 && perfTracks.length > 0) {
          const hydratedTracks = tracks.map((t, idx) => {
            const hasOwnUrl =
              Boolean(t.url) || getUrlsFromEntry(t.ttDownloadables || t.downloadables).length > 0;
            if (!hasOwnUrl) {
              const langKey = String(t.bcp47 || t.language || '').toLowerCase();
              const idKey = String(t.trackId || t.id || '').toLowerCase();
              const matchedPerf =
                perfTracks.find(
                  (p) =>
                    (langKey && p.url.toLowerCase().includes(langKey)) ||
                    (idKey && p.url.toLowerCase().includes(idKey)),
                ) || perfTracks[idx % perfTracks.length];
              if (matchedPerf) {
                return { ...t, url: matchedPerf.url };
              }
            }
            return t;
          });
          emitManifestTracks('cadmium_perf_hydrated', hydratedTracks);
          return true;
        } else if (perfTracks.length > 0) {
          emitManifestTracks('performance_network_log', perfTracks);
          return true;
        } else if (tracks.length > 0) {
          emitManifestTracks('cadmium_active_poll', tracks);
          return true;
        }
      } catch (err) {
        logger.warn('[Cadmium poll tick failed]', err);
      }
      return false;
    }

    function startPoller(): void {
      if (pollerTimer !== null) return;
      pollerIdleTicks = 0;
      pollerTimer = setInterval(() => {
        const foundSomething = pollOnce();
        if (foundSomething) {
          pollerIdleTicks = 0;
          return;
        }
        pollerIdleTicks += 1;
        if (pollerIdleTicks >= POLL_MAX_IDLE_TICKS) {
          logger.debug('[Cadmium poller idle timeout — stopping until next REQUEST_TRACKS]');
          stopPoller();
        }
      }, POLL_INTERVAL_MS);
    }

    installManifestJsonHook();
    installNetworkHooks();
    startPoller();

    // --- Content Script PostMessage Handlers ---
    window.addEventListener('message', async (event) => {
      if (event.source !== window) return;
      if (event.origin !== location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.source && data.source !== CONTENT_SOURCE) return;

      if (data.type === 'OWT_NETFLIX_REQUEST_TRACKS') {
        // Re-arm discovery: navigation may have invalidated previous captures.
        installManifestJsonHook();
        startPoller();

        if (capturedTracksStore.length > 0) {
          emitManifestTracks('re-query', capturedTracksStore, true);
        } else {
          pollOnce();
        }
        return;
      }

      if (data.type === 'OWT_NETFLIX_HYDRATE_TRACK') {
        const { trackId, performSeek, txId } = data;
        const api = getPlayerApi();
        const mainCandidate = getMainVideoPlayer(api);

        if (!mainCandidate?.player) {
          post('OWT_NETFLIX_HYDRATE_RESULT', { txId, ok: false, reason: 'api-unavailable' });
          return;
        }

        const player = mainCandidate.player;
        if (typeof player.getTimedTextTrackList !== 'function' || typeof player.setTimedTextTrack !== 'function') {
          post('OWT_NETFLIX_HYDRATE_RESULT', { txId, ok: false, reason: 'unsupported-api' });
          return;
        }

        try {
          const list = player.getTimedTextTrackList() || [];
          const match = list.find(
            (t: any) =>
              t.trackId === trackId ||
              t.id === trackId ||
              t.bcp47 === trackId ||
              t.language === trackId,
          );

          if (match) {
            player.setTimedTextTrack(match);
            logger.debug(`Cadmium setTimedTextTrack called for ${trackId}`);

            if (performSeek) {
              const time = Number(player.getCurrentTime?.() ?? -1);
              if (time >= 0) {
                player.seek(time);
                logger.debug(`Cadmium player.seek(${time}) executed for hydration transaction ${txId}`);
              }
            }

            const explicitUrl = extractTrackUrlUniversal(match);
            if (explicitUrl) {
               logger.debug('Hydration found explicit URL via deep scan', explicitUrl.substring(0, 80));
               post('OWT_NETFLIX_HYDRATE_RESULT', { txId, ok: true, url: explicitUrl });
               return;
            }

            const hydrationStartTime = performance.now();

            setTimeout(() => {
              const entries = performance.getEntriesByType('resource');
              const recentEntry = entries
                .reverse()
                .find((e) => e.startTime >= hydrationStartTime - 100 && looksLikeTrackUrl(e.name));

              const capturedUrl = recentEntry ? recentEntry.name : '';
              logger.debug('[Hydration Network Match]', {
                txId,
                trackId,
                capturedUrl: capturedUrl ? capturedUrl.substring(0, 80) + '...' : 'none',
              });

              if (capturedUrl && capturedTracksStore.length > 0) {
                const updatedTracks = capturedTracksStore.map((t) => {
                  if (
                    String(t.id) === String(trackId) ||
                    String(t.rawTrack?.trackId) === String(trackId) ||
                    String(t.language) === String(trackId)
                  ) {
                    return { ...t, url: capturedUrl };
                  }
                  return t;
                });
                emitManifestTracks('hydration_network_bind', updatedTracks, true);
              }

              post('OWT_NETFLIX_HYDRATE_RESULT', { txId, ok: true, url: capturedUrl });
            }, 600);
          } else {
            post('OWT_NETFLIX_HYDRATE_RESULT', { txId, ok: false, reason: 'track-not-found' });
          }
        } catch (err: any) {
          post('OWT_NETFLIX_HYDRATE_RESULT', { txId, ok: false, reason: err?.message || 'exception' });
        }
        return;
      }

      if (data.type === 'OWT_NETFLIX_FETCH_TTML') {
        const requestId = data.requestId;
        const url = data.url;
        if (typeof requestId !== 'string' || typeof url !== 'string') return;

        logger.debug('[Step 3 fetch begin]', { requestId, url: url.length > 50 ? url.substring(0, 50) + '...' : url });

        try {
          const fetchPromise = fetch(url, {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
          }).catch((err) => {
            logger.warn('[Step 3 FAIL] Fetch explicitly rejected:', err);
            return null;
          });

          const timeoutPromise = new Promise<null>((resolve) => {
            setTimeout(() => {
              logger.warn('[Step 3 FAIL] Fetch timed out after 10000ms');
              resolve(null);
            }, 10000);
          });

          let response = await Promise.race([fetchPromise, timeoutPromise]);

          if (!response || !response.ok) {
            logger.warn(`[Step 3 FAIL] Fetch HTTP ${response?.status || 'Network Error'} for URL: ${url}`);
            post('OWT_NETFLIX_TTML_RESULT', {
              requestId,
              ok: false,
              status: response?.status || 0,
              error: `HTTP ${response?.status || 'network error'}`,
              url,
            });
            return;
          }
          const contentType = response.headers.get('content-type') || '';
          const arrayBuffer = await response.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const detectedFormat = detectSubtitleFormat(bytes);

          let xml = '';
          if (detectedFormat === 'ttml' || detectedFormat === 'webvtt') {
            xml = extractTextFromMp4Segment(bytes) || new TextDecoder('utf-8').decode(bytes);
          }

          logger.info('[Step 3 OK] Downloaded track', {
            httpStatus: response.status,
            contentType,
            bodyBytes: bytes.byteLength,
            detectedFormat,
            magic: readAsciiPrefix(bytes, 32),
          });

          post('OWT_NETFLIX_TTML_RESULT', {
            requestId,
            ok: true,
            status: response.status,
            contentType,
            detectedFormat,
            xml,
            url,
          });
        } catch (err: any) {
          logger.warn(`[Step 3 FAIL] Exception during fetch: ${err?.message}`);
          post('OWT_NETFLIX_TTML_RESULT', {
            requestId,
            ok: false,
            status: 0,
            error: err?.message || 'fetch failed',
            url,
          });
        }
      }
    });
  },
});

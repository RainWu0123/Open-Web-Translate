const MAIN_SOURCE = 'owt-netflix-main';
const CONTENT_SOURCE = 'owt-netflix-content';

function post(type: string, payload: Record<string, unknown> = {}): void {
  window.postMessage(
    {
      source: MAIN_SOURCE,
      type,
      ...payload,
    },
    '*',
  );
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

function extractTrackUrlUniversal(t: any): string {
  if (!t || typeof t !== 'object') return '';
  if (typeof t.url === 'string' && t.url.startsWith('http')) return t.url;
  if (typeof t.cdnUrl === 'string' && t.cdnUrl.startsWith('http')) return t.cdnUrl;

  if (Array.isArray(t.urls) && typeof t.urls[0] === 'string' && t.urls[0].startsWith('http')) {
    return t.urls[0];
  }
  if (Array.isArray(t.downloadUrls) && typeof t.downloadUrls[0] === 'string' && t.downloadUrls[0].startsWith('http')) {
    return t.downloadUrls[0];
  }

  const downloadables = t.downloadables || t.ttDownloadables || t.rawTrack?.downloadables || t.rawTrack?.ttDownloadables;
  if (downloadables && typeof downloadables === 'object') {
    const PREFERRED_TEXT_PROFILES = [
      'dfxp-ls-sdh',
      'simplesdh',
      'webvtt-lssdh',
      'dfxp-teletext-dfxp-ls-sdh',
      'dfxp-ls',
      'webvtt-ls',
    ];
    for (const prof of PREFERRED_TEXT_PROFILES) {
      const entry = downloadables[prof];
      if (entry) {
        const u = entry.downloadUrls?.[0] || entry.urls?.[0] || entry.url;
        if (typeof u === 'string' && u.startsWith('http')) return u;
      }
    }
    for (const entry of Object.values(downloadables as Record<string, any>)) {
      if (entry && !entry.isImage) {
        const u = entry.downloadUrls?.[0] || entry.urls?.[0] || entry.url;
        if (typeof u === 'string' && u.startsWith('http')) return u;
      }
    }
    for (const entry of Object.values(downloadables as Record<string, any>)) {
      if (entry) {
        const u = entry.downloadUrls?.[0] || entry.urls?.[0] || entry.url;
        if (typeof u === 'string' && u.startsWith('http')) return u;
      }
    }
  }

  if (t.rawTrack && t.rawTrack !== t) {
    return extractTrackUrlUniversal(t.rawTrack);
  }

  return '';
}

function extractTracksFromCadmiumPlayer(): any[] {
  const api = getPlayerApi();
  const playerObj = getMainVideoPlayer(api);
  if (!playerObj?.player) return [];

  const player = playerObj.player;
  if (typeof player.getTimedTextTrackList !== 'function') return [];

  try {
    const rawList = player.getTimedTextTrackList() || [];
    return rawList.map((t: any) => {
      const url = extractTrackUrlUniversal(t);
      return {
        id: t.trackId || t.id || t.bcp47 || t.language,
        label: t.label || t.languageDescription || t.language,
        language: t.bcp47 || t.language || 'unknown',
        url,
        isCC: Boolean(t.isClosedCaptions || t.isCaption),
        rawTrack: t,
        downloadables: t.downloadables || t.ttDownloadables,
      };
    });
  } catch {
    return [];
  }
}

function extractTracksFromPerformanceEntries(): any[] {
  try {
    const entries = performance.getEntriesByType('resource');
    const timedTextEntries = entries.filter(
      (e) =>
        e.name.includes('timedtext') ||
        e.name.includes('.dfxp') ||
        (e.name.includes('nflxvideo.net') && (e.name.includes('?o=') || e.name.includes('/tt/'))),
    );
    if (timedTextEntries.length === 0) return [];

    return timedTextEntries.map((e, idx) => ({
      id: `perf_track_${idx}`,
      label: `Captured Track ${idx + 1}`,
      language: 'auto',
      url: e.name,
      isCC: false,
      rawTrack: { url: e.name },
      downloadables: {
        dfxp: {
          isImage: false,
          downloadUrls: [e.name],
          urls: [e.name],
        },
      },
    }));
  } catch {
    return [];
  }
}

export default defineUnlistedScript({
  main() {
    console.log('[OWT-MAIN] netflix-main.js injected into MAIN world successfully!');

    let capturedTracksStore: any[] = [];
    let lastCaptureSource = 'none';

    function emitManifestTracks(sourceLabel: string, tracks: any[]): void {
      if (!tracks || tracks.length === 0) return;

      const normalizedTracks = tracks.map((t: any) => {
        const url = extractTrackUrlUniversal(t);
        return {
          id: t.id || t.trackId || t.language,
          label: t.label || t.languageDescription || t.language,
          language: t.language || t.bcp47 || 'unknown',
          url,
          isCC: Boolean(t.isCC || t.isClosedCaptions),
          rawTrack: t,
          downloadables: t.downloadables || t.ttDownloadables,
        };
      });

      capturedTracksStore = normalizedTracks;
      lastCaptureSource = sourceLabel;
      console.log(
        `[OWT-MAIN] [Step 2 OK] Captured ${normalizedTracks.length} tracks via ${sourceLabel} (With URLs: ${
          normalizedTracks.filter((t) => Boolean(t.url)).length
        })`,
      );
      post('OWT_NETFLIX_MANIFEST_TRACKS', { tracks: normalizedTracks, source: sourceLabel });
    }

    // Expose F12 Debug helper in MAIN world
    (window as any).__OWT_MAIN_DEBUG__ = () => {
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
        playerApi: Boolean(api),
        tracksCount: capturedTracksStore.length,
        tracksWithUrlCount: capturedTracksStore.filter((t) => Boolean(t.url)).length,
        source: lastCaptureSource,
        tracks: capturedTracksStore,
      };
    };

    function installManifestJsonHook(): void {
      const originalParse = JSON.parse;
      JSON.parse = function (text: string, reviver?: (key: string, value: any) => any) {
        const result = originalParse.call(this, text, reviver);

        try {
          if (result && typeof result === 'object') {
            let tracks: any[] | null = null;

            if (Array.isArray(result.timedtexttracks)) {
              tracks = result.timedtexttracks;
            } else if (result.result?.timedtexttracks && Array.isArray(result.result.timedtexttracks)) {
              tracks = result.result.timedtexttracks;
            } else if (result.profiles && Array.isArray(result.tracks)) {
              tracks = result.tracks;
            }

            if (tracks && tracks.length > 0) {
              emitManifestTracks('JSON.parse intercept', tracks);
            }
          }
        } catch {
          // ignore parsing error
        }

        return result;
      };
    }

    function installNetworkHooks(): void {
      const originalFetch = window.fetch;
      window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
        const response = await originalFetch.call(this, input, init);

        try {
          const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          if (urlStr.includes('/manifest') || urlStr.includes('/cadmium/') || urlStr.includes('timedtext')) {
            const clone = response.clone();
            clone.text().then((text) => {
              try {
                const data = JSON.parse(text);
                const tracks = data?.timedtexttracks || data?.result?.timedtexttracks;
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

    function startCadmiumPlayerPoller(): void {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts++;
        if (attempts > 60 && capturedTracksStore.length > 0 && capturedTracksStore.some((t) => Boolean(t.url))) {
          clearInterval(timer);
          return;
        }

        try {
          const tracks = extractTracksFromCadmiumPlayer();
          const perfTracks = extractTracksFromPerformanceEntries();

          if (tracks.length > 0 && perfTracks.length > 0) {
            const hydratedTracks = tracks.map((t, idx) => {
              if (!t.url) {
                const matchedPerf =
                  perfTracks.find(
                    (p) =>
                      p.url.toLowerCase().includes(t.language.toLowerCase()) ||
                      p.url.toLowerCase().includes(t.id.toLowerCase()),
                  ) || perfTracks[idx % perfTracks.length];
                if (matchedPerf) {
                  return { ...t, url: matchedPerf.url };
                }
              }
              return t;
            });
            emitManifestTracks('cadmium_perf_hydrated', hydratedTracks);
          } else if (perfTracks.length > 0) {
            emitManifestTracks('performance_network_log', perfTracks);
          } else if (tracks.length > 0) {
            emitManifestTracks('cadmium_active_poll', tracks);
          }
        } catch {}
      }, 1000);
    }

    installManifestJsonHook();
    installNetworkHooks();
    startCadmiumPlayerPoller();

    // --- Content Script PostMessage Handlers ---
    window.addEventListener('message', async (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.source && data.source !== CONTENT_SOURCE) return;

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
            console.log(`[OWT-MAIN] Cadmium setTimedTextTrack called for ${trackId}`);

            if (performSeek) {
              const time = Number(player.getCurrentTime?.() ?? -1);
              if (time >= 0) {
                player.seek(time);
                console.log(`[OWT-MAIN] Cadmium player.seek(${time}) executed for hydration transaction ${txId}`);
              }
            }
            post('OWT_NETFLIX_HYDRATE_RESULT', { txId, ok: true });
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

        try {
          let response = await fetch(url, { credentials: 'include' }).catch(() => null);
          if (!response || !response.ok) {
            response = await fetch(url, { mode: 'cors' }).catch(() => null);
          }

          if (!response || !response.ok) {
            console.warn(`[OWT-MAIN] [Step 3 FAIL] TTML Fetch HTTP ${response?.status || 'Network Error'} for URL: ${url}`);
            post('OWT_NETFLIX_TTML_RESULT', {
              requestId,
              ok: false,
              error: `HTTP ${response?.status || 'network error'}`,
              url,
            });
            return;
          }
          const xml = await response.text();
          console.log(`[OWT-MAIN] [Step 3 OK] Downloaded ${xml.length} bytes TTML XML`);
          post('OWT_NETFLIX_TTML_RESULT', {
            requestId,
            ok: true,
            xml,
            url,
          });
        } catch (err: any) {
          console.warn(`[OWT-MAIN] [Step 3 FAIL] Exception during fetch: ${err?.message}`);
          post('OWT_NETFLIX_TTML_RESULT', {
            requestId,
            ok: false,
            error: err?.message || 'fetch failed',
            url,
          });
        }
      }
    });
  },
});

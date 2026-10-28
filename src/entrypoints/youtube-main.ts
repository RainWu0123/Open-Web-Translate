/**
 * youtube-main — MAIN-world entrypoint for YouTube player control.
 *
 * Interacts directly with the YouTube HTML5 video player (#movie_player)
 * in the page context to discover native caption tracks and switch language
 * without relying on UI clicks.
 */
import { YT_BRIDGE, postToContent, trackSelectionMatches, findExactResponseTrack, type YouTubeTrack } from '@/adapters/youtube/youtube-bridge';

export default defineUnlistedScript({
  main() {
    function getPlayer(): any {
      return (
        document.getElementById('movie_player') ||
        document.querySelector('.html5-video-player') ||
        (window as any).movie_player
      );
    }

    const observedTimedTextUrls = new Map<string, string>();
    const observedTimedTextPayloads = new Map<string, string>();
    let observedVideoId: string | null = null;

    function getCurrentVideoId(): string | null {
      try {
        return new URLSearchParams(window.location.search).get('v');
      } catch {
        return null;
      }
    }

    function syncVideoScope(): void {
      const currentVid = getCurrentVideoId();
      if (currentVid && observedVideoId && currentVid !== observedVideoId) {
        observedTimedTextUrls.clear();
        observedTimedTextPayloads.clear();
      }
      if (currentVid) {
        observedVideoId = currentVid;
      }
    }

    function findByLang<T>(map: Map<string, T>, languageCode?: string): T | undefined {
      if (!languageCode) return undefined;
      if (map.has(languageCode)) return map.get(languageCode);
      for (const [key, value] of map.entries()) {
        if (trackSelectionMatches(key, languageCode) || trackSelectionMatches(languageCode, key)) {
          return value;
        }
      }
      return undefined;
    }

    function recordTimedTextUrl(rawUrl: string, broadcast = true, payloadText?: string): void {
      try {
        if (!rawUrl || !rawUrl.includes('/api/timedtext')) return;
        syncVideoScope();
        const parsed = new URL(rawUrl, window.location.origin);
        // Ignore YouTube's own machine-translated tracks (tlang) so we always capture source tracks
        if (parsed.searchParams.has('tlang')) return;
        const urlVid = parsed.searchParams.get('v');
        const currentVid = getCurrentVideoId();
        if (urlVid && currentVid && urlVid !== currentVid) return;

        const lang = parsed.searchParams.get('lang');
        if (!lang) return;
        if (payloadText && payloadText.trim().length > 0) {
          observedTimedTextPayloads.set(lang, payloadText);
        }
        const prev = observedTimedTextUrls.get(lang);
        const normalized = parsed.toString();
        if (prev !== normalized) {
          observedTimedTextUrls.set(lang, normalized);
          if (broadcast) broadcastTracks();
        }
      } catch {
        // ignore URL parse errors
      }
    }

    function scanPerformanceTimedTextUrls(): void {
      try {
        if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return;
        syncVideoScope();
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        for (const entry of resources) {
          if (entry?.name && entry.name.includes('/api/timedtext')) {
            recordTimedTextUrl(entry.name, false);
          }
        }
      } catch {
        // ignore performance API errors
      }
    }

    function installTimedTextNetworkObserver(): void {
      const win = window as any;
      if (win.__owtYtNetworkObserved) return;
      win.__owtYtNetworkObserved = true;

      scanPerformanceTimedTextUrls();

      try {
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
          try {
            const urlStr = String(url);
            if (urlStr.includes('/api/timedtext')) {
              recordTimedTextUrl(urlStr);
              this.addEventListener('load', () => {
                try {
                  if (typeof this.responseText === 'string' && this.responseText.trim().length > 0) {
                    recordTimedTextUrl(urlStr, false, this.responseText);
                  }
                } catch {}
              });
            }
          } catch {}
          return (origOpen as any).call(this, method, url, ...rest);
        };
      } catch {}

      try {
        if (typeof window.fetch === 'function') {
          const origFetch = window.fetch;
          window.fetch = function (this: any, input: RequestInfo | URL, init?: RequestInit) {
            const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url || '';
            try {
              if (urlStr.includes('/api/timedtext')) {
                recordTimedTextUrl(urlStr);
              }
            } catch {}
            const promise = origFetch.call(this, input, init);
            if (urlStr.includes('/api/timedtext')) {
              promise
                .then((res) => res.clone().text())
                .then((text) => {
                  if (text && text.trim().length > 0) {
                    recordTimedTextUrl(urlStr, false, text);
                  }
                })
                .catch(() => {});
            }
            return promise;
          };
        }
      } catch {}
    }

    function getCaptionTracksFromPlayerResponse(player: any): Array<{
      languageCode?: string;
      vssId?: string;
      kind?: string;
      baseUrl?: string;
      name?: { simpleText?: string; runs?: Array<{ text?: string }> };
    }> {
      try {
        const currentVid = getCurrentVideoId();
        const flexy = document.querySelector('ytd-watch-flexy') as any;
        const candidates = [
          player?.getPlayerResponse?.(),
          flexy?.playerData?.playerResponse,
          flexy?.playerData,
          (window as any).ytInitialPlayerResponse,
        ];
        for (const resp of candidates) {
          if (!resp) continue;
          const respVid = resp?.videoDetails?.videoId;
          if (currentVid && respVid && respVid !== currentVid) continue;
          const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (Array.isArray(tracks) && tracks.length > 0) {
            return tracks;
          }
        }
        return [];
      } catch {
        return [];
      }
    }

    function resolveTrackBaseUrl(languageCode?: string, kind?: string, vssId?: string, directUrl?: string): string | undefined {
      scanPerformanceTimedTextUrls();
      if (directUrl && typeof directUrl === 'string') {
        return directUrl;
      }
      const player = getPlayer();
      const responseTracks = getCaptionTracksFromPlayerResponse(player);
      if (responseTracks.length === 0) return undefined;

      if (vssId) {
        const exact = findExactResponseTrack(responseTracks, languageCode, kind, vssId);
        if (exact?.baseUrl) return exact.baseUrl;
        return undefined;
      }
      const matchingKind = responseTracks.filter(rt => rt.languageCode === languageCode && (rt.kind || '') === (kind || ''));
      const exact = findExactResponseTrack(responseTracks, languageCode, kind);
      if (exact?.baseUrl) return exact.baseUrl;
      if (matchingKind.length > 1) return undefined;

      const sameLanguage = responseTracks.filter(rt => rt.languageCode === languageCode);
      return sameLanguage.length === 1 ? sameLanguage[0]?.baseUrl || findByLang(observedTimedTextUrls, languageCode) : undefined;
    }

    function getTracklist(): YouTubeTrack[] {
      try {
        syncVideoScope();
        const player = getPlayer();
        if (!player || typeof player.getOption !== 'function') return [];
        player.loadModule?.('captions');
        const list = player.getOption('captions', 'tracklist') || [];
        if (list.length > 0) {
          return list.map((t: any, idx: number) => {
            const baseUrl = resolveTrackBaseUrl(t.languageCode, t.kind, t.vss_id || t.vssId, t.baseUrl);
            return {
              id: t.vss_id || t.vssId || `${t.languageCode || 'unknown'}:${t.kind || 'standard'}:${idx}`,
              languageCode: t.languageCode,
              label: t.languageName || t.displayName || t.name || t.languageCode,
              kind: t.kind,
              isDefault: Boolean(t.is_default),
              ...(baseUrl ? { baseUrl } : {}),
            };
          });
        }

        const responseTracks = getCaptionTracksFromPlayerResponse(player);
        return responseTracks.map((rt, idx) => {
          const label =
            rt.name?.simpleText ||
            rt.name?.runs?.map((r) => r.text || '').join('') ||
            rt.languageCode ||
            String(idx);
          const sameLanguage = responseTracks.filter(other => other.languageCode === rt.languageCode);
          const baseUrl = rt.baseUrl || (sameLanguage.length === 1 ? findByLang(observedTimedTextUrls, rt.languageCode) : undefined);
          return {
            id: rt.vssId || `${rt.languageCode || 'unknown'}:${rt.kind || 'standard'}:${idx}`,
            languageCode: rt.languageCode || 'auto',
            label,
            kind: rt.kind,
            ...(baseUrl ? { baseUrl } : {}),
          };
        });
      } catch {
        return [];
      }
    }

    function getActiveTrack(): string | null {
      try {
        const player = getPlayer();
        if (!player || typeof player.getOption !== 'function') return null;
        const current = player.getOption('captions', 'track');
        return current?.languageCode || null;
      } catch {
        return null;
      }
    }

    function findOriginalTrack(list: any[], targetLang?: string): any {
      if (!list || list.length === 0) return null;

      const targetPrefix = targetLang?.split('-')[0]?.toLowerCase();

      // 1. YouTube marks the uploader's original default track with is_default: true
      const defaultNonAsr = list.find((t: any) => t.is_default && t.kind !== 'asr');
      if (defaultNonAsr) {
        // If targetLang is specified, and defaultNonAsr matches targetLang, but other author-uploaded non-target tracks exist:
        if (targetPrefix && defaultNonAsr.languageCode?.toLowerCase().startsWith(targetPrefix)) {
          const nonTargetAuthor = list.find(
            (t: any) => t.kind !== 'asr' && !t.languageCode?.toLowerCase().startsWith(targetPrefix),
          );
          if (nonTargetAuthor) return nonTargetAuthor;
        }
        return defaultNonAsr;
      }

      // 2. Author-uploaded tracks (kind !== 'asr'):
      // Prioritize tracks that do NOT match targetLang (because targetLang is the translation destination)
      const authorTracks = list.filter((t: any) => t.kind !== 'asr');
      if (authorTracks.length > 0) {
        if (targetPrefix) {
          const nonTargetAuthor = authorTracks.find(
            (t: any) => !t.languageCode?.toLowerCase().startsWith(targetPrefix),
          );
          if (nonTargetAuthor) return nonTargetAuthor;
        }
        return authorTracks[0];
      }

      // 3. ASR tracks: prioritize non-target language if available
      if (targetPrefix) {
        const nonTargetAsr = list.find((t: any) => !t.languageCode?.toLowerCase().startsWith(targetPrefix));
        if (nonTargetAsr) return nonTargetAsr;
      }

      const anyDefault = list.find((t: any) => t.is_default);
      if (anyDefault) return anyDefault;

      // 4. Fallback to first track in list
      return list[0];
    }

    function setTrack(languageCode: string, targetLanguage?: string): { ok: boolean; expectedLanguageCode?: string } {
      try {
        const player = getPlayer();
        if (!player || typeof player.setOption !== 'function') return { ok: false };
        player.loadModule?.('captions');

        // Aggressively turn off YouTube auto-translation so YouTube does not translate captions into user UI language
        try {
          player.setOption('captions', 'translationLanguage', null);
          player.setOption('captions', 'translationLanguage', {});
          player.setOption('captions', 'translationLanguages', []);
        } catch {}

        const list = player.getOption('captions', 'tracklist') || [];

        if (!languageCode || languageCode === 'auto') {
          // Find first native original track
          const preferred = findOriginalTrack(list, targetLanguage);
          if (preferred) {
            player.setOption('captions', 'track', preferred);
            return { ok: true, expectedLanguageCode: preferred.languageCode };
          }
          return { ok: false };
        }

        const match = list.find(
          (t: any) =>
            t.languageCode === languageCode ||
            t.languageCode?.startsWith(languageCode) ||
            t.vss_id?.includes(languageCode),
        );
        if (match) {
          player.setOption('captions', 'track', match);
          return { ok: true, expectedLanguageCode: match.languageCode };
        } else {
          // An explicit user choice must never silently select another track.
          return { ok: false };
        }
      } catch {
        return { ok: false };
      }
    }

    async function fetchTimedTextPayload(languageCode?: string, explicitBaseUrl?: string, strictTrackId?: string): Promise<{ ok: boolean; payload?: string; languageCode?: string }> {
      syncVideoScope();
      const requestVideoId = getCurrentVideoId();
      const isCurrentVideo = () => Boolean(requestVideoId) && getCurrentVideoId() === requestVideoId;
      if (!isCurrentVideo()) return { ok: false };
      const tracks = getTracklist();
      if (strictTrackId) {
        const exact = tracks.find(t => t.id === strictTrackId);
        if (!exact?.baseUrl || !requestVideoId) return { ok: false };
        try {
          const url = new URL(exact.baseUrl, window.location.origin);
          const trackVideoId = url.searchParams.get('v');
          if (trackVideoId && trackVideoId !== requestVideoId) return { ok: false };
          url.searchParams.delete('tlang');
          url.searchParams.set('fmt', 'json3');
          const response = await fetch(url.toString(), { credentials: 'include' });
          const payload = response.ok ? await response.text() : '';
          if (!isCurrentVideo() || !payload.trim()) return { ok: false };
          return { ok: true, payload, languageCode: exact.languageCode };
        } catch { return { ok: false }; }
      }
      const matchedTrack =
        tracks.find((t) => languageCode && (t.languageCode === languageCode || t.id === languageCode)) ||
        tracks.find((t) => languageCode && trackSelectionMatches(t.languageCode, languageCode)) ||
        tracks.find((t) => Boolean(t.baseUrl));

      const resolvedLang = matchedTrack?.languageCode || languageCode;

      const cachedPayload = findByLang(observedTimedTextPayloads, resolvedLang);
      if (isCurrentVideo() && cachedPayload && cachedPayload.trim().length > 0) {
        return { ok: true, payload: cachedPayload, languageCode: resolvedLang };
      }

      const rawUrl =
        findByLang(observedTimedTextUrls, resolvedLang) ||
        explicitBaseUrl ||
        matchedTrack?.baseUrl;

      if (!rawUrl) {
        return { ok: false, languageCode: resolvedLang };
      }

      try {
        const urlVideoId = new URL(rawUrl, window.location.origin).searchParams.get('v');
        if (urlVideoId && urlVideoId !== requestVideoId) return { ok: false, languageCode: resolvedLang };
      } catch {
        return { ok: false, languageCode: resolvedLang };
      }

      try {
        const json3Url = new URL(rawUrl, window.location.origin);
        json3Url.searchParams.delete('tlang');
        json3Url.searchParams.set('fmt', 'json3');

        const res = await fetch(json3Url.toString(), { credentials: 'include' });
        if (!isCurrentVideo()) return { ok: false };
        if (res.ok) {
          const text = await res.text();
          if (!isCurrentVideo()) return { ok: false };
          if (text && text.trim().length > 0) {
            if (resolvedLang) observedTimedTextPayloads.set(resolvedLang, text);
            return { ok: true, payload: text, languageCode: resolvedLang };
          }
        }
      } catch {
        // Fall through to raw URL attempt
      }

      if (!isCurrentVideo()) return { ok: false };

      try {
        const fallbackUrl = new URL(rawUrl, window.location.origin);
        fallbackUrl.searchParams.delete('tlang');
        const res = await fetch(fallbackUrl.toString(), { credentials: 'include' });
        if (!isCurrentVideo()) return { ok: false };
        if (res.ok) {
          const text = await res.text();
          if (!isCurrentVideo()) return { ok: false };
          if (text && text.trim().length > 0) {
            if (resolvedLang) observedTimedTextPayloads.set(resolvedLang, text);
            return { ok: true, payload: text, languageCode: resolvedLang };
          }
        }
      } catch {
        // Ignore fetch error
      }

      // If the player is still completing its own timedtext XHR (which includes the pot token),
      // wait briefly for the XHR interceptor to populate observedTimedTextPayloads.
      const waitDeadline = Date.now() + 900;
      while (Date.now() < waitDeadline) {
        if (!isCurrentVideo()) return { ok: false };
        const latePayload = findByLang(observedTimedTextPayloads, resolvedLang);
        if (latePayload && latePayload.trim().length > 0) {
          return { ok: true, payload: latePayload, languageCode: resolvedLang };
        }
        await new Promise((r) => setTimeout(r, 75));
      }

      return { ok: false, languageCode: resolvedLang };
    }

    function broadcastTracks() {
      const tracks = getTracklist();
      const current = getActiveTrack();
      postToContent(YT_BRIDGE.messageType.TRACKS_UPDATED, {
        tracks,
        selectedTrackId: current,
      });
    }

    const processedCommandIds = new Set<string>();
    const rememberCommand = (requestId: string): boolean => {
      if (processedCommandIds.has(requestId)) return false;
      processedCommandIds.add(requestId);
      if (processedCommandIds.size > 100) {
        processedCommandIds.delete(processedCommandIds.values().next().value as string);
      }
      return true;
    };

    const handleCommand = async (data: any) => {
      if (!data || data.source !== YT_BRIDGE.CONTENT_SOURCE) return;

      if (data.type === YT_BRIDGE.messageType.REQUEST_TRACKS) {
        broadcastTracks();
      } else if (data.type === YT_BRIDGE.messageType.SET_TRACK) {
        const requestId = typeof data.requestId === 'string' ? data.requestId : '';
        if (!requestId || !rememberCommand(requestId)) return;
        const outcome = setTrack(data.languageCode, data.targetLanguage);
        let selectedTrackId = getActiveTrack();
        const deadline = Date.now() + 1200;
        while (outcome.ok && !trackSelectionMatches(selectedTrackId, outcome.expectedLanguageCode) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          selectedTrackId = getActiveTrack();
        }
        const confirmed = outcome.ok && trackSelectionMatches(selectedTrackId, outcome.expectedLanguageCode);
        broadcastTracks();
        postToContent(YT_BRIDGE.messageType.TRACK_SET_RESULT, {
          ok: confirmed,
          requestId,
          languageCode: data.languageCode,
          selectedTrackId,
        });
      } else if (data.type === YT_BRIDGE.messageType.FETCH_TIMEDTEXT) {
        const requestId = typeof data.requestId === 'string' ? data.requestId : '';
        if (!requestId || !rememberCommand(requestId)) return;
        const result = await fetchTimedTextPayload(data.languageCode, data.baseUrl, data.strictTrackId);
        postToContent(YT_BRIDGE.messageType.TIMEDTEXT_RESULT, {
          requestId,
          ok: result.ok,
          languageCode: result.languageCode,
          payload: result.payload || '',
        });
      }
    };

    installTimedTextNetworkObserver();

    window.addEventListener('message', (event) => {
      // Ignore messages posted by other frames (embedded ads/iframes).
      if (event.source !== window) return;
      void handleCommand(event.data);
    });

    window.addEventListener(YT_BRIDGE.MAIN_EVENT, (event: any) => {
      try {
        const data = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
        void handleCommand(data);
      } catch {}
    });

    function ensureTracksDiscovered(retries = 6, delay = 500) {
      const tracks = getTracklist();
      if (tracks.length > 0) {
        broadcastTracks();
      } else if (retries > 0) {
        setTimeout(() => ensureTracksDiscovered(retries - 1, delay * 1.3), delay);
      }
    }

    // Handle SPA navigation on YouTube
    window.addEventListener('yt-navigate-finish', () => {
      syncVideoScope();
      ensureTracksDiscovered();
    });

    // Initial boot discovery
    ensureTracksDiscovered();
  },
});

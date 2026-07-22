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

function extractTracksFromCadmiumPlayer(): any[] {
  const api = getPlayerApi();
  const playerObj = getMainVideoPlayer(api);
  if (!playerObj?.player) return [];

  const player = playerObj.player;
  if (typeof player.getTimedTextTrackList !== 'function') return [];

  try {
    const rawList = player.getTimedTextTrackList() || [];
    return rawList.map((t: any) => ({
      id: t.trackId || t.id || t.bcp47 || t.language,
      label: t.label || t.languageDescription || t.language,
      language: t.bcp47 || t.language || 'unknown',
      isCC: Boolean(t.isClosedCaptions || t.isCaption),
      rawTrack: t,
      downloadables: t.downloadables,
    }));
  } catch {
    return [];
  }
}

export default defineUnlistedScript({
  main() {
    console.log('[OWT-MAIN] netflix-main.js injected into MAIN world');

    let manifestTracksCaptured = false;

    function emitManifestTracks(sourceLabel: string, tracks: any[]): void {
      if (!tracks || tracks.length === 0) return;
      manifestTracksCaptured = true;
      console.log(`[OWT-MAIN] Captured ${tracks.length} tracks via ${sourceLabel}`);
      post('OWT_NETFLIX_MANIFEST_TRACKS', { tracks, source: sourceLabel });
    }

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
        if (attempts > 30 && manifestTracksCaptured) {
          clearInterval(timer);
          return;
        }

        try {
          const tracks = extractTracksFromCadmiumPlayer();
          if (tracks.length > 0) {
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
            post('OWT_NETFLIX_TTML_RESULT', {
              requestId,
              ok: false,
              error: `HTTP ${response?.status || 'network error'}`,
              url,
            });
            return;
          }
          const xml = await response.text();
          post('OWT_NETFLIX_TTML_RESULT', {
            requestId,
            ok: true,
            xml,
            url,
          });
        } catch (err: any) {
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

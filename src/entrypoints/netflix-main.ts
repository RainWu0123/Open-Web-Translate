/**
 * Netflix MAIN-world probe script.
 *
 * Runs in the Netflix page realm to access Cadmium playerApp APIs & JSON manifest intercept.
 * Posts messages to the content script via window.postMessage.
 */
export default defineContentScript({
  matches: ['*://*.netflix.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const SOURCE = 'owt-netflix-main';
    console.log('[OWT-MAIN] Netflix MAIN world probe initialized');

    window.postMessage(
      {
        source: SOURCE,
        type: 'OWT_TEST_PING',
        payload: { ts: Date.now(), world: 'MAIN' },
      },
      '*',
    );

    interface ManifestTrackPayload {
      id: string;
      label: string;
      language: string;
      isCC: boolean;
      hydrated: boolean;
      isImageBased: boolean;
      downloadables: Record<
        string,
        {
          isImage: boolean;
          downloadUrls: string[];
          urls: string[];
        }
      >;
    }

    function post(type: string, extra: Record<string, unknown> = {}) {
      try {
        window.postMessage(
          {
            source: SOURCE,
            type,
            ...extra,
          },
          '*',
        );
      } catch (err) {
        console.warn('[OWT-MAIN] postMessage failed', err);
      }
    }

    /** Defensive Multi-Path getPlayerApi probe */
    function getPlayerApi(): any {
      try {
        const appContext = (window as any).netflix?.appContext;
        const playerApp = appContext?.state?.playerApp ?? appContext?.getState?.()?.playerApp;
        const api = playerApp?.getAPI?.()?.videoPlayer;
        if (api) return api;
      } catch {}
      try {
        return (window as any).netflix?.player?.appApi?.videoPlayer;
      } catch {}
      return null;
    }

    /** Capability-Scored Main Video Player Selection */
    function getMainVideoPlayer(api: any): { player: any; score: number; id: string } | null {
      if (!api || typeof api.getAllPlayerSessionIds !== 'function') return null;
      try {
        const ids: string[] = api.getAllPlayerSessionIds() || [];
        const candidates = ids
          .map((id) => {
            try {
              const player = api.getVideoPlayerBySessionId?.(id);
              if (!player) return null;

              const time = Number(player.getCurrentTime?.() ?? -1);
              const duration = Number(player.getDuration?.() ?? 0);
              const score =
                (typeof player.setTimedTextTrack === 'function' ? 10 : 0) +
                (typeof player.getTimedTextTrackList === 'function' ? 10 : 0) +
                (time >= 0 ? 5 : 0) +
                (duration > 60 ? 5 : 0);

              return { id: String(id), player, score };
            } catch {
              return null;
            }
          })
          .filter((c): c is { id: string; player: any; score: number } => c !== null)
          .sort((a, b) => b.score - a.score);

        return candidates[0] ?? null;
      } catch {
        return null;
      }
    }

    function normalizeManifestTrack(track: any): ManifestTrackPayload | null {
      if (!track || typeof track !== 'object') return null;
      if (track.isNoneTrack === true) return null;

      const id = String(track.new_track_id ?? track.trackId ?? track.id ?? '');
      if (!id) return null;

      const rawDownloadables = track.ttDownloadables ?? {};
      const downloadables: ManifestTrackPayload['downloadables'] = {};

      for (const [profile, value] of Object.entries(rawDownloadables)) {
        if (!value || typeof value !== 'object') continue;
        const entry = value as any;

        const downloadUrls = Object.values(entry.downloadUrls ?? {}).filter(
          (url): url is string => typeof url === 'string' && /^https?:\/\//.test(url),
        );

        const urls = Array.isArray(entry.urls)
          ? entry.urls
              .map((item: any) => item?.url)
              .filter((url: unknown): url is string => typeof url === 'string' && /^https?:\/\//.test(url))
          : [];

        downloadables[profile] = {
          isImage: Boolean(entry.isImage),
          downloadUrls,
          urls,
        };
      }

      return {
        id,
        label: String(track.languageDescription ?? track.label ?? track.language ?? id),
        language: String(track.language ?? track.bcp47 ?? 'unknown'),
        isCC: track.rawTrackType === 'closedcaptions' || Boolean(track.isClosedCaptions),
        hydrated: track.hydrated !== false,
        isImageBased: Object.values(downloadables).some((item) => item.isImage),
        downloadables,
      };
    }

    function findTextTracks(obj: unknown, depth = 0): { movieId?: string | number; textTracks: any[] } | null {
      if (!obj || typeof obj !== 'object' || depth > 5) return null;
      const rec = obj as Record<string, unknown>;
      if (Array.isArray(rec.textTracks) && rec.textTracks.length > 0) {
        return {
          movieId: (rec.movieId || rec.videoId || rec.movie_id) as any,
          textTracks: rec.textTracks,
        };
      }
      for (const val of Object.values(rec)) {
        if (val && typeof val === 'object') {
          const res = findTextTracks(val, depth + 1);
          if (res) return res;
        }
      }
      return null;
    }

    let lastManifestSignature = '';

    function emitManifestTracks(movieId: string, rawTracks: any[]): void {
      const tracks = rawTracks.map(normalizeManifestTrack).filter(Boolean) as ManifestTrackPayload[];
      const signature = [movieId, ...tracks.map((t) => `${t.id}:${t.language}:${t.hydrated}`)].join('|');

      if (signature === lastManifestSignature) return;
      lastManifestSignature = signature;

      post('OWT_NETFLIX_MANIFEST_TRACKS', {
        movieId,
        tracks,
      });
      console.log(`[OWT-MAIN] Manifest tracks captured: ${tracks.length} tracks`);
    }

    /**
     * High Performance JSON.parse patch with early-exit guard.
     */
    function installManifestJsonHook(): void {
      const originalJsonParse = JSON.parse;

      JSON.parse = function patchedJsonParse(text: string, reviver?: any): unknown {
        const parsed = originalJsonParse.call(JSON, text, reviver);

        if (typeof text === 'string' && text.length > 500 && text.includes('timedtexttracks')) {
          try {
            const manifestInfo = findTextTracks(parsed);
            if (manifestInfo) {
              const movieId = String(
                manifestInfo.movieId ?? window.location.pathname.match(/\/watch\/(\d+)/)?.[1] ?? '',
              );
              emitManifestTracks(movieId, manifestInfo.textTracks ?? []);
            }
          } catch (error) {
            console.debug('[OWT-MAIN] manifest inspection failed', error);
          }
        }

        return parsed;
      };
    }

    installManifestJsonHook();

    /**
     * Listen for content script requests (e.g. fetch TTML XML or hydrate Cadmium track).
     */
    window.addEventListener('message', async (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.source && data.source !== 'owt-netflix-content') return;

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
          const response = await fetch(url, { credentials: 'include' });
          if (!response.ok) {
            post('OWT_NETFLIX_TTML_RESULT', {
              requestId,
              ok: false,
              error: `HTTP ${response.status}`,
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

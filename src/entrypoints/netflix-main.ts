/**
 * Netflix MAIN-world probe.
 *
 * Runs in the Netflix page realm so it can read Cadmium playerApp APIs.
 * Only pure JSON is sent to the isolated content script via window.postMessage.
 * Never pass Netflix native objects across realms.
 */
export default defineContentScript({
  matches: ['*://*.netflix.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    const SOURCE = 'owt-netflix-main';
    console.log('[OWT-MAIN] Netflix MAIN world script loaded');

    // Minimal channel health check — content script must log receipt before
    // any track/TTML work can be trusted end-to-end.
    window.postMessage(
      {
        source: SOURCE,
        type: 'OWT_TEST_PING',
        payload: { ts: Date.now(), world: 'MAIN' },
      },
      '*',
    );

    type TrackPayload = {
      id: string;
      label: string;
      language: string;
      url: string;
      isCC: boolean;
    };

    function safeString(value: unknown, fallback = ''): string {
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return fallback;
    }

    function extractUrlFromTrack(track: any): string {
      if (!track || typeof track !== 'object') return '';

      const direct =
        track.cdnUri ||
        track.ttDownloadUrl ||
        track.downloadUrl ||
        track.url ||
        '';
      if (typeof direct === 'string' && direct.startsWith('http')) return direct;

      const candidates: unknown[] = [
        track.urls,
        track.rawTrack?.urls,
        track.ttDownloadables,
        track.rawTrack?.ttDownloadables,
      ];

      for (const candidate of candidates) {
        if (!candidate) continue;

        if (typeof candidate === 'string' && candidate.startsWith('http')) {
          return candidate;
        }

        if (Array.isArray(candidate)) {
          for (const item of candidate) {
            if (typeof item === 'string' && item.startsWith('http')) return item;
            if (item && typeof item === 'object') {
              const nested =
                (item as any).url ||
                (item as any).cdnUri ||
                (item as any).downloadUrl ||
                '';
              if (typeof nested === 'string' && nested.startsWith('http')) return nested;
            }
          }
        } else if (typeof candidate === 'object') {
          // Map-like downloadables: { "webvtt-lssdh-ios8": { downloadUrls: {...} } }
          for (const value of Object.values(candidate as Record<string, unknown>)) {
            if (!value || typeof value !== 'object') continue;
            const downloadUrls = (value as any).downloadUrls || (value as any).urls;
            if (downloadUrls && typeof downloadUrls === 'object') {
              for (const url of Object.values(downloadUrls as Record<string, unknown>)) {
                if (typeof url === 'string' && url.startsWith('http')) return url;
              }
            }
            const single =
              (value as any).url ||
              (value as any).cdnUri ||
              (value as any).downloadUrl;
            if (typeof single === 'string' && single.startsWith('http')) return single;
          }
        }
      }

      return '';
    }

    function extractSubtitleTracks(): TrackPayload[] {
      try {
        const netflix = (window as any).netflix;
        const api = netflix?.appContext?.state?.playerApp?.getAPI?.();
        if (!api?.videoPlayer) return [];

        const videoPlayer = api.videoPlayer;
        const sessionIds: string[] =
          typeof videoPlayer.getAllPlayerSessionIds === 'function'
            ? videoPlayer.getAllPlayerSessionIds() || []
            : [];
        if (!Array.isArray(sessionIds) || sessionIds.length === 0) return [];

        const player = videoPlayer.getVideoPlayerBySessionId(sessionIds[0]);
        if (!player || typeof player.getTimedTextTrackList !== 'function') return [];

        const tracks = player.getTimedTextTrackList();
        if (!Array.isArray(tracks)) return [];

        const result: TrackPayload[] = [];
        for (const t of tracks) {
          const url = extractUrlFromTrack(t);
          if (!url) continue;

          const trackId = safeString(
            t.trackId ?? t.id ?? t.rawTrack?.trackId ?? url,
            url,
          );
          if (result.some((r) => r.id === trackId || r.url === url)) continue;

          result.push({
            id: trackId,
            label: safeString(
              t.languageDescription ||
                t.label ||
                t.rawTrack?.languageDescription ||
                t.rawTrack?.label,
              'Unknown Track',
            ),
            language: safeString(
              t.language || t.languageCode || t.bcp47 || t.rawTrack?.language,
              'unknown',
            ),
            url,
            isCC: !!(
              t.isClosedCaptions ||
              t.isCC ||
              t.rawTrack?.isClosedCaptions ||
              t.rawTrack?.isCC
            ),
          });
        }
        return result;
      } catch {
        // API not ready yet — keep polling; never treat this as terminal.
        return [];
      }
    }

    function tracksSignature(tracks: TrackPayload[]): string {
      return tracks
        .map((t) => `${t.id}|${t.language}|${t.url}`)
        .sort()
        .join(';;');
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

    // Content script may request TTML fetch in page world (avoids CORS / cookie issues).
    window.addEventListener('message', async (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'OWT_NETFLIX_FETCH_TTML') return;
      if (data.source && data.source !== 'owt-netflix-content') return;

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
        });
      }
    });

    // Continuous poll: do not freeze on first empty result.
    // Only emit when the track signature changes (count or URLs).
    let lastSignature = '';
    let lastApiReady = false;
    let pollCount = 0;

    const poll = () => {
      pollCount += 1;
      const tracks = extractSubtitleTracks();
      const signature = tracksSignature(tracks);
      const apiReady = tracks.length > 0;

      if (apiReady !== lastApiReady || signature !== lastSignature) {
        lastApiReady = apiReady;
        lastSignature = signature;
        post('OWT_NETFLIX_TRACKS_DISCOVERED', {
          tracks,
          meta: {
            pollCount,
            trackCount: tracks.length,
            ts: Date.now(),
          },
        });
        console.log(
          `[OWT-MAIN] tracks discovered: ${tracks.length}`,
          tracks.map((t) => `${t.language}:${t.label}`),
        );
      }

      // Periodic heartbeat so content can confirm the channel is alive
      // even when the track list is still empty.
      if (pollCount === 1 || pollCount % 10 === 0) {
        post('OWT_NETFLIX_PROBE_STATUS', {
          payload: {
            pollCount,
            trackCount: tracks.length,
            apiReady,
            ts: Date.now(),
          },
        });
      }
    };

    // First tick soon after load, then steady interval.
    setTimeout(poll, 200);
    setInterval(poll, 1200);
  },
});

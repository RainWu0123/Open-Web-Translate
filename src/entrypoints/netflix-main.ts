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
      trackType: string;
      hasUrl: boolean;
    };

    function safeString(value: unknown, fallback = ''): string {
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return fallback;
    }

    /** Prefer text-based timed-text formats over image/bitmap packs. */
    const PREFERRED_FORMAT_RE =
      /imsc|ttml|dfxp|webvtt|simpleass?|nflx-ppv|lssdh|simplesdh|webvtt-lssdh/i;
    const DISCOURAGED_FORMAT_RE = /image|bitmap|png|jpg|jpeg|png-image/i;

    function isHttpUrl(value: unknown): value is string {
      return typeof value === 'string' && /^https?:\/\//i.test(value);
    }

    /**
     * Deep-scan a track object for downloadable timed-text URLs.
     * Netflix nests these under ttDownloadables / downloadUrls with varying keys.
     */
    function collectHttpUrls(root: unknown, maxDepth = 6): string[] {
      const found: string[] = [];
      const seen = new Set<unknown>();

      const walk = (node: unknown, depth: number, pathHint: string) => {
        if (node == null || depth > maxDepth) return;
        if (typeof node === 'string') {
          if (isHttpUrl(node) && !found.includes(node)) found.push(node);
          return;
        }
        if (typeof node !== 'object') return;
        if (seen.has(node)) return;
        seen.add(node);

        if (Array.isArray(node)) {
          for (const item of node) walk(item, depth + 1, pathHint);
          return;
        }

        const obj = node as Record<string, unknown>;
        for (const [key, value] of Object.entries(obj)) {
          const nextHint = `${pathHint}.${key}`;
          // Skip huge non-track blobs if any
          if (key === 'styles' || key === 'events' || key === 'timeline') continue;
          walk(value, depth + 1, nextHint);
        }
      };

      walk(root, 0, 'track');
      return found;
    }

    function scoreUrl(url: string, formatHint: string): number {
      let score = 0;
      if (PREFERRED_FORMAT_RE.test(formatHint) || PREFERRED_FORMAT_RE.test(url)) score += 10;
      if (DISCOURAGED_FORMAT_RE.test(formatHint) || DISCOURAGED_FORMAT_RE.test(url)) score -= 5;
      if (url.includes('.xml') || url.includes('ttml') || url.includes('dfxp')) score += 3;
      if (url.includes('webvtt') || url.includes('.vtt')) score += 2;
      return score;
    }

    function extractUrlFromTrack(track: any): string {
      if (!track || typeof track !== 'object') return '';

      // Fast paths
      const directCandidates = [
        track.cdnUri,
        track.ttDownloadUrl,
        track.downloadUrl,
        track.url,
        track.rawTrack?.cdnUri,
        track.rawTrack?.ttDownloadUrl,
      ];
      for (const c of directCandidates) {
        if (isHttpUrl(c)) return c;
      }

      // Prefer structured ttDownloadables maps (format → downloadUrls)
      const downloadableRoots = [
        track.ttDownloadables,
        track.rawTrack?.ttDownloadables,
        track.downloadables,
        track.rawTrack?.downloadables,
      ];

      const ranked: Array<{ url: string; score: number }> = [];

      for (const root of downloadableRoots) {
        if (!root || typeof root !== 'object') continue;

        if (Array.isArray(root)) {
          for (const item of root) {
            for (const url of collectHttpUrls(item, 4)) {
              ranked.push({ url, score: scoreUrl(url, '') });
            }
          }
          continue;
        }

        for (const [formatKey, value] of Object.entries(root as Record<string, unknown>)) {
          if (!value || typeof value !== 'object') continue;
          const v = value as any;
          const urlBags = [v.downloadUrls, v.urls, v.cdnUrls, v];
          for (const bag of urlBags) {
            if (!bag) continue;
            if (typeof bag === 'string' && isHttpUrl(bag)) {
              ranked.push({ url: bag, score: scoreUrl(bag, formatKey) });
              continue;
            }
            if (typeof bag !== 'object') continue;
            if (Array.isArray(bag)) {
              for (const item of bag) {
                if (isHttpUrl(item)) {
                  ranked.push({ url: item, score: scoreUrl(item, formatKey) });
                } else if (item && typeof item === 'object') {
                  const nested = (item as any).url || (item as any).cdnUri;
                  if (isHttpUrl(nested)) {
                    ranked.push({ url: nested, score: scoreUrl(nested, formatKey) });
                  }
                }
              }
            } else {
              for (const url of Object.values(bag as Record<string, unknown>)) {
                if (isHttpUrl(url)) {
                  ranked.push({ url, score: scoreUrl(url, formatKey) });
                }
              }
            }
          }
        }
      }

      // Last resort: deep scan whole track (bounded)
      if (ranked.length === 0) {
        for (const url of collectHttpUrls(track, 5)) {
          ranked.push({ url, score: scoreUrl(url, '') });
        }
      }

      if (ranked.length === 0) return '';
      ranked.sort((a, b) => b.score - a.score);
      return ranked[0].url;
    }

    function getPlayerApi(): any | null {
      try {
        const netflix = (window as any).netflix;
        return netflix?.appContext?.state?.playerApp?.getAPI?.() ?? null;
      } catch {
        return null;
      }
    }

    function getActivePlayers(api: any): any[] {
      const videoPlayer = api?.videoPlayer;
      if (!videoPlayer) return [];

      const players: any[] = [];
      const seen = new Set<any>();

      const sessionIds: string[] =
        typeof videoPlayer.getAllPlayerSessionIds === 'function'
          ? videoPlayer.getAllPlayerSessionIds() || []
          : [];

      // Prefer watch / manifest sessions; still try every session.
      const ordered = [
        ...sessionIds.filter((id) => /watch|manifest|playback/i.test(String(id))),
        ...sessionIds,
        'watch',
      ];
      const uniqueSessions = Array.from(new Set(ordered.map(String)));

      for (const sid of uniqueSessions) {
        try {
          const player =
            typeof videoPlayer.getVideoPlayerBySessionId === 'function'
              ? videoPlayer.getVideoPlayerBySessionId(sid)
              : null;
          if (player && !seen.has(player)) {
            seen.add(player);
            players.push(player);
          }
        } catch {
          // session may be invalid
        }
      }

      return players;
    }

    function normalizeTrack(t: any): TrackPayload | null {
      if (!t || typeof t !== 'object') return null;

      // Skip explicit "Off" / none tracks
      const trackType = safeString(t.trackType || t.rawTrack?.trackType, '');
      if (t.isNoneTrack === true || trackType.toUpperCase() === 'NONE') return null;
      const labelProbe = safeString(
        t.languageDescription || t.label || t.rawTrack?.languageDescription,
        '',
      );
      if (/^(off|none|關閉|关闭|オフ)$/i.test(labelProbe.trim())) return null;

      const url = extractUrlFromTrack(t);
      const language = safeString(
        t.bcp47 ||
          t.language ||
          t.languageCode ||
          t.rawTrack?.bcp47 ||
          t.rawTrack?.language ||
          t.rawTrack?.languageCode,
        'unknown',
      );
      const label = safeString(
        t.languageDescription ||
          t.label ||
          t.rawTrack?.languageDescription ||
          t.rawTrack?.label,
        language !== 'unknown' ? language : 'Unknown Track',
      );
      const trackId = safeString(
        t.trackId ??
          t.id ??
          t.new_track_id ??
          t.rawTrack?.trackId ??
          t.rawTrack?.new_track_id ??
          t.rawTrack?.id ??
          `${language}:${label}:${url || 'nourl'}`,
        `${language}:${label}`,
      );

      return {
        id: trackId,
        label,
        language,
        url,
        isCC: !!(
          t.isClosedCaptions ||
          t.isCC ||
          t.rawTrack?.isClosedCaptions ||
          t.rawTrack?.isCC ||
          /cc|closed.?caption|SDH/i.test(label)
        ),
        trackType,
        hasUrl: !!url,
      };
    }

    function extractSubtitleTracks(): {
      tracks: TrackPayload[];
      meta: Record<string, unknown>;
    } {
      try {
        const api = getPlayerApi();
        if (!api?.videoPlayer) {
          return {
            tracks: [],
            meta: { reason: 'no-api', playerCount: 0, rawCount: 0 },
          };
        }

        const players = getActivePlayers(api);
        let rawCount = 0;
        const result: TrackPayload[] = [];

        for (const player of players) {
          if (typeof player.getTimedTextTrackList !== 'function') continue;
          let list: any[] = [];
          try {
            list = player.getTimedTextTrackList() || [];
          } catch {
            continue;
          }
          if (!Array.isArray(list)) continue;
          rawCount += list.length;

          for (const t of list) {
            const normalized = normalizeTrack(t);
            if (!normalized) continue;
            if (result.some((r) => r.id === normalized.id || (normalized.url && r.url === normalized.url))) {
              // Prefer entry that already has a URL
              const existing = result.find(
                (r) => r.id === normalized.id || (normalized.url && r.url === normalized.url),
              );
              if (existing && !existing.url && normalized.url) {
                existing.url = normalized.url;
                existing.hasUrl = true;
              }
              continue;
            }
            result.push(normalized);
          }
        }

        return {
          tracks: result,
          meta: {
            playerCount: players.length,
            rawCount,
            withUrl: result.filter((t) => t.hasUrl).length,
            withoutUrl: result.filter((t) => !t.hasUrl).length,
          },
        };
      } catch (err: any) {
        return {
          tracks: [],
          meta: { reason: 'exception', error: err?.message || String(err) },
        };
      }
    }

    function tracksSignature(tracks: TrackPayload[]): string {
      return tracks
        .map((t) => `${t.id}|${t.language}|${t.url}|${t.hasUrl ? 1 : 0}`)
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

    /** Try to materialize downloadables for a track without switching the visible subtitle. */
    function resolveTrackUrl(trackId: string): string {
      try {
        const api = getPlayerApi();
        if (!api) return '';
        const players = getActivePlayers(api);
        for (const player of players) {
          if (typeof player.getTimedTextTrackList !== 'function') continue;
          const list = player.getTimedTextTrackList() || [];
          if (!Array.isArray(list)) continue;
          const match = list.find((t: any) => {
            const id = safeString(
              t.trackId ?? t.id ?? t.new_track_id ?? t.rawTrack?.new_track_id,
              '',
            );
            return id === trackId;
          });
          if (!match) continue;

          // Prefer passive URL extraction — setTimedTextTrack switches visible subs.
          const passiveUrl = extractUrlFromTrack(match);
          if (passiveUrl) return passiveUrl;
        }
      } catch {
        // ignore
      }
      return '';
    }

    window.addEventListener('message', async (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.source && data.source !== 'owt-netflix-content') return;

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
        return;
      }

      if (data.type === 'OWT_NETFLIX_RESOLVE_TRACK') {
        const requestId = data.requestId;
        const trackId = data.trackId;
        if (typeof requestId !== 'string' || typeof trackId !== 'string') return;
        const url = resolveTrackUrl(trackId);
        post('OWT_NETFLIX_RESOLVE_TRACK_RESULT', {
          requestId,
          ok: !!url,
          trackId,
          url: url || '',
        });
      }
    });

    let lastSignature = '';
    let lastApiReady = false;
    let pollCount = 0;

    const poll = () => {
      pollCount += 1;
      const { tracks, meta } = extractSubtitleTracks();
      // Content can use tracks without URL (UI + resolve later), so signature includes them.
      const signature = tracksSignature(tracks);
      const apiReady = tracks.length > 0;

      if (apiReady !== lastApiReady || signature !== lastSignature) {
        lastApiReady = apiReady;
        lastSignature = signature;
        post('OWT_NETFLIX_TRACKS_DISCOVERED', {
          tracks,
          meta: {
            ...meta,
            pollCount,
            trackCount: tracks.length,
            ts: Date.now(),
          },
        });
        console.log(
          `[OWT-MAIN] tracks discovered: ${tracks.length} (withUrl=${meta.withUrl ?? '?'})`,
          tracks.map((t) => `${t.language}:${t.label}${t.hasUrl ? '' : '[no-url]'}`),
        );
      }

      if (pollCount === 1 || pollCount % 10 === 0) {
        post('OWT_NETFLIX_PROBE_STATUS', {
          payload: {
            pollCount,
            trackCount: tracks.length,
            withUrl: meta.withUrl ?? 0,
            apiReady,
            reason: meta.reason,
            playerCount: meta.playerCount,
            ts: Date.now(),
          },
        });
      }
    };

    setTimeout(poll, 200);
    setInterval(poll, 1200);
  },
});

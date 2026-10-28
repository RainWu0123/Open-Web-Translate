/**
 * netflix-main — MAIN-world entrypoint (thin shell).
 *
 * Everything mechanical lives in deep modules:
 * - wire protocol → netflix-bridge
 * - track discovery (JSON.parse/fetch hooks, Cadmium poller, perf capture,
 *   normalization, revisioned broadcast) → netflix-track-discovery
 * - subtitle format sniffing → netflix-subtitle-format
 *
 * What remains here: boot wiring, the F12 diagnostic dump, and the three
 * content-script commands (REQUEST_TRACKS, HYDRATE_TRACK, FETCH_TTML).
 */
import { createLogger } from '@/shared/logger';
import { BRIDGE, replyToContent } from '@/adapters/netflix/netflix-bridge';
import {
  NetflixTrackDiscovery,
  getMainVideoPlayer,
  getPlayerApi,
  extractTracksFromPerformanceEntriesForDebug,
} from '@/adapters/netflix/netflix-track-discovery';
import {
  detectSubtitleFormat,
  extractTextFromMp4Segment,
  readAsciiPrefix,
} from '@/adapters/netflix/netflix-subtitle-format';
import { pickActiveTrackId } from '@/adapters/netflix/active-track';
import { hydrateNetflixTrackUrl } from '@/adapters/netflix/netflix-track-hydrator';

const logger = createLogger('NetflixMain');

export default defineUnlistedScript({
  main() {
    logger.info('[OWT-BOOT] version=v0.2.0');

    const discovery = new NetflixTrackDiscovery();
    // Netflix exposes one mutable timed-text selection. Serialize temporary
    // hydration switches so two popup choices cannot claim the same network
    // response or restore each other out of order.
    let hydrationQueue: Promise<void> = Promise.resolve();

    // Expose F12 Debug helper directly on MAIN window
    (window as any).__OWT_DEBUG__ = () => {
      const api = getPlayerApi();
      const playerObj = getMainVideoPlayer(api);
      const snapshot = discovery.lastPayload();
      console.group('🔍 OWT Netflix MAIN-World Diagnostic Dump');
      console.log('1. Player API Present:', Boolean(api));
      console.log('2. Main Video Player Object:', playerObj);
      console.log('3. Last Capture Source:', snapshot.source);
      console.log('4. Captured Tracks Count:', snapshot.tracks.length);
      console.log('5. Captured Tracks List:', snapshot.tracks);
      console.log('6. Cadmium TimedTextTrackList:', playerObj?.player?.getTimedTextTrackList?.() || []);
      console.log('7. Performance Log TimedText Entries:', extractTracksFromPerformanceEntriesForDebug());
      console.groupEnd();
      return {
        boot: 'ok',
        version: 'v0.2.0',
        playerApi: Boolean(api),
        tracksCount: snapshot.tracks.length,
        tracksWithUrlCount: snapshot.tracks.filter((t) => Boolean(t.url)).length,
        source: snapshot.source,
        tracks: snapshot.tracks,
      };
    };
    (window as any).__OWT_MAIN_DEBUG__ = (window as any).__OWT_DEBUG__;

    discovery.start();

    // --- Content Script Commands ---
    window.addEventListener('message', async (event) => {
      if (event.source !== window) return;
      if (event.origin !== location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.source !== BRIDGE.CONTENT_SOURCE) return;

      if (data.type === BRIDGE.messageType.GET_ACTIVE_TRACK) {
        const requestId = data.requestId as string | undefined;
        if (typeof requestId !== 'string') return;
        let trackId: string | number | null = null;
        try {
          const player = discovery.currentPlayer()?.player;
          const list = player?.getTimedTextTrackList?.() ?? [];
          trackId = pickActiveTrackId(list, player);
        } catch {
          trackId = null;
        }
        replyToContent(BRIDGE.messageType.ACTIVE_TRACK_RESULT, {
          requestId,
          ok: true,
          trackId: trackId === null ? '' : String(trackId),
        });
        return;
      }

      if (data.type === BRIDGE.messageType.REQUEST_TRACKS) {
        // Navigation may have invalidated previous captures: re-arm hooks
        // and poller, then answer from the store or a fresh poll.
        discovery.rearm();
        if (!discovery.pollOnce() && discovery.lastPayload().tracks.length > 0) {
          // force re-broadcast of the current store at a new revision
          discovery.rebroadcast();
        }
        return;
      }

      if (data.type === BRIDGE.messageType.HYDRATE_TRACK) {
        const scope = discovery.captureScope();
        const { trackId, expectedLanguage, performSeek, txId, requestId } = data;
        const correlation = {
          ...(typeof requestId === 'string' ? { requestId } : {}),
          ...(typeof txId === 'string' ? { txId } : {}),
        };
        const task = hydrationQueue.then(async () => {
          if (!discovery.isCurrentScope(scope) || (data.videoId && data.videoId !== scope.videoId)) {
            return { ok: false, reason: 'video-changed' };
          }
          const player = discovery.currentPlayer()?.player;
          if (!player) return { ok: false, reason: 'api-unavailable' };
          if (typeof player.getTimedTextTrackList !== 'function' || typeof player.setTimedTextTrack !== 'function') {
            return { ok: false, reason: 'unsupported-api' };
          }
          return await hydrateNetflixTrackUrl(
            player,
            String(trackId ?? ''),
            String(expectedLanguage ?? ''),
            Boolean(performSeek),
            {
              resourceEntries: () => performance.getEntriesByType('resource'),
              fetchResource: (input, init) => discovery.fetchResource(scope, String(input), init),
              wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
              isCurrent: () => discovery.isCurrentScope(scope) && discovery.currentPlayer()?.player === player,
            },
          );
        });
        hydrationQueue = task.then(() => undefined, () => undefined);
        try {
          const result = await task;
          if (!discovery.isCurrentScope(scope)) {
            replyToContent(BRIDGE.messageType.HYDRATE_RESULT, { ...correlation, ok: false, reason: 'video-changed' });
            return;
          }
          if (result.ok && result.url) discovery.bindHydratedUrl(String(trackId), result.url, scope);
          replyToContent(BRIDGE.messageType.HYDRATE_RESULT, { ...correlation, ...result });
        } catch (err: any) {
          replyToContent(BRIDGE.messageType.HYDRATE_RESULT, { ...correlation, ok: false, reason: err?.message || 'exception' });
        }
        return;
      }

      if (data.type === BRIDGE.messageType.FETCH_TTML) {
        const requestId = data.requestId;
        const url = data.url;
        if (typeof requestId !== 'string' || typeof url !== 'string') return;
        const scope = discovery.captureScope();
        if (data.videoId !== scope.videoId || (typeof data.scopeEpoch === 'number' && data.scopeEpoch !== scope.epoch)) {
          replyToContent(BRIDGE.messageType.TTML_RESULT, { requestId, ok: false, reason: 'video-changed' });
          return;
        }

        logger.debug('[Step 3 fetch begin]', { requestId, url: url.length > 50 ? url.substring(0, 50) + '...' : url });

        try {
          const fetchPromise = discovery.fetchResource(scope, url, {
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

          const response = await Promise.race([fetchPromise, timeoutPromise]);

          if (!discovery.isCurrentScope(scope)) {
            replyToContent(BRIDGE.messageType.TTML_RESULT, { requestId, ok: false, reason: 'video-changed' });
            return;
          }

          if (!response || !response.ok) {
            logger.warn(`[Step 3 FAIL] Fetch HTTP ${response?.status || 'Network Error'} for URL: ${url}`);
            replyToContent(BRIDGE.messageType.TTML_RESULT, {
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
          if (!discovery.isCurrentScope(scope)) throw new Error('video-changed');
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

          replyToContent(BRIDGE.messageType.TTML_RESULT, {
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
          replyToContent(BRIDGE.messageType.TTML_RESULT, {
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

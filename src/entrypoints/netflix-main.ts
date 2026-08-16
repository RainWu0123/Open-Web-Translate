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
  extractTrackUrlUniversal,
  extractTracksFromPerformanceEntriesForDebug,
} from '@/adapters/netflix/netflix-track-discovery';
import {
  detectSubtitleFormat,
  extractTextFromMp4Segment,
  readAsciiPrefix,
} from '@/adapters/netflix/netflix-subtitle-format';
import { looksLikeTrackUrl } from '@/adapters/netflix/netflix-track-constants';

const logger = createLogger('NetflixMain');

export default defineUnlistedScript({
  main() {
    logger.info('[OWT-BOOT] version=v0.2.0');

    const discovery = new NetflixTrackDiscovery();

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

      if (data.type === BRIDGE.messageType.REQUEST_TRACKS) {
        // Navigation may have invalidated previous captures: re-arm hooks
        // and poller, then answer from the store or a fresh poll.
        discovery.rearm();
        if (discovery.lastPayload().tracks.length > 0) {
          // force re-broadcast of the current store at a new revision
          discovery.rebroadcast();
        } else {
          discovery.pollOnce();
        }
        return;
      }

      if (data.type === BRIDGE.messageType.HYDRATE_TRACK) {
        const { trackId, performSeek, txId } = data;
        const mainCandidate = getMainVideoPlayer();

        if (!mainCandidate?.player) {
          replyToContent(BRIDGE.messageType.HYDRATE_RESULT, { txId, ok: false, reason: 'api-unavailable' });
          return;
        }

        const player = mainCandidate.player;
        if (typeof player.getTimedTextTrackList !== 'function' || typeof player.setTimedTextTrack !== 'function') {
          replyToContent(BRIDGE.messageType.HYDRATE_RESULT, { txId, ok: false, reason: 'unsupported-api' });
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
              replyToContent(BRIDGE.messageType.HYDRATE_RESULT, { txId, ok: true, url: explicitUrl });
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

              discovery.bindHydratedUrl(String(trackId), capturedUrl);
              replyToContent(BRIDGE.messageType.HYDRATE_RESULT, { txId, ok: true, url: capturedUrl });
            }, 600);
          } else {
            replyToContent(BRIDGE.messageType.HYDRATE_RESULT, { txId, ok: false, reason: 'track-not-found' });
          }
        } catch (err: any) {
          replyToContent(BRIDGE.messageType.HYDRATE_RESULT, { txId, ok: false, reason: err?.message || 'exception' });
        }
        return;
      }

      if (data.type === BRIDGE.messageType.FETCH_TTML) {
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

          const response = await Promise.race([fetchPromise, timeoutPromise]);

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

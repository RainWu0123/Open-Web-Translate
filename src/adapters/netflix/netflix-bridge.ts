/**
 * Netflix bridge — the wire protocol between the MAIN-world script and the
 * content script.
 *
 * Deep module owning every transport fact both sides must agree on:
 * - window.postMessage is the primary channel (source-tagged, origin-checked)
 * - a CustomEvent carrying a JSON string mirrors every broadcast, because
 *   Firefox has thrown DataCloneError on postMessage payloads crossing the
 *   page/content seam — the mirror must not be cloneable-problematic
 * - broadcasts carry a monotonically increasing revision; the receiving side
 *   drops stale or already-seen revisions, which also dedups the dual channel
 * - request/response pairs (FETCH_TTML) correlate on requestId with a timeout
 *
 * Interface (content side): onMessage · request
 * Interface (MAIN side):    postToContent · postToMain is not needed (MAIN
 *                           only replies on postMessage via reply below)
 *
 * Dependency-free so both worlds can inline it into their bundles.
 */
import { createLogger } from '@/shared/logger';

const logger = createLogger('NetflixBridge');

export const BRIDGE = {
  MAIN_SOURCE: 'owt-netflix-main',
  CONTENT_SOURCE: 'owt-netflix-content',
  /** CustomEvent fallback channel name (Firefox DataCloneError path). */
  TRACKS_EVENT: 'owt:tracks-updated',
  messageType: {
    TRACKS_UPDATED: 'OWT_NETFLIX_TRACKS_UPDATED',
    TRACKS_DISCOVERED: 'OWT_NETFLIX_TRACKS_DISCOVERED',
    MANIFEST_TRACKS: 'OWT_NETFLIX_MANIFEST_TRACKS',
    REQUEST_TRACKS: 'OWT_NETFLIX_REQUEST_TRACKS',
    HYDRATE_TRACK: 'OWT_NETFLIX_HYDRATE_TRACK',
    HYDRATE_RESULT: 'OWT_NETFLIX_HYDRATE_RESULT',
    FETCH_TTML: 'OWT_NETFLIX_FETCH_TTML',
    TTML_RESULT: 'OWT_NETFLIX_TTML_RESULT',
    GET_ACTIVE_TRACK: 'OWT_NETFLIX_GET_ACTIVE_TRACK',
    ACTIVE_TRACK_RESULT: 'OWT_NETFLIX_ACTIVE_TRACK_RESULT',
  },
} as const;

export interface BridgeMessage {
  source: string;
  type: string;
  [key: string]: unknown;
}

function sameWindow(event: Event): boolean {
  return (event as MessageEvent).source === window;
}

/**
 * MAIN world → content world broadcast. postMessage first; if it throws
 * (Firefox DataCloneError) the CustomEvent JSON mirror is the surviving
 * channel, so failures are logged, not fatal.
 */
export function postToContent(type: string, payload: Record<string, unknown> = {}): void {
  // Protocol fields come LAST: a payload key named 'source'/'type' must
  // never overwrite the routing tag (this silently broke source checks
  // before the seam got strict).
  const message: BridgeMessage = { ...payload, source: BRIDGE.MAIN_SOURCE, type };
  try {
    window.postMessage(message, location.origin);
  } catch (err: any) {
    logger.warn('[bridge] postMessage broadcast failed', { type, name: err?.name, message: err?.message });
  }
  try {
    document.dispatchEvent(
      new CustomEvent(BRIDGE.TRACKS_EVENT, { detail: JSON.stringify(message) }),
    );
  } catch (err: any) {
    logger.warn('[bridge] CustomEvent mirror failed', { type, name: err?.name, message: err?.message });
  }
}

/** Content world → MAIN world request (postMessage only). */
export function postToMain(type: string, payload: Record<string, unknown> = {}): void {
  window.postMessage({ source: BRIDGE.CONTENT_SOURCE, type, ...payload } as BridgeMessage, location.origin);
}

/**
 * MAIN world → content world reply on a request. Plain postMessage, no
 * CustomEvent mirror: request/response correlation lives on one channel,
 * only broadcasts are mirrored.
 */
export function replyToContent(type: string, payload: Record<string, unknown> = {}): void {
  try {
    window.postMessage({ source: BRIDGE.MAIN_SOURCE, type, ...payload } as BridgeMessage, location.origin);
  } catch (err: any) {
    logger.warn('[bridge] reply failed', { type, name: err?.name, message: err?.message });
  }
}

/**
 * Content world: receive broadcasts from MAIN. Listens on BOTH channels,
 * dedups TRACKS broadcasts by revision, ignores other sources. Returns an
 * unsubscribe function.
 */
export function onBridgeMessage(handler: (msg: BridgeMessage) => void): () => void {
  let lastTracksRevision = 0;

  const receive = (msg: BridgeMessage | null | undefined) => {
    if (!msg || typeof msg !== 'object' || msg.source !== BRIDGE.MAIN_SOURCE) return;
    if (
      msg.type === BRIDGE.messageType.TRACKS_UPDATED ||
      msg.type === BRIDGE.messageType.TRACKS_DISCOVERED ||
      msg.type === BRIDGE.messageType.MANIFEST_TRACKS
    ) {
      const revision = Number(msg.revision ?? 0);
      if (revision && revision <= lastTracksRevision) return; // stale or mirror duplicate
      lastTracksRevision = Math.max(lastTracksRevision, revision);
    }
    handler(msg);
  };

  const onPostMessage = (event: MessageEvent) => {
    if (!sameWindow(event)) return;
    receive(event.data as BridgeMessage | null);
  };
  const onCustomEvent = (event: Event) => {
    const detail = (event as CustomEvent<string>).detail;
    if (typeof detail !== 'string') return;
    try {
      receive(JSON.parse(detail) as BridgeMessage);
    } catch {
      logger.warn('[bridge] malformed CustomEvent payload dropped');
    }
  };

  window.addEventListener('message', onPostMessage);
  document.addEventListener(BRIDGE.TRACKS_EVENT, onCustomEvent);
  return () => {
    window.removeEventListener('message', onPostMessage);
    document.removeEventListener(BRIDGE.TRACKS_EVENT, onCustomEvent);
  };
}

/**
 * Content world: request/response over the bridge with correlation + timeout.
 * Rejects on timeout or explicit failure payload, so callers can fall back
 * (e.g. to a direct fetch) without knowing the transport details.
 */
export function bridgeRequest<T extends Record<string, unknown> = Record<string, unknown>>(
  type: string,
  payload: Record<string, unknown>,
  timeoutMs = 12000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(failTimer);
    };

    const onMessage = (event: MessageEvent) => {
      if (!sameWindow(event)) return;
      const data = event.data as (BridgeMessage & { requestId?: string }) | null;
      if (!data || data.source !== BRIDGE.MAIN_SOURCE || data.requestId !== requestId) return;
      cleanup();
      const result = data as unknown as T & { requestId?: string; ok?: boolean };
      if (result.ok === false) {
        reject(new Error(String((data as any).error || (data as any).reason || 'bridge request failed')));
      } else {
        resolve(result);
      }
    };

    const failTimer = setTimeout(() => {
      cleanup();
      reject(new Error('MAIN-world bridge timeout'));
    }, timeoutMs);

    window.addEventListener('message', onMessage);
    try {
      postToMain(type, { requestId, ...payload });
    } catch (err) {
      // Firefox throws DataCloneError synchronously on some payloads —
      // reject immediately so fallbacks kick in instead of waiting out the
      // timeout.
      cleanup();
      reject(err instanceof Error ? err : new Error('postMessage failed'));
    }
  });
}

/**
 * YouTube bridge — communication protocol between MAIN-world script and content script.
 */
import { createLogger } from '@/shared/logger';

const logger = createLogger('YouTubeBridge');

export const YT_BRIDGE = {
  MAIN_SOURCE: 'owt-youtube-main',
  CONTENT_SOURCE: 'owt-youtube-content',
  EVENT_NAME: 'owt:yt-tracks-updated',
  MAIN_EVENT: 'owt:yt-command-event',
  messageType: {
    TRACKS_UPDATED: 'OWT_YT_TRACKS_UPDATED',
    REQUEST_TRACKS: 'OWT_YT_REQUEST_TRACKS',
    SET_TRACK: 'OWT_YT_SET_TRACK',
    TRACK_SET_RESULT: 'OWT_YT_TRACK_SET_RESULT',
  },
} as const;

export interface YouTubeTrack {
  id: string;
  languageCode: string;
  label: string;
  kind?: string;
  isDefault?: boolean;
}

export interface YouTubeTracksUpdatedPayload {
  tracks: YouTubeTrack[];
  selectedTrackId?: string;
}

export interface YouTubeSetTrackPayload {
  languageCode: string;
  targetLanguage?: string;
}

let contentRevision = 0;

export function postToContent(type: string, payload: Record<string, unknown> = {}): void {
  contentRevision += 1;
  const msg = { ...payload, type, source: YT_BRIDGE.MAIN_SOURCE, revision: contentRevision };

  try {
    window.postMessage(msg, '*');
  } catch (err) {
    logger.debug('postToContent postMessage failed', err);
  }

  try {
    const detailStr = JSON.stringify(msg);
    window.dispatchEvent(new CustomEvent(YT_BRIDGE.EVENT_NAME, { detail: detailStr }));
  } catch {
    // ignore CustomEvent errors
  }
}

export function postToMain(type: string, payload: Record<string, unknown> = {}): void {
  const msg = { ...payload, type, source: YT_BRIDGE.CONTENT_SOURCE };

  try {
    window.postMessage(msg, '*');
  } catch (err) {
    logger.debug('postToMain postMessage failed', err);
  }

  try {
    const detailStr = JSON.stringify(msg);
    window.dispatchEvent(new CustomEvent(YT_BRIDGE.MAIN_EVENT, { detail: detailStr }));
  } catch {
    // ignore CustomEvent errors
  }
}

/**
 * Unified bridge subscriber in content script.
 * Deduplicates messages across postMessage and CustomEvent channels using monotonic revision.
 */
export function subscribeToYouTubeBridge(
  callback: (data: { type: string; revision?: number; [key: string]: any }) => void,
): () => void {
  let lastSeenRevision = -1;

  const handleMessage = (raw: any) => {
    if (!raw || raw.source !== YT_BRIDGE.MAIN_SOURCE) return;
    if (typeof raw.revision === 'number') {
      if (raw.revision <= lastSeenRevision) return;
      lastSeenRevision = raw.revision;
    }
    callback(raw);
  };

  const onWindowMessage = (event: MessageEvent) => {
    handleMessage(event.data);
  };

  const onCustomEvent = (event: any) => {
    try {
      const data = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
      handleMessage(data);
    } catch {
      // ignore parse error
    }
  };

  window.addEventListener('message', onWindowMessage);
  window.addEventListener(YT_BRIDGE.EVENT_NAME, onCustomEvent);

  return () => {
    window.removeEventListener('message', onWindowMessage);
    window.removeEventListener(YT_BRIDGE.EVENT_NAME, onCustomEvent);
  };
}

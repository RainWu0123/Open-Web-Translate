/**
 * Shared Netflix track-discovery constants.
 *
 * Imported by BOTH worlds:
 * - src/entrypoints/netflix-main.ts (MAIN world, page context)
 * - src/adapters/netflix/* (content script world)
 * Keep this module dependency-free so both bundles can inline it.
 */

/**
 * Netflix text-subtitle downloadable profiles in preference order.
 * Image-based (IMSC1 bitmap) profiles are excluded on purpose.
 */
export const NETFLIX_PREFERRED_TEXT_PROFILES: readonly string[] = [
  'dfxp-ls-sdh',
  'simplesdh',
  'webvtt-lssdh',
  'dfxp-teletext-dfxp-ls-sdh',
  'dfxp-ls',
  'webvtt-ls',
];

/** Substrings identifying A/V media segments that are never subtitle tracks. */
const MEDIA_SEGMENT_MARKERS = ['path=video', 'path=audio', '/video/', '/audio/'] as const;

/** True when the URL is a video/audio media segment (not a subtitle resource). */
export function isMediaSegmentUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return MEDIA_SEGMENT_MARKERS.some((marker) => lower.includes(marker));
}

/** True when the URL looks like a text subtitle resource on nflxvideo.net. */
export function isSubtitleResourceUrl(url: string): boolean {
  if (isMediaSegmentUrl(url)) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('timedtext') ||
    lower.includes('/tt/') ||
    lower.includes('.dfxp') ||
    lower.includes('.vtt') ||
    lower.includes('format=dfxp') ||
    lower.includes('format=webvtt') ||
    lower.includes('profiles=dfxp') ||
    lower.includes('profiles=webvtt')
  );
}

/** True when a URL may be a subtitle resource worth deep-scanning. */
export function looksLikeTrackUrl(url: string): boolean {
  if (!url.includes('nflxvideo.net')) return false;
  return !isMediaSegmentUrl(url);
}

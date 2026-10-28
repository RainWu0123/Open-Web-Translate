/**
 * Active-track detection for the Cadmium player.
 *
 * The player's timed-text track list does not expose one documented
 * "active" flag across Netflix player versions. Prefer its current-track
 * getter when available, then fall back to explicitly flagged tracks.
 */

export interface TrackLike {
  trackId?: string | number;
  id?: string | number;
  bcp47?: string;
  language?: string;
  isNoneTrack?: boolean;
  [key: string]: unknown;
}

const ACTIVE_FLAGS = ['active', 'current', 'isSelected', 'isCurrentSubtitle'] as const;

function isTruthyFlag(value: unknown): boolean {
  return value === true;
}

function trackKey(track: TrackLike): string | number | null {
  if (track.trackId !== undefined) return track.trackId;
  if (track.id !== undefined) return track.id;
  if (track.bcp47) return track.bcp47;
  if (track.language) return track.language;
  return null;
}

/** Resolve the actual list object without guessing a track by its language. */
export function getActiveTrack(list: TrackLike[], player?: { getTimedTextTrack?: () => unknown }): TrackLike | null {
  if (typeof player?.getTimedTextTrack === 'function') {
    try {
      const selected = player.getTimedTextTrack();
      const key = selected && typeof selected === 'object'
        ? trackKey(selected as TrackLike)
        : typeof selected === 'string' || typeof selected === 'number' ? selected : null;
      if (key === null) return null;
      return list.find(track => String(trackKey(track)) === String(key)) ?? null;
    } catch {
      return null;
    }
  }
  return list.find(track => ACTIVE_FLAGS.some(flag => isTruthyFlag(track[flag]))) ?? null;
}

/**
 * Returns the id of the player's currently-displayed subtitle track, or
 * null when no track is recognisably active.
 */
export function pickActiveTrackId(list: TrackLike[], player?: { getTimedTextTrack?: () => unknown }): string | number | null {
  const active = getActiveTrack(list, player);
  return active && !active.isNoneTrack ? trackKey(active) : null;
}

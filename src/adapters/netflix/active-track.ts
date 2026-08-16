/**
 * Active-track detection for the Cadmium player.
 *
 * The player's timed-text track list does not expose one documented
 * "active" flag across Netflix player versions, so this helper checks the
 * known flag names defensively and never guesses: an unflagged list yields
 * null. The "none/off" pseudo-track is excluded even when flagged.
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

/**
 * Returns the id of the player's currently-displayed subtitle track, or
 * null when no track is recognisably active.
 */
export function pickActiveTrackId(list: TrackLike[]): string | number | null {
  const playable = list.filter((t) => !t.isNoneTrack);
  if (playable.length === 0) return null;

  let flaggedOnNoneTrack = false;
  for (const flag of ACTIVE_FLAGS) {
    const hit = playable.find((t) => isTruthyFlag(t[flag]));
    if (hit) {
      const key = trackKey(hit);
      if (key !== null) return key;
    }
    if (list.some((t) => t.isNoneTrack && isTruthyFlag(t[flag]))) {
      flaggedOnNoneTrack = true;
    }
  }

  if (flaggedOnNoneTrack) {
    // The player flagged the "off" pseudo-track; best effort — the first
    // playable track with an identity.
    for (const t of playable) {
      const key = trackKey(t);
      if (key !== null) return key;
    }
  }

  return null;
}

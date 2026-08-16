/**
 * Cue aligner — pairs cues across two subtitle tracks by maximum time
 * overlap.
 *
 * Two native tracks almost never cut sentences at the same timestamps
 * (Netflix's English and Japanese tracks differ per cue), so index-based
 * pairing drifts ("previous sentence paired with the next"). For every
 * primary cue we pick the secondary cue whose time overlap is largest,
 * subject to a minimum-overlap floor; below the floor the pairing is left
 * open (ai-derived downstream).
 *
 * A secondary cue may pair with several primary cues — tracks genuinely
 * split differently — and vice versa.
 */

export interface AlignableCue {
  startMs: number;
  endMs: number;
  text: string;
  id?: string;
}

export interface CuePairing<P extends AlignableCue = AlignableCue, S extends AlignableCue = AlignableCue> {
  primary: P;
  secondary?: S;
  overlapMs: number;
  alignment: 'official-timed' | 'overlap' | 'ai-derived';
}

export interface AlignOptions {
  /** Pair only when overlap ≥ this (default 150ms). */
  minOverlapMs?: number;
}

export function overlapMs(a: AlignableCue, b: AlignableCue): number {
  return Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
}

export function alignCueTracks<P extends AlignableCue, S extends AlignableCue>(
  primary: P[],
  secondary: S[],
  options: AlignOptions = {},
): CuePairing<P, S>[] {
  const minOverlapMs = options.minOverlapMs ?? 150;
  const sortedPrimary = [...primary].sort((a, b) => a.startMs - b.startMs);
  const sortedSecondary = [...secondary].sort((a, b) => a.startMs - b.startMs);

  // Two-pointer sweep: for each primary cue, advance the secondary window
  // while its cues can still overlap.
  let windowStart = 0;
  return sortedPrimary.map((p) => {
    while (
      windowStart < sortedSecondary.length &&
      sortedSecondary[windowStart].endMs <= p.startMs &&
      // keep the window from consuming a cue a later primary still needs
      (windowStart + 1 < sortedSecondary.length
        ? sortedSecondary[windowStart + 1].startMs < p.startMs
        : true)
    ) {
      windowStart++;
    }

    let best: S | undefined;
    let bestOverlap = 0;
    for (let i = windowStart; i < sortedSecondary.length; i++) {
      const s = sortedSecondary[i];
      if (s.startMs >= p.endMs) break;
      const ov = overlapMs(p, s);
      if (ov > bestOverlap) {
        bestOverlap = ov;
        best = s;
      }
    }

    if (best && bestOverlap >= minOverlapMs) {
      return { primary: p, secondary: best, overlapMs: bestOverlap, alignment: 'overlap' as const };
    }
    return { primary: p, overlapMs: 0, alignment: 'ai-derived' as const };
  });
}

/** Binary search: the pairing whose primary cue covers videoMs (or the next one). */
export function findPairingAt<P extends AlignableCue, S extends AlignableCue>(
  pairings: CuePairing<P, S>[],
  videoMs: number,
): CuePairing<P, S> | null {
  let lo = 0;
  let hi = pairings.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = pairings[mid].primary;
    if (videoMs < p.startMs) {
      hi = mid - 1;
    } else if (videoMs >= p.endMs) {
      lo = mid + 1;
    } else {
      return pairings[mid];
    }
  }
  return null;
}

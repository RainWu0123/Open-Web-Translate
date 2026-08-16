import { describe, it, expect } from 'vitest';
import { alignCueTracks, findPairingAt, overlapMs } from '@/shared/subtitles/cue-aligner';

const cue = (id: string, startMs: number, endMs: number, text = id) => ({ id, startMs, endMs, text });

describe('alignCueTracks (max time-overlap pairing)', () => {
  it('pairs each primary cue with the maximum-overlap secondary cue, not by index', () => {
    // Secondary track merges the two primary cues into one.
    const primary = [cue('p1', 0, 2000), cue('p2', 2000, 4000)];
    const secondary = [cue('s1', 100, 3900)];

    const pairings = alignCueTracks(primary, secondary);

    expect(pairings[0].secondary?.id).toBe('s1');
    expect(pairings[1].secondary?.id).toBe('s1'); // reuse is legitimate
    expect(pairings[0].alignment).toBe('overlap');
  });

  it('does not pair across a boundary to the wrong neighbour (the LR misalignment case)', () => {
    // English cuts at 0-2000 / 2000-4000; Japanese cuts at 0-1900 / 1900-4100.
    const en = [cue('e1', 0, 2000), cue('e2', 2000, 4000)];
    const ja = [cue('j1', 0, 1900), cue('j2', 1900, 4100)];

    const pairings = alignCueTracks(en, ja);

    expect(pairings[0].secondary?.id).toBe('j1');
    expect(pairings[1].secondary?.id).toBe('j2');
  });

  it('leaves the pairing open below the minimum-overlap floor', () => {
    const primary = [cue('p1', 0, 2000)];
    const secondary = [cue('s1', 1950, 4000)]; // 50ms overlap only

    const pairings = alignCueTracks(primary, secondary, { minOverlapMs: 150 });

    expect(pairings[0].secondary).toBeUndefined();
    expect(pairings[0].alignment).toBe('ai-derived');
  });

  it('returns all primaries unpaired when the secondary track is empty', () => {
    const pairings = alignCueTracks([cue('p1', 0, 1000)], []);
    expect(pairings).toHaveLength(1);
    expect(pairings[0].secondary).toBeUndefined();
  });

  it('handles unsorted input', () => {
    const pairings = alignCueTracks(
      [cue('p2', 2000, 4000), cue('p1', 0, 2000)],
      [cue('j2', 1900, 4100), cue('j1', 0, 1900)],
    );
    expect(pairings.map((p) => p.primary.id)).toEqual(['p1', 'p2']);
    expect(pairings[0].secondary?.id).toBe('j1');
    expect(pairings[1].secondary?.id).toBe('j2');
  });
});

describe('overlapMs / findPairingAt', () => {
  it('computes intersection length, zero when disjoint', () => {
    expect(overlapMs(cue('a', 0, 2000), cue('b', 1000, 3000))).toBe(1000);
    expect(overlapMs(cue('a', 0, 1000), cue('b', 1000, 3000))).toBe(0);
  });

  it('finds the pairing covering the playhead, null in gaps', () => {
    const pairings = alignCueTracks(
      [cue('p1', 0, 2000), cue('p2', 3000, 5000)],
      [cue('s1', 0, 2100), cue('s2', 2900, 5100)],
    );

    expect(findPairingAt(pairings, 1500)?.primary.id).toBe('p1');
    expect(findPairingAt(pairings, 4000)?.primary.id).toBe('p2');
    expect(findPairingAt(pairings, 2500)).toBeNull();
  });
});

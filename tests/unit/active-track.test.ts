import { describe, it, expect } from 'vitest';
import { pickActiveTrackId } from '@/adapters/netflix/active-track';

describe('pickActiveTrackId (cadmium active-track heuristics)', () => {
  it('returns the track flagged active/current/selected', () => {
    const list = [
      { trackId: 1, language: 'en' },
      { trackId: 2, language: 'ja', active: true },
      { trackId: 3, language: 'zh' },
    ];
    expect(pickActiveTrackId(list)).toBe(2);
  });

  it('checks current and isSelected as alternative flags', () => {
    expect(pickActiveTrackId([{ trackId: 'a', current: true }])).toBe('a');
    expect(pickActiveTrackId([{ trackId: 'b', isSelected: true }])).toBe('b');
    expect(pickActiveTrackId([{ trackId: 'c', isCurrentSubtitle: true }])).toBe('c');
  });

  it('falls back to isNoneTrack=false + bcp47 language when the "off" track is flagged', () => {
    // Cadmium sometimes flags the NONE track; never pick it.
    const list = [
      { trackId: 'off', isNoneTrack: true, active: true },
      { trackId: 'real', language: 'en', isNoneTrack: false },
    ];
    expect(pickActiveTrackId(list)).toBe('real');
  });

  it('returns null when nothing is flagged (no false positives)', () => {
    expect(pickActiveTrackId([{ trackId: 1 }, { trackId: 2 }])).toBeNull();
    expect(pickActiveTrackId([])).toBeNull();
  });

  it('ignores boolean-ish strings and other noise values', () => {
    expect(pickActiveTrackId([{ trackId: 1, active: 'false' as any }])).toBeNull();
    expect(pickActiveTrackId([{ trackId: 1, active: 0 as any }])).toBeNull();
  });
});

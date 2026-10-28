import { describe, expect, it } from 'vitest';
import { mergeSubtitleTimelines } from '@/shared/subtitles/dual-track-timeline';

describe('dual subtitle timeline alignment', () => {
  it.each([299, 300])('aligns an unambiguous pair with %ims offset', offset => {
    const primary = [{ startMs: 1000, endMs: 4000, text: 'original' }];
    const secondary = [{ startMs: 1000 + offset, endMs: 4000 - offset, text: 'translation' }];
    expect(mergeSubtitleTimelines(primary, secondary)).toEqual([
      { startMs: 1000, endMs: 3999, text: 'original', primaryText: 'original', secondaryText: 'translation' },
    ]);
    expect(secondary[0].startMs).toBe(1000 + offset);
  });

  it('does not align beyond the tolerance or across empty gaps', () => {
    const segments = mergeSubtitleTimelines(
      [{ startMs: 1000, endMs: 4000, text: 'original' }],
      [{ startMs: 1301, endMs: 3699, text: 'translation' }, { startMs: 5000, endMs: 6000, text: 'next' }],
    );
    expect(segments.map(s => [s.startMs, s.endMs, s.primaryText, s.secondaryText])).toEqual([
      [1000, 1300, 'original', ''], [1301, 3698, 'original', 'translation'],
      [3699, 3999, 'original', ''], [5000, 5999, '', 'next'],
    ]);
  });

  it('does not collapse one original cue paired with two translated cues', () => {
    const segments = mergeSubtitleTimelines(
      [{ startMs: 1000, endMs: 4000, text: 'original' }],
      [{ startMs: 1100, endMs: 2500, text: 'one' }, { startMs: 2500, endMs: 3900, text: 'two' }],
    );
    expect(segments.map(s => [s.startMs, s.secondaryText])).toEqual([[1000, ''], [1100, 'one'], [2500, 'two'], [3900, '']]);
  });

  it('does not move boundaries into neighbouring translation cues', () => {
    const segments = mergeSubtitleTimelines(
      [{ startMs: 1000, endMs: 2000, text: 'A' }, { startMs: 2000, endMs: 3000, text: 'B' }],
      [{ startMs: 1100, endMs: 2100, text: 'one' }, { startMs: 2100, endMs: 3100, text: 'two' }],
    );
    expect(segments.find(s => s.startMs === 2000)?.secondaryText).toBe('one');
    expect(segments.find(s => s.startMs === 2100)?.secondaryText).toBe('two');
  });
});

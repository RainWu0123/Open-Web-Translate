import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NetflixSyncEngine } from '@/adapters/netflix/netflix-sync-engine';
import { SubtitleCue } from '@/shared/subtitles/ttml-parser';

describe('NetflixSyncEngine Unit Tests', () => {
  let engine: NetflixSyncEngine;

  const sampleCues: SubtitleCue[] = [
    { startMs: 5000, endMs: 8000, text: 'Second Cue' },
    { startMs: 1000, endMs: 4000, text: 'First Cue' },
    { startMs: 9000, endMs: 12000, text: 'Third Cue' },
  ];

  beforeEach(() => {
    engine = new NetflixSyncEngine();
  });

  it('automatically sorts unsorted cues by startMs ascending', () => {
    engine.setCues(sampleCues);
    const sorted = engine.getCues();
    expect(sorted[0].text).toBe('First Cue');
    expect(sorted[1].text).toBe('Second Cue');
    expect(sorted[2].text).toBe('Third Cue');
  });

  it('performs accurate binary search for cue matching videoMs', () => {
    engine.setCues(sampleCues);

    expect(engine.binarySearchCue(500)).toBeUndefined();
    expect(engine.binarySearchCue(2000)?.text).toBe('First Cue');
    expect(engine.binarySearchCue(4500)).toBeUndefined();
    expect(engine.binarySearchCue(6000)?.text).toBe('Second Cue');
    expect(engine.binarySearchCue(10000)?.text).toBe('Third Cue');
    expect(engine.binarySearchCue(15000)).toBeUndefined();
  });

  it('triggers onCueChange callback when active cue changes', () => {
    const cb = vi.fn();
    engine.setCues(sampleCues);
    engine.start(cb);

    engine.syncOnce(2000);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ text: 'First Cue' }), 2000);

    // Same cue timestamp should not re-trigger callback unnecessarily
    cb.mockClear();
    engine.syncOnce(2500);
    expect(cb).not.toHaveBeenCalled();

    // Moving to next cue
    engine.syncOnce(6000);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ text: 'Second Cue' }), 6000);

    engine.stop();
  });

  it('emits empty intervals only once and resets on a new timeline and seeks', () => {
    const cb = vi.fn();
    engine.setCues(sampleCues);
    engine.start(cb);
    engine.syncOnce(4500);
    engine.syncOnce(4600);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(null, 4500);
    engine.syncOnce(2000);
    expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'First Cue' }), 2000);
    engine.syncOnce(4500);
    expect(cb).toHaveBeenLastCalledWith(null, 4500);
    cb.mockClear();
    engine.setCues(sampleCues);
    engine.syncOnce(4500);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenLastCalledWith(null, 4500);
    engine.stop();
  });
});

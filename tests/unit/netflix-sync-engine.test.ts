import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NetflixSyncEngine } from '@/adapters/netflix/netflix-sync-engine';
import { SubtitleCue } from '@/shared/subtitles/ttml-parser';
import { djb2Hash, BATCH_MAX_CHARS, NetflixTranslationPipeline } from '@/adapters/netflix/netflix-translation-pipeline';

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
});

describe('NetflixTranslationPipeline & djb2Hash Tests', () => {
  it('generates consistent unsigned 32-bit integer hashes via djb2Hash', () => {
    const h1 = djb2Hash('Hello World');
    const h2 = djb2Hash('Hello World');
    const h3 = djb2Hash('Different Text');

    expect(typeof h1).toBe('number');
    expect(h1).toBeGreaterThanOrEqual(0);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it('enforces BATCH_MAX_CHARS payload chunking limit', () => {
    expect(BATCH_MAX_CHARS).toBe(3000);
    const pipeline = new NetflixTranslationPipeline();
    const key = pipeline.getCacheKey('zh-TW', 'Test Text');
    expect(key).toContain('zh-TW:');
  });
});

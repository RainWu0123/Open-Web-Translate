import { describe, it, expect } from 'vitest';
import { DomCueTimelineBuilder } from '@/adapters/dom-cue-timeline';

describe('DomCueTimelineBuilder (AI-mode fallback timeline)', () => {
  it('records cue appearance times as startMs and closes on the next cue', () => {
    const builder = new DomCueTimelineBuilder();

    builder.open('Hello there', 1_000);
    builder.open('General Kenobi', 4_200);
    builder.open('You are a bold one', 7_000);

    expect(builder.timeline()).toEqual([
      { startMs: 1_000, endMs: 4_200 },
      { startMs: 4_200, endMs: 7_000 },
    ]);
  });

  it('closes the open cue on explicit clear (grace period expiry)', () => {
    const builder = new DomCueTimelineBuilder();
    builder.open('Hello', 1_000);
    builder.closeAll(5_500);

    expect(builder.timeline()).toEqual([{ startMs: 1_000, endMs: 5_500 }]);
  });

  it('ignores duplicate opens of the same text (no zero-length cue)', () => {
    const builder = new DomCueTimelineBuilder();
    builder.open('Hello', 1_000);
    builder.open('Hello', 1_900);
    builder.closeAll(3_000);

    expect(builder.timeline()).toEqual([{ startMs: 1_000, endMs: 3_000 }]);
  });

  it('keeps only the most recent cues (bounded memory)', () => {
    const builder = new DomCueTimelineBuilder(5);
    for (let i = 0; i < 12; i++) {
      builder.open(`line ${i}`, i * 1_000);
    }
    builder.closeAll(12_000);

    const timeline = builder.timeline();
    expect(timeline.length).toBe(5);
    expect(timeline[0].startMs).toBe(7_000);
  });

  it('re-opening a previously closed text starts a fresh entry (replay)', () => {
    const builder = new DomCueTimelineBuilder();
    builder.open('Hello', 1_000);
    builder.open('World', 3_000);
    builder.open('Hello', 9_000);
    builder.closeAll(11_000);

    expect(builder.timeline()).toEqual([
      { startMs: 1_000, endMs: 3_000 },
      { startMs: 3_000, endMs: 9_000 },
      { startMs: 9_000, endMs: 11_000 },
    ]);
  });

  it('reset clears everything on navigation', () => {
    const builder = new DomCueTimelineBuilder();
    builder.open('Hello', 1_000);
    builder.reset();
    builder.closeAll(2_000);

    expect(builder.timeline()).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { parseYouTubeTimedText, coalesceYouTubeCues } from '@/adapters/youtube/youtube-timedtext-parser';

describe('YouTube TimedText Parser & Sentence Coalescer', () => {
  it('preserves native cue boundaries without changing the AI sentence parser', () => {
    const payload = JSON.stringify({ events: [
      { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'First' }] },
      { tStartMs: 2000, dDurationMs: 1500, segs: [{ utf8: 'second.' }] },
    ] });
    expect(parseYouTubeTimedText(payload, { preserveTiming: true })).toEqual([
      { startMs: 1000, endMs: 2000, text: 'First' },
      { startMs: 2000, endMs: 3500, text: 'second.' },
    ]);
    expect(parseYouTubeTimedText(payload)).toHaveLength(1);
  });

  it('updates overlapping native ASR cues when a replacement or append begins', () => {
    const payload = JSON.stringify({ events: [
      { tStartMs: 1000, dDurationMs: 5000, segs: [{ utf8: 'First' }] },
      { tStartMs: 2600, dDurationMs: 4500, segs: [{ utf8: 'Second' }] },
      { tStartMs: 4200, dDurationMs: 3800, aAppend: 1, segs: [{ utf8: ' part' }] },
    ] });
    expect(parseYouTubeTimedText(payload, { preserveTiming: true })).toEqual([
      { startMs: 1000, endMs: 2600, text: 'First' },
      { startMs: 2600, endMs: 4200, text: 'Second' },
      { startMs: 4200, endMs: 8000, text: 'Second part' },
    ]);
  });
  it('coalesces fragmented YouTube ASR json3 events into complete timed sentences', () => {
    const json3Payload = JSON.stringify({
      events: [
        {
          tStartMs: 1000,
          dDurationMs: 5000,
          segs: [{ utf8: 'Welcome' }, { utf8: ' to', tOffsetMs: 300 }, { utf8: ' today\'s', tOffsetMs: 600 }],
        },
        {
          tStartMs: 2500,
          dDurationMs: 5000,
          aAppend: 1,
          segs: [{ utf8: '\n' }],
        },
        {
          tStartMs: 2600,
          dDurationMs: 4500,
          segs: [{ utf8: 'video' }, { utf8: ' where', tOffsetMs: 400 }, { utf8: ' we', tOffsetMs: 700 }],
        },
        {
          tStartMs: 4200,
          dDurationMs: 3800,
          segs: [{ utf8: 'explore' }, { utf8: ' AI', tOffsetMs: 350 }, { utf8: ' translation.', tOffsetMs: 750 }],
        },
        {
          tStartMs: 8500,
          dDurationMs: 3000,
          segs: [{ utf8: 'Let us begin right now!' }],
        },
      ],
    });

    const cues = parseYouTubeTimedText(json3Payload);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({
      startMs: 1000,
      endMs: 8000,
      text: "Welcome to today's video where we explore AI translation.",
    });
    expect(cues[1]).toEqual({
      startMs: 8500,
      endMs: 11500,
      text: 'Let us begin right now!',
    });
  });

  it('parses XML <text start dur> timedtext and coalesces unpunctuated fragments', () => {
    const xml = `<?xml version="1.0" encoding="utf-8" ?>
      <transcript>
        <text start="1.2" dur="1.8">これはYouTubeの</text>
        <text start="3.0" dur="2.2">自動生成字幕です。</text>
        <text start="5.5" dur="2.5">次の文も&amp;テストします！</text>
      </transcript>`;

    const cues = parseYouTubeTimedText(xml);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('これはYouTubeの自動生成字幕です。');
    expect(cues[0].startMs).toBe(1200);
    expect(cues[0].endMs).toBe(5200);
    expect(cues[1].text).toBe('次の文も&テストします！');
    expect(cues[1].startMs).toBe(5500);
    expect(cues[1].endMs).toBe(8000);
  });

  it('guarantees strictly non-overlapping cue intervals for binary search sync', () => {
    const cues = coalesceYouTubeCues([
      { startMs: 0, endMs: 4000, text: 'First complete sentence.' },
      { startMs: 3500, endMs: 7000, text: 'Second complete sentence.' },
    ]);

    expect(cues).toHaveLength(2);
    expect(cues[0].endMs).toBeLessThan(cues[1].startMs);
  });

  it('splits events containing mid-line sentence boundaries so trailing words merge into the next sentence', () => {
    const cues = coalesceYouTubeCues([
      { startMs: 52000, endMs: 55000, text: "The Israeli Prime Minister's office released a statement" },
      { startMs: 55000, endMs: 58000, text: 'referring to the attack as quote alleged. Part of the' },
      { startMs: 58000, endMs: 61500, text: 'statement reads these reports come amid concerns.' },
    ]);

    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe(
      "The Israeli Prime Minister's office released a statement referring to the attack as quote alleged.",
    );
    expect(cues[1].text).toBe('Part of the statement reads these reports come amid concerns.');
  });
});


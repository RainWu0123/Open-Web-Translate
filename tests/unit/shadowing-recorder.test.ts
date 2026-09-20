import { describe, it, expect } from 'vitest';
import { ShadowingRecorder } from '../../src/features/learning/shadowing-recorder';

describe('ShadowingRecorder Unit Tests', () => {
  const recorder = new ShadowingRecorder();

  it('normalizes text by stripping punctuation and lowercasing', () => {
    const raw = '  "Hello, World! How are you?" — She asked. ';
    expect(recorder.normalizeText(raw)).toBe('hello world how are you she asked');

    const cjk = '「今日は、いい天気ですね！」';
    expect(recorder.normalizeText(cjk)).toBe('今日はいい天気ですね');
  });

  it('calculates 100% similarity for identical phrases', () => {
    const s = 'The quick brown fox jumps over the lazy dog';
    expect(recorder.calculateSimilarity(s, s)).toBe(100);
  });

  it('calculates expected similarity for minor speech recognition errors', () => {
    const expected = 'The quick brown fox jumps over the lazy dog';
    const spoken = 'The quick brown fox jump over the lazy dogs'; // minor plural/verb endings

    const score = recorder.calculateSimilarity(spoken, expected);
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it('evaluates qualitative rating correctly', () => {
    const excellent = recorder.evaluate('Hello how are you', 'Hello, how are you?');
    expect(excellent.rating).toBe('excellent');
    expect(excellent.accuracy).toBe(100);

    const retry = recorder.evaluate('Something completely different', 'Good morning everyone');
    expect(retry.rating).toBe('retry');
    expect(retry.accuracy).toBeLessThan(60);
  });
});

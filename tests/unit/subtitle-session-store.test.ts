import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SubtitleSessionStore,
  tokenizeText,
} from '@/core/session/subtitle-session-store';

describe('SubtitleSessionStore', () => {
  let store: SubtitleSessionStore;

  beforeEach(() => {
    store = new SubtitleSessionStore();
  });

  describe('tokenizeText', () => {
    it('keeps accented words intact and splits Japanese into words', () => {
      const words = tokenizeText('fr', 'Un café délicieux.', 'fr');
      expect(words.map(t => t.surface)).toContain('délicieux');
      const sentence = '私は日本語を勉強しています';
      const tokens = tokenizeText('ja', sentence, 'ja');
      expect(tokens.length).toBeGreaterThan(2);
      for (const token of tokens) expect(sentence.slice(token.start, token.end)).toBe(token.surface);
    });
    it('tokenizes Western text into words', () => {
      const tokens = tokenizeText('cue-1', 'Hello world!', 'en');
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].surface).toBe('Hello');
    });

    it('tokenizes CJK text into character clusters', () => {
      const tokens = tokenizeText('cue-2', '白鼠實驗', 'zh-Hant');
      expect(tokens.length).toBeGreaterThan(0);
    });
  });
});

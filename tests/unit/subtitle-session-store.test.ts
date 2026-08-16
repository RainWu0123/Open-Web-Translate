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

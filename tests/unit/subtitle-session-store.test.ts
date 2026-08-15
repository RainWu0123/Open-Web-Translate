import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SubtitleSessionStore,
  decideSubtitleMode,
  isUsableTextTrack,
  tokenizeText,
} from '@/core/session/subtitle-session-store';

describe('SubtitleSessionStore', () => {
  let store: SubtitleSessionStore;

  beforeEach(() => {
    store = new SubtitleSessionStore();
  });

  describe('isUsableTextTrack', () => {
    it('returns false for empty or undefined track', () => {
      expect(isUsableTextTrack(undefined)).toBe(false);
    });

    it('returns false for bitmap tracks', () => {
      expect(
        isUsableTextTrack({
          id: '1',
          lang: 'en',
          source: 'manifest',
          isBitmap: true,
          cues: [
            { id: 'c1', startMs: 0, endMs: 1000, text: 'Hello', lang: 'en', source: 'netflix-native' },
            { id: 'c2', startMs: 1000, endMs: 2000, text: 'World', lang: 'en', source: 'netflix-native' },
          ],
        }),
      ).toBe(false);
    });

    it('returns true for text tracks with valid cues', () => {
      expect(
        isUsableTextTrack({
          id: '1',
          lang: 'zh-Hant',
          source: 'manifest',
          isBitmap: false,
          cues: [
            { id: 'c1', startMs: 0, endMs: 1000, text: '你好', lang: 'zh-Hant', source: 'netflix-native' },
            { id: 'c2', startMs: 1000, endMs: 2000, text: '世界', lang: 'zh-Hant', source: 'netflix-native' },
          ],
        }),
      ).toBe(true);
    });
  });

  describe('decideSubtitleMode', () => {
    it('returns dual-native when both primary and secondary are usable text tracks', () => {
      const primary = {
        id: '1',
        lang: 'zh-Hant',
        source: 'manifest' as const,
        cues: [
          { id: 'c1', startMs: 0, endMs: 1000, text: '你好', lang: 'zh-Hant', source: 'netflix-native' as const },
          { id: 'c2', startMs: 1000, endMs: 2000, text: '世界', lang: 'zh-Hant', source: 'netflix-native' as const },
        ],
      };
      const secondary = {
        id: '2',
        lang: 'en',
        source: 'manifest' as const,
        cues: [
          { id: 'c3', startMs: 0, endMs: 1000, text: 'Hello', lang: 'en', source: 'netflix-native' as const },
          { id: 'c4', startMs: 1000, endMs: 2000, text: 'World', lang: 'en', source: 'netflix-native' as const },
        ],
      };

      expect(decideSubtitleMode(primary, secondary)).toBe('dual-native');
    });

    it('returns primary-native-ai-secondary when only primary is available', () => {
      const primary = {
        id: '1',
        lang: 'zh-Hant',
        source: 'manifest' as const,
        cues: [
          { id: 'c1', startMs: 0, endMs: 1000, text: '你好', lang: 'zh-Hant', source: 'netflix-native' as const },
          { id: 'c2', startMs: 1000, endMs: 2000, text: '世界', lang: 'zh-Hant', source: 'netflix-native' as const },
        ],
      };
      expect(decideSubtitleMode(primary, undefined)).toBe('primary-native-ai-secondary');
    });
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

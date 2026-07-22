import { describe, it, expect, beforeEach } from 'vitest';
import {
  SubtitleSessionStore,
  tokenizeText,
  decideSubtitleMode,
  CapturedTrack,
} from '@/core/session/subtitle-session-store';

describe('SubtitleSessionStore & Language Learning Engine Unit Tests', () => {
  let store: SubtitleSessionStore;

  beforeEach(() => {
    store = new SubtitleSessionStore();
  });

  it('tokenizeText splits CJK text into tokenized spans with unique IDs', () => {
    const tokens = tokenizeText('cue-1', '莉莉白鼠を', 'ja');
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0].id).toBe('cue-1:0-5');
    expect(tokens[0].surface).toBe('莉莉白鼠を');
  });

  it('tokenizeText splits Western text into word tokens', () => {
    const tokens = tokenizeText('cue-2', 'Hello world example', 'en');
    expect(tokens.length).toBe(3);
    expect(tokens[0].surface).toBe('Hello');
    expect(tokens[0].normalized).toBe('hello');
    expect(tokens[1].surface).toBe('world');
  });

  it('decideSubtitleMode enforces strict Dual-Native vs AI-Mode vs Native-Only gate', () => {
    const validTrack1: CapturedTrack = {
      id: 't1',
      lang: 'ja',
      source: 'manifest',
      cues: [
        { id: 'c1', startMs: 1000, endMs: 3000, text: 'こんにちは', lang: 'ja', source: 'netflix-native' },
        { id: 'c2', startMs: 4000, endMs: 6000, text: '世界', lang: 'ja', source: 'netflix-native' },
      ],
    };

    const validTrack2: CapturedTrack = {
      id: 't2',
      lang: 'zh-Hant',
      source: 'manifest',
      cues: [
        { id: 'c3', startMs: 1000, endMs: 3000, text: '你好', lang: 'zh-Hant', source: 'netflix-native' },
        { id: 'c4', startMs: 4000, endMs: 6000, text: '世界', lang: 'zh-Hant', source: 'netflix-native' },
      ],
    };

    const invalidTrack: CapturedTrack = {
      id: 't3',
      lang: 'zh-Hant',
      source: 'dom',
      cues: [],
    };

    expect(decideSubtitleMode(validTrack1, validTrack2)).toBe('dual-native');
    expect(decideSubtitleMode(validTrack1, invalidTrack)).toBe('primary-native-ai-secondary');
    expect(decideSubtitleMode(invalidTrack, invalidTrack)).toBe('native-player-only');
  });

  it('getActivePair retrieves paired primary and secondary cues matching current time', () => {
    const primaryTrack: CapturedTrack = {
      id: 't1',
      lang: 'ja',
      source: 'manifest',
      cues: [{ id: 'c1', startMs: 1000, endMs: 5000, text: 'こんにちは', lang: 'ja', source: 'netflix-native' }],
    };

    const secondaryTrack: CapturedTrack = {
      id: 't2',
      lang: 'zh-Hant',
      source: 'manifest',
      cues: [{ id: 'c2', startMs: 1000, endMs: 5000, text: '你好', lang: 'zh-Hant', source: 'netflix-native' }],
    };

    store.setPrimaryTrack(primaryTrack);
    store.setSecondaryTrack(secondaryTrack);

    const pairAt2s = store.getActivePair(2000);
    expect(pairAt2s).not.toBeNull();
    expect(pairAt2s?.primary.text).toBe('こんにちは');
    expect(pairAt2s?.secondary?.text).toBe('你好');

    const pairAt8s = store.getActivePair(8000);
    expect(pairAt8s).toBeNull();
  });

  it('saves and retrieves vocabulary cards correctly', async () => {
    const card = await store.saveVocabularyCard({
      language: 'ja',
      lemma: '白鼠',
      surface: '白鼠',
      reading: 'しろねずみ',
      meaning: '白色的小鼠',
      example: {
        text: '莉莉白鼠を？',
        translation: '莉莉的白鼠？',
        episodeId: 'ep-1',
        cueStartMs: 1000,
      },
    });

    expect(card.id).toBeDefined();
    expect(card.surface).toBe('白鼠');

    const allCards = store.getVocabularyCards();
    expect(allCards.length).toBe(1);
    expect(allCards[0].lemma).toBe('白鼠');
  });
});

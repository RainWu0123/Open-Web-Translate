import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiLearningEngine } from '../../src/core/pipeline/ai-learning-engine';

const { mockGetProvider } = vi.hoisted(() => ({ mockGetProvider: vi.fn() }));

vi.mock('@/infrastructure/providers', () => ({ getProvider: mockGetProvider }));
vi.mock('wxt/browser', () => ({
  browser: { storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } } },
}));

const baseSettings = {
  activeProviderId: 'gemini-provider',
  enabled: true,
  sourceLanguage: 'en',
  targetLanguage: 'zh-Hant',
  defaultTranslationMode: 'fast' as const,
  geminiModel: 'gemini-test',
};

function provider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gemini-provider',
    displayName: 'Test AI',
    isLocal: true,
    capabilities: { structuredAnalysis: true },
    validateConfig: () => ({ isValid: true }),
    translate: vi.fn().mockResolvedValue({
      providerId: 'gemini-provider',
      segments: [{ id: 'learning-fallback', text: '善良的' }],
      warnings: [],
      cacheable: false,
    }),
    generateStructured: vi.fn(),
    ...overrides,
  } as any;
}

describe('AiLearningEngine', () => {
  let engine: AiLearningEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new AiLearningEngine();
  });

  it('cleans model JSON wrapped in markdown fences', () => {
    expect(engine.cleanJsonText('```json\n{"lemma":"test"}\n```')).toBe('{"lemma":"test"}');
    expect(engine.cleanJsonText('```\n{"lemma":"run"}\n```')).toBe('{"lemma":"run"}');
  });

  it('labels translation-only fallback without inventing grammar data', async () => {
    const selected = provider({ capabilities: { structuredAnalysis: false } });
    mockGetProvider.mockReturnValue(selected);
    const result = await engine.analyzeWord({
      word: 'benevolent', sentence: 'He was a benevolent leader.', sourceLang: 'en', targetLang: 'zh-Hant',
    }, { ...baseSettings, activeProviderId: 'google-provider' });

    expect(result.meaningInContext).toBe('善良的');
    expect(result.analysisSource).toBe('translation-only');
    expect(result.pos).toBe('unknown');
    expect(result.examples).toEqual([]);
  });

  it('uses the provider structured-analysis contract and caches successful analysis', async () => {
    const generateStructured = vi.fn().mockResolvedValue({
      lemma: 'benevolent', pos: 'adjective', phonetic: '/bəˈnev.əl.ənt/',
      meaningInContext: '仁慈的、和藹的', generalMeanings: ['慈善的'],
      collocations: ['benevolent smile'], examples: [{ sentence: 'A benevolent smile', translation: '和藹的微笑' }],
    });
    mockGetProvider.mockReturnValue(provider({ generateStructured }));
    const request = {
      word: 'benevolent', sentence: 'He was a benevolent leader.', sourceLang: 'en', targetLang: 'zh-Hant',
    };
    const first = await engine.analyzeWord(request, baseSettings);
    const second = await engine.analyzeWord(request, baseSettings);

    expect(first.analysisSource).toBe('ai');
    expect(first.pos).toBe('adjective');
    expect(first.meaningInContext).toBe('仁慈的、和藹的');
    expect(second).toEqual(first);
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });

  it('returns genuine structured grammar analysis', async () => {
    mockGetProvider.mockReturnValue(provider({
      generateStructured: vi.fn().mockResolvedValue({
        translation: '他是一位仁慈的領袖。',
        breakdown: [{ segment: 'He', role: '主詞', explanation: '第三人稱單數代名詞' }],
        keyPoints: ['一般過去時態'], difficultyLevel: 'B1', nuanceOrTone: '正式書面語',
      }),
    }));
    const result = await engine.explainGrammar({
      sentence: 'He was a benevolent leader.', focusWord: 'benevolent', sourceLang: 'en', targetLang: 'zh-Hant',
    }, baseSettings);

    expect(result.analysisSource).toBe('ai');
    expect(result.translation).toBe('他是一位仁慈的領袖。');
    expect(result.breakdown).toHaveLength(1);
    expect(result.keyPoints).toContain('一般過去時態');
  });
});

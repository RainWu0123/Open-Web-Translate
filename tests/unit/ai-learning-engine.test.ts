import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiLearningEngine } from '../../src/core/pipeline/ai-learning-engine';
import { translationPipeline } from '../../src/core/pipeline/translation-pipeline';

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

describe('AiLearningEngine Unit Tests', () => {
  let engine: AiLearningEngine;

  beforeEach(() => {
    engine = new AiLearningEngine();
    vi.restoreAllMocks();
  });

  it('cleans raw JSON text even if wrapped in markdown codeblocks', () => {
    const rawWithTriple = '```json\n{"lemma": "test", "pos": "noun"}\n```';
    expect(engine.cleanJsonText(rawWithTriple)).toBe('{"lemma": "test", "pos": "noun"}');

    const rawGeneric = '```\n{"lemma": "run", "pos": "verb"}\n```';
    expect(engine.cleanJsonText(rawGeneric)).toBe('{"lemma": "run", "pos": "verb"}');

    const plain = '{"lemma": "apple"}';
    expect(engine.cleanJsonText(plain)).toBe('{"lemma": "apple"}');
  });

  it('falls back gracefully to heuristic word analysis when AI is not configured', async () => {
    vi.spyOn(translationPipeline, 'translate').mockResolvedValueOnce({
      segments: [{ id: 'fallback-word-gloss', translatedText: '善良的' }],
    });

    const result = await engine.analyzeWord(
      {
        word: 'benevolent',
        sentence: 'He was a benevolent leader.',
        sourceLang: 'en',
        targetLang: 'zh-Hant',
      },
      {
        activeProviderId: 'google-provider',
        enabled: true,
        sourceLanguage: 'en',
        targetLanguage: 'zh-Hant',
        defaultTranslationMode: 'fast',
      },
    );

    expect(result.word).toBe('benevolent');
    expect(result.meaningInContext).toBe('善良的');
    expect(result.lemma).toBe('benevolent');
    expect(result.generalMeanings).toContain('善良的');
  });

  it('parses structured JSON when AI word analysis returns response', async () => {
    const mockAiResponse = JSON.stringify({
      word: 'benevolent',
      lemma: 'benevolent',
      pos: 'adjective',
      phonetic: '/bəˈnev.əl.ənt/',
      meaningInContext: '仁慈的、和藹的',
      generalMeanings: ['慈善的', '好心的'],
      collocations: ['benevolent smile', 'benevolent fund'],
      examples: [{ sentence: 'A benevolent smile', translation: '和藹的微笑' }],
    });

    vi.spyOn(translationPipeline, 'translate').mockResolvedValueOnce({
      segments: [{ id: 'ai-word-analysis', translatedText: '```json\n' + mockAiResponse + '\n```' }],
    });

    const result = await engine.analyzeWord(
      {
        word: 'benevolent',
        sentence: 'He was a benevolent leader.',
        sourceLang: 'en',
        targetLang: 'zh-Hant',
      },
      {
        activeProviderId: 'gemini-provider',
        hasGeminiApiKey: true,
        geminiApiKey: 'AIzaSyFakeKey',
        enabled: true,
        sourceLanguage: 'en',
        targetLanguage: 'zh-Hant',
        defaultTranslationMode: 'fast',
      },
    );

    expect(result.word).toBe('benevolent');
    expect(result.pos).toBe('adjective');
    expect(result.phonetic).toBe('/bəˈnev.əl.ənt/');
    expect(result.meaningInContext).toBe('仁慈的、和藹的');
    expect(result.collocations).toContain('benevolent smile');
  });

  it('parses structured JSON when AI grammar explanation returns response', async () => {
    const mockGrammarResponse = JSON.stringify({
      sentence: 'He was a benevolent leader.',
      translation: '他是一位仁慈的領袖。',
      breakdown: [
        { segment: 'He', role: '主詞', explanation: '第三人稱單數代名詞' },
        { segment: 'was', role: 'be 動詞', explanation: '過去式單數動詞' },
        { segment: 'a benevolent leader', role: '名詞片語/補語', explanation: '形容詞修飾名詞' },
      ],
      keyPoints: ['一般過去時態', '形容詞修飾單數名詞'],
      difficultyLevel: 'B1',
      nuanceOrTone: '正式書面語',
    });

    vi.spyOn(translationPipeline, 'translate').mockResolvedValueOnce({
      segments: [{ id: 'ai-grammar-analysis', translatedText: mockGrammarResponse }],
    });

    const explanation = await engine.explainGrammar(
      {
        sentence: 'He was a benevolent leader.',
        focusWord: 'benevolent',
        sourceLang: 'en',
        targetLang: 'zh-Hant',
      },
      {
        activeProviderId: 'gemini-provider',
        hasGeminiApiKey: true,
        geminiApiKey: 'AIzaSyFakeKey',
        enabled: true,
        sourceLanguage: 'en',
        targetLanguage: 'zh-Hant',
        defaultTranslationMode: 'fast',
      },
    );

    expect(explanation.sentence).toBe('He was a benevolent leader.');
    expect(explanation.translation).toBe('他是一位仁慈的領袖。');
    expect(explanation.breakdown.length).toBe(3);
    expect(explanation.keyPoints).toContain('一般過去時態');
    expect(explanation.difficultyLevel).toBe('B1');
  });
});

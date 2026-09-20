/**
 * AI Language Learning Engine
 *
 * Provides contextual word analysis, morphological breakdown,
 * and sentence grammar analysis using active AI providers with
 * graceful fallback to translation pipeline and linguistic heuristics.
 */
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { translationPipeline } from '@/core/pipeline/translation-pipeline';
import type { ExtensionSettings } from '@/core/contracts/messages';
import type {
  WordAnalysisRequest,
  WordAnalysisResult,
  GrammarExplanationRequest,
  GrammarExplanation,
} from '@/core/domain/learning-types';
import { createLogger } from '@/shared/logger';

const logger = createLogger('AiLearningEngine');

export class AiLearningEngine {
  private analysisCache = new Map<string, WordAnalysisResult>();
  private grammarCache = new Map<string, GrammarExplanation>();

  /**
   * Cleans raw model output to extract JSON even if enclosed in markdown code blocks.
   */
  public cleanJsonText(raw: string): string {
    let text = raw.trim();
    if (text.startsWith('```json')) {
      text = text.slice(7);
    } else if (text.startsWith('```')) {
      text = text.slice(3);
    }
    if (text.endsWith('```')) {
      text = text.slice(0, -3);
    }
    return text.trim();
  }

  /**
   * Analyzes a word in the context of its sentence.
   */
  public async analyzeWord(
    req: WordAnalysisRequest,
    customSettings?: ExtensionSettings,
  ): Promise<WordAnalysisResult> {
    const cacheKey = `${req.sourceLang}:${req.targetLang}:${req.word}:${req.sentence}`;
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey)!;
    }

    const settings = customSettings || (await SettingsStorage.get());
    const isAiConfigured =
      (settings.activeProviderId === 'gemini-provider' && Boolean(settings.hasGeminiApiKey || settings.geminiApiKey)) ||
      settings.activeProviderId === 'ollama-provider' ||
      settings.activeProviderId === 'local-http-provider' ||
      settings.activeProviderId === 'chrome-builtin-ai-provider';

    let result: WordAnalysisResult | null = null;

    if (isAiConfigured) {
      try {
        result = await this.queryAiWordAnalysis(req, settings);
      } catch (err) {
        logger.warn('AI word analysis failed, falling back to heuristic gloss', err);
      }
    }

    if (!result) {
      result = await this.fallbackWordAnalysis(req);
    }

    this.analysisCache.set(cacheKey, result);
    return result;
  }

  /**
   * Explains the grammar and structure of a sentence.
   */
  public async explainGrammar(
    req: GrammarExplanationRequest,
    customSettings?: ExtensionSettings,
  ): Promise<GrammarExplanation> {
    const cacheKey = `${req.sourceLang}:${req.targetLang}:${req.focusWord || ''}:${req.sentence}`;
    if (this.grammarCache.has(cacheKey)) {
      return this.grammarCache.get(cacheKey)!;
    }

    const settings = customSettings || (await SettingsStorage.get());
    const isAiConfigured =
      (settings.activeProviderId === 'gemini-provider' && Boolean(settings.hasGeminiApiKey || settings.geminiApiKey)) ||
      settings.activeProviderId === 'ollama-provider' ||
      settings.activeProviderId === 'local-http-provider' ||
      settings.activeProviderId === 'chrome-builtin-ai-provider';

    let explanation: GrammarExplanation | null = null;

    if (isAiConfigured) {
      try {
        explanation = await this.queryAiGrammarExplanation(req, settings);
      } catch (err) {
        logger.warn('AI grammar explanation failed, falling back to heuristic breakdown', err);
      }
    }

    if (!explanation) {
      explanation = await this.fallbackGrammarExplanation(req);
    }

    this.grammarCache.set(cacheKey, explanation);
    return explanation;
  }

  // ─── AI Prompts & Queries ──────────────────────────────────────────

  private async queryAiWordAnalysis(
    req: WordAnalysisRequest,
    settings: ExtensionSettings,
  ): Promise<WordAnalysisResult> {
    const prompt = `You are an expert language teacher.
Analyze the target word "${req.word}" strictly in the context of this sentence:
"${req.sentence}"

Source Language: "${req.sourceLang}"
Target Language: "${req.targetLang}"

Return a single JSON object with these exact keys:
{
  "word": "${req.word}",
  "lemma": "base/dictionary form of the word",
  "pos": "part of speech (e.g. noun, verb, adjective, particle, adverb)",
  "phonetic": "IPA, Pinyin, or Furigana/Romaji reading",
  "meaningInContext": "concise meaning of this word in this specific context (in ${req.targetLang})",
  "generalMeanings": ["other common meaning 1", "other common meaning 2"],
  "collocations": ["common idiom or collocation containing this word"],
  "examples": [
    {
      "sentence": "simple natural example sentence using this word in ${req.sourceLang}",
      "translation": "translation in ${req.targetLang}"
    }
  ]
}

CRITICAL: Return ONLY valid JSON, no outside text or markdown blocks.`;

    const translationRes = await translationPipeline.translate({
      segments: [{ id: 'ai-word-analysis', text: prompt }],
      sourceLanguage: 'en',
      targetLanguage: req.targetLang,
      forceProvider: settings.activeProviderId,
    });

    const outputText = translationRes.segments?.[0]?.translatedText;
    if (!outputText) throw new Error('No AI response received');

    const cleaned = this.cleanJsonText(outputText);
    const parsed = JSON.parse(cleaned);

    return {
      word: req.word,
      lemma: parsed.lemma || req.word,
      pos: parsed.pos || 'unknown',
      phonetic: parsed.phonetic || undefined,
      meaningInContext: parsed.meaningInContext || parsed.meaning || '',
      generalMeanings: Array.isArray(parsed.generalMeanings) ? parsed.generalMeanings : [],
      collocations: Array.isArray(parsed.collocations) ? parsed.collocations : [],
      examples: Array.isArray(parsed.examples) ? parsed.examples : [],
    };
  }

  private async queryAiGrammarExplanation(
    req: GrammarExplanationRequest,
    settings: ExtensionSettings,
  ): Promise<GrammarExplanation> {
    const focusClause = req.focusWord ? `Focus especially on the usage and grammatical role of "${req.focusWord}".` : '';
    const prompt = `You are a linguistics and grammar expert.
Analyze the syntax, structure, and grammar of this sentence:
"${req.sentence}"
${focusClause}

Source Language: "${req.sourceLang}"
Target Language (Explanation language): "${req.targetLang}"

Return a single JSON object with these exact keys:
{
  "sentence": "${req.sentence}",
  "translation": "accurate natural translation in ${req.targetLang}",
  "breakdown": [
    {
      "segment": "word or phrase component",
      "role": "syntactic role (e.g. subject, topic marker, verb-te form, object)",
      "explanation": "concise explanation of its function in ${req.targetLang}"
    }
  ],
  "keyPoints": [
    "grammar point 1 (e.g. conditional form, past tense nuance, honorific level)",
    "grammar point 2"
  ],
  "difficultyLevel": "CEFR level (A1-C2) or JLPT level (N5-N1)",
  "nuanceOrTone": "tone or cultural context (e.g. casual spoken, formal business, ironic)"
}

CRITICAL: Return ONLY valid JSON, no outside text or markdown blocks.`;

    const translationRes = await translationPipeline.translate({
      segments: [{ id: 'ai-grammar-analysis', text: prompt }],
      sourceLanguage: 'en',
      targetLanguage: req.targetLang,
      forceProvider: settings.activeProviderId,
    });

    const outputText = translationRes.segments?.[0]?.translatedText;
    if (!outputText) throw new Error('No AI response received');

    const cleaned = this.cleanJsonText(outputText);
    const parsed = JSON.parse(cleaned);

    return {
      sentence: req.sentence,
      translation: parsed.translation || '',
      breakdown: Array.isArray(parsed.breakdown) ? parsed.breakdown : [],
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      difficultyLevel: parsed.difficultyLevel || undefined,
      nuanceOrTone: parsed.nuanceOrTone || undefined,
    };
  }

  // ─── Fallback Heuristics ──────────────────────────────────────────

  private async fallbackWordAnalysis(req: WordAnalysisRequest): Promise<WordAnalysisResult> {
    const glossRes = await translationPipeline.translate({
      segments: [{ id: 'fallback-word-gloss', text: req.word }],
      sourceLanguage: req.sourceLang,
      targetLanguage: req.targetLang,
    });

    const gloss = glossRes.segments?.[0]?.translatedText || req.word;

    // Detect phonetic/reading hint for CJK if possible
    let phonetic: string | undefined;
    const isJapanese = /[\u3040-\u309f\u30a0-\u30ff]/.test(req.word);
    const isKatakana = /^[\u30a0-\u30ff]+$/.test(req.word);
    if (isKatakana) {
      phonetic = req.word;
    }

    return {
      word: req.word,
      lemma: req.word.toLowerCase(),
      pos: isJapanese ? '詞' : 'word',
      phonetic,
      meaningInContext: gloss,
      generalMeanings: [gloss],
      collocations: [],
      examples: req.sentence ? [{ sentence: req.sentence, translation: '' }] : [],
    };
  }

  private async fallbackGrammarExplanation(req: GrammarExplanationRequest): Promise<GrammarExplanation> {
    const transRes = await translationPipeline.translate({
      segments: [{ id: 'fallback-sentence-trans', text: req.sentence }],
      sourceLanguage: req.sourceLang,
      targetLanguage: req.targetLang,
    });

    const translation = transRes.segments?.[0]?.translatedText || '';

    return {
      sentence: req.sentence,
      translation,
      breakdown: [
        {
          segment: req.focusWord || req.sentence,
          role: '目標焦點',
          explanation: `在語句中作主要成分。`,
        },
      ],
      keyPoints: ['基礎句型與語意對應'],
      difficultyLevel: undefined,
      nuanceOrTone: '標準語氣',
    };
  }
}

export const aiLearningEngine = new AiLearningEngine();

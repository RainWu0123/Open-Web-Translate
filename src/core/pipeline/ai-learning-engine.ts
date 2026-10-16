import type { ExtensionSettings, InternalExtensionSettings } from '@/core/contracts/messages';
import type { TranslationProvider } from '@/core/contracts/provider';
import type {
  GrammarBreakdownItem,
  GrammarExplanation,
  GrammarExplanationRequest,
  WordAnalysisRequest,
  WordAnalysisResult,
} from '@/core/domain/learning-types';
import { ConfigurationError } from '@/core/domain/errors/translation-errors';
import { resolveProviderId } from '@/core/settings/provider-selection';
import { getProvider } from '@/infrastructure/providers';
import { getProviderCacheIdentity } from '@/infrastructure/providers/cache-identity';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { createLogger } from '@/shared/logger';

const logger = createLogger('AiLearningEngine');
const CACHE_LIMIT = 200;

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export class AiLearningEngine {
  private analysisCache = new Map<string, WordAnalysisResult>();
  private grammarCache = new Map<string, GrammarExplanation>();

  public cleanJsonText(raw: string): string {
    return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  public async analyzeWord(
    req: WordAnalysisRequest,
    customSettings?: ExtensionSettings,
  ): Promise<WordAnalysisResult> {
    const settings = customSettings ?? await SettingsStorage.getInternal();
    const providerId = resolveProviderId(settings, req.usage);
    const identity = getProviderCacheIdentity(providerId, settings);
    const cacheKey = JSON.stringify(['word-v2', identity.providerId, identity.fingerprint, req]);
    const cached = this.analysisCache.get(cacheKey);
    if (cached) return cached;

    const provider = getProvider(providerId, settings as InternalExtensionSettings);
    this.assertRemoteDisclosure(settings, provider);

    try {
      const result = await this.queryWordAnalysis(req, provider);
      this.remember(this.analysisCache, cacheKey, result);
      return result;
    } catch (error) {
      logger.warn('Structured word analysis unavailable; returning an honest translation-only result', error);
      return this.fallbackWordAnalysis(req, provider, this.errorMessage(error));
    }
  }

  public async explainGrammar(
    req: GrammarExplanationRequest,
    customSettings?: ExtensionSettings,
  ): Promise<GrammarExplanation> {
    const settings = customSettings ?? await SettingsStorage.getInternal();
    const providerId = resolveProviderId(settings, req.usage);
    const identity = getProviderCacheIdentity(providerId, settings);
    const cacheKey = JSON.stringify(['grammar-v2', identity.providerId, identity.fingerprint, req]);
    const cached = this.grammarCache.get(cacheKey);
    if (cached) return cached;

    const provider = getProvider(providerId, settings as InternalExtensionSettings);
    this.assertRemoteDisclosure(settings, provider);

    try {
      const result = await this.queryGrammarExplanation(req, provider);
      this.remember(this.grammarCache, cacheKey, result);
      return result;
    } catch (error) {
      logger.warn('Structured grammar analysis unavailable; returning translation only', error);
      return this.fallbackGrammarExplanation(req, provider, this.errorMessage(error));
    }
  }

  private async queryWordAnalysis(req: WordAnalysisRequest, provider: TranslationProvider): Promise<WordAnalysisResult> {
    if (!provider.capabilities.structuredAnalysis || !provider.generateStructured) {
      throw new Error(`${provider.displayName} does not support language analysis`);
    }
    const prompt = `Analyze the word ${JSON.stringify(req.word)} only in this sentence: ${JSON.stringify(req.sentence)}.
Source language: ${req.sourceLang}. Explanation language: ${req.targetLang}.
Return JSON with keys lemma, pos, phonetic, meaningInContext, generalMeanings (string array), collocations (string array), examples (array of {sentence, translation}).
Use ${req.targetLang} for every explanation and meaning. Do not invent facts that cannot be inferred from the sentence.`;
    const parsed = await provider.generateStructured({ task: 'word-analysis', prompt }) as Record<string, unknown>;
    const meaningInContext = text(parsed?.meaningInContext) || text(parsed?.meaning);
    if (!meaningInContext) throw new Error('Language model returned no contextual meaning');
    const examples = Array.isArray(parsed.examples)
      ? parsed.examples.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const entry = item as Record<string, unknown>;
          const sentence = text(entry.sentence);
          const translation = text(entry.translation);
          return sentence && translation ? [{ sentence, translation }] : [];
        })
      : [];
    return {
      word: req.word,
      lemma: text(parsed.lemma) || req.word,
      pos: text(parsed.pos) || 'unknown',
      phonetic: text(parsed.phonetic) || undefined,
      meaningInContext,
      generalMeanings: strings(parsed.generalMeanings),
      collocations: strings(parsed.collocations),
      examples,
      analysisSource: 'ai',
    };
  }

  private async queryGrammarExplanation(
    req: GrammarExplanationRequest,
    provider: TranslationProvider,
  ): Promise<GrammarExplanation> {
    if (!provider.capabilities.structuredAnalysis || !provider.generateStructured) {
      throw new Error(`${provider.displayName} does not support language analysis`);
    }
    const focus = req.focusWord ? `Focus on ${JSON.stringify(req.focusWord)}.` : '';
    const prompt = `Explain the grammar of ${JSON.stringify(req.sentence)}. ${focus}
Source language: ${req.sourceLang}. Explanation language: ${req.targetLang}.
Return JSON with keys translation, breakdown (array of {segment, role, explanation}), keyPoints (string array), difficultyLevel, nuanceOrTone.
Use ${req.targetLang} for every explanation. Do not add grammar claims that are not supported by the sentence.`;
    const parsed = await provider.generateStructured({ task: 'grammar-analysis', prompt }) as Record<string, unknown>;
    const translation = text(parsed?.translation);
    if (!translation) throw new Error('Language model returned no sentence translation');
    const breakdown: GrammarBreakdownItem[] = Array.isArray(parsed.breakdown)
      ? parsed.breakdown.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const entry = item as Record<string, unknown>;
          const segment = text(entry.segment);
          const role = text(entry.role);
          const explanation = text(entry.explanation);
          return segment && role && explanation ? [{ segment, role, explanation }] : [];
        })
      : [];
    return {
      sentence: req.sentence,
      translation,
      breakdown,
      keyPoints: strings(parsed.keyPoints),
      difficultyLevel: text(parsed.difficultyLevel) || undefined,
      nuanceOrTone: text(parsed.nuanceOrTone) || undefined,
      analysisSource: 'ai',
    };
  }

  private async fallbackWordAnalysis(
    req: WordAnalysisRequest,
    provider: TranslationProvider,
    reason: string,
  ): Promise<WordAnalysisResult> {
    const gloss = await this.translateOne(provider, req.word, req.sourceLang, req.targetLang);
    const isKatakana = /^[\u30a0-\u30ff]+$/.test(req.word);
    return {
      word: req.word,
      lemma: req.word,
      pos: 'unknown',
      phonetic: isKatakana ? req.word : undefined,
      meaningInContext: gloss,
      generalMeanings: gloss ? [gloss] : [],
      collocations: [],
      examples: [],
      analysisSource: 'translation-only',
      analysisUnavailableReason: reason,
    };
  }

  private async fallbackGrammarExplanation(
    req: GrammarExplanationRequest,
    provider: TranslationProvider,
    reason: string,
  ): Promise<GrammarExplanation> {
    return {
      sentence: req.sentence,
      translation: await this.translateOne(provider, req.sentence, req.sourceLang, req.targetLang),
      breakdown: [],
      keyPoints: [],
      analysisSource: 'translation-only',
      analysisUnavailableReason: reason,
    };
  }

  private async translateOne(
    provider: TranslationProvider,
    sourceText: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<string> {
    const result = await provider.translate({
      segments: [{ id: 'learning-fallback' as any, text: sourceText }],
      sourceLanguage: sourceLanguage as any,
      targetLanguage: targetLanguage as any,
      mode: 'quality',
    });
    return result.segments[0]?.text?.trim() || sourceText;
  }

  private assertRemoteDisclosure(settings: ExtensionSettings, provider: TranslationProvider): void {
    if (settings.remoteProviderDisclosureVersion === 0 && provider.isLocal !== true) {
      throw new ConfigurationError('使用雲端或遠端服務前，請先在設定頁確認資料傳輸說明。');
    }
  }

  private remember<T>(cache: Map<string, T>, key: string, value: T): void {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(key, value);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '目前的翻譯服務不支援語言分析';
  }
}

export const aiLearningEngine = new AiLearningEngine();

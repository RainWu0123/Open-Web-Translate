/**
 * Chrome Built-in AI translation provider.
 *
 * Primary API references:
 * https://developer.chrome.com/docs/ai/translator-api
 * https://developer.chrome.com/docs/ai/language-detection
 *
 * This is OWT project code written against Chrome's public Translator /
 * LanguageDetector API shape. It does not copy Chromium source. A narrow
 * compatibility fallback for older experimental `ai.translator` builds is
 * kept so existing users are not broken.
 */
import type { ProviderId } from '@/core/contracts/common';
import type { ProviderCapabilities } from '@/core/contracts/capabilities';
import type { TranslationProvider, ProviderConfigValidation } from '@/core/contracts/provider';
import type { TranslationRequest, TranslationResult, TranslatedSegment } from '@/core/contracts/translation';
import { ProviderError, NetworkError, ConfigurationError } from '@/core/domain/errors/translation-errors';
import { createLogger } from '@/shared/logger';

const logger = createLogger('ChromeBuiltInAIProvider');

interface TranslatorInstance {
  translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy?(): void;
}

interface TranslatorConstructorLike {
  availability?(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorInstance>;
}

interface LanguageDetectorInstance {
  detect(text: string): Promise<Array<{ detectedLanguage: string; confidence: number }>>;
  destroy?(): void;
}

interface LanguageDetectorConstructorLike {
  availability?(): Promise<string>;
  create(): Promise<LanguageDetectorInstance>;
}

type LegacyChromeAiApi = {
  translator?: {
    create(options: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorInstance>;
  };
  translate?: (text: string, options: { targetLanguage: string }) => Promise<string>;
};

function runtimeScope(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

function getOfficialTranslator(): TranslatorConstructorLike | null {
  const candidate = runtimeScope().Translator;
  return candidate && (typeof candidate === 'object' || typeof candidate === 'function')
    ? candidate as TranslatorConstructorLike
    : null;
}

function getLanguageDetector(): LanguageDetectorConstructorLike | null {
  const candidate = runtimeScope().LanguageDetector;
  return candidate && (typeof candidate === 'object' || typeof candidate === 'function')
    ? candidate as LanguageDetectorConstructorLike
    : null;
}

function getLegacyChromeAiApi(): LegacyChromeAiApi | null {
  const scope = runtimeScope();
  const translation = scope.translation as LegacyChromeAiApi | undefined;
  const ai = scope.ai as LegacyChromeAiApi | undefined;

  if (translation?.translator || typeof translation?.translate === 'function') return translation;
  if (ai?.translator || typeof ai?.translate === 'function') return ai;
  return null;
}

async function resolveSourceLanguage(request: TranslationRequest): Promise<string> {
  if (request.sourceLanguage !== 'auto') return request.sourceLanguage;

  const detectorCtor = getLanguageDetector();
  if (!detectorCtor?.create) {
    throw new ConfigurationError(
      'Chrome Built-in AI requires a source language when LanguageDetector is unavailable. Choose the source language manually.',
    );
  }

  const detector = await detectorCtor.create();
  try {
    const sample = request.segments.map((segment) => segment.text).join('\n').slice(0, 4000);
    const candidates = await detector.detect(sample);
    const best = candidates.find((candidate) =>
      typeof candidate.detectedLanguage === 'string' &&
      candidate.detectedLanguage.trim() &&
      candidate.confidence >= 0.2,
    );
    if (!best) {
      throw new ConfigurationError(
        'Chrome Built-in AI could not determine the source language. Choose it manually.',
      );
    }
    return best.detectedLanguage;
  } finally {
    detector.destroy?.();
  }
}

export class ChromeBuiltInAIProvider implements TranslationProvider {
  readonly id = 'chrome-builtin-ai-provider' as ProviderId;
  readonly displayName = 'Chrome Built-in AI';
  readonly isLocal = true;
  readonly capabilities: ProviderCapabilities = {
    streaming: false,
    glossary: false,
    context: false,
    maxSegments: 50,
  };

  validateConfig(_config?: unknown): ProviderConfigValidation {
    if (!getOfficialTranslator()?.create && !getLegacyChromeAiApi()) {
      return {
        isValid: false,
        errors: ['Chrome Translator API is not supported or enabled in this browser'],
      };
    }
    return { isValid: true };
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (request.signal?.aborted) throw new Error('Translation aborted');

    if (!request.segments?.length) {
      return {
        providerId: this.id,
        segments: [],
        warnings: [],
        cacheable: true,
      };
    }

    const translatedSegments: TranslatedSegment[] = [];

    try {
      const officialTranslator = getOfficialTranslator();
      if (officialTranslator?.create) {
        const sourceLanguage = await resolveSourceLanguage(request);
        const translator = await officialTranslator.create({
          sourceLanguage,
          targetLanguage: request.targetLanguage,
        });

        try {
          for (const segment of request.segments) {
            if (request.signal?.aborted) throw new Error('Translation aborted');
            const translated = await translator.translate(segment.text, { signal: request.signal });
            translatedSegments.push({ id: segment.id, text: translated });
          }
        } finally {
          translator.destroy?.();
        }
      } else {
        const legacy = getLegacyChromeAiApi();
        if (!legacy) throw new ProviderError(this.id, 'Chrome Translator API is unavailable');

        const sourceLanguage =
          request.sourceLanguage === 'auto'
            ? await resolveSourceLanguage(request)
            : request.sourceLanguage;

        if (legacy.translator?.create) {
          const translator = await legacy.translator.create({
            sourceLanguage,
            targetLanguage: request.targetLanguage,
          });
          try {
            for (const segment of request.segments) {
              translatedSegments.push({
                id: segment.id,
                text: await translator.translate(segment.text),
              });
            }
          } finally {
            translator.destroy?.();
          }
        } else if (typeof legacy.translate === 'function') {
          for (const segment of request.segments) {
            translatedSegments.push({
              id: segment.id,
              text: await legacy.translate(segment.text, {
                targetLanguage: request.targetLanguage,
              }),
            });
          }
        } else {
          throw new ProviderError(this.id, 'Invalid Chrome Built-in AI API signature');
        }
      }
    } catch (error) {
      if (
        error instanceof ProviderError ||
        error instanceof NetworkError ||
        error instanceof ConfigurationError
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Chrome Built-in AI execution failed', message);
      throw new NetworkError(`Chrome Built-in AI execution failed: ${message}`);
    }

    return {
      providerId: this.id,
      segments: translatedSegments,
      warnings: [],
      cacheable: true,
    };
  }
}

export { ChromeBuiltInAIProvider as ChromeAiProvider, ChromeBuiltInAIProvider as ChromeAIProvider };

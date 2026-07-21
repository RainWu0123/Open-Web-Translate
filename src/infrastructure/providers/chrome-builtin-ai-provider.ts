import type { ProviderId } from '@/core/contracts/common';
import type { ProviderCapabilities } from '@/core/contracts/capabilities';
import type {
  TranslationProvider,
  ProviderConfigValidation,
} from '@/core/contracts/provider';
import type {
  TranslationRequest,
  TranslationResult,
  TranslatedSegment,
} from '@/core/contracts/translation';
import {
  ProviderError,
  NetworkError,
} from '@/core/domain/errors/translation-errors';
import { createLogger } from '@/shared/logger';

const logger = createLogger('ChromeBuiltInAIProvider');

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
    const hasAi = typeof window !== 'undefined' && ('ai' in window || 'translation' in window);
    if (!hasAi) {
      return {
        isValid: false,
        errors: ['Chrome Built-in AI translator API is not supported or enabled in this browser'],
      };
    }
    return { isValid: true };
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (request.signal?.aborted) {
      throw new Error('Translation aborted');
    }

    if (!this.isLocal) {
      throw new ProviderError(this.id, 'Privacy violation: Chrome Built-in AI provider must have isLocal set to true');
    }

    if (!request.segments || request.segments.length === 0) {
      return {
        providerId: this.id,
        segments: [],
        warnings: [],
        cacheable: true,
      };
    }

    const aiApi = typeof window !== 'undefined' ? ((window as any).ai || (window as any).translation) : null;

    if (!aiApi) {
      logger.error('Chrome Built-in AI API unavailable');
      throw new NetworkError('Chrome Built-in AI API is not available on this device');
    }

    logger.debug('Executing Chrome Built-in AI translation', { segmentCount: request.segments.length });

    const translatedSegments: TranslatedSegment[] = [];

    try {
      if (aiApi.translator) {
        const translator = await aiApi.translator.create({
          sourceLanguage: request.sourceLanguage === 'auto' ? 'en' : request.sourceLanguage,
          targetLanguage: request.targetLanguage,
        });

        for (const seg of request.segments) {
          const res = await translator.translate(seg.text);
          translatedSegments.push({
            id: seg.id,
            text: res,
          });
        }
      } else if (typeof aiApi.translate === 'function') {
        for (const seg of request.segments) {
          const res = await aiApi.translate(seg.text, { targetLanguage: request.targetLanguage });
          translatedSegments.push({ id: seg.id, text: res });
        }
      } else {
        throw new ProviderError(this.id, 'Invalid Chrome Built-in AI API signature');
      }
    } catch (err: any) {
      if (err instanceof ProviderError || err instanceof NetworkError) throw err;
      throw new NetworkError(`Chrome Built-in AI execution failed: ${err.message}`);
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


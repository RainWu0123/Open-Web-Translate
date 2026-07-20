/**
 * Google Translate Provider (Web / Free Client API)
 *
 * Uses origin-locked Google Translate endpoints with rate-limiting protection.
 */
import type { ProviderId, SegmentId } from '../../core/contracts/common';
import type { ProviderCapabilities } from '../../core/contracts/capabilities';
import type {
  TranslationProvider,
  ProviderConfigValidation,
} from '../../core/contracts/provider';
import type {
  TranslationRequest,
  TranslationResult,
  TranslatedSegment,
} from '../../core/contracts/translation';
import {
  ProviderError,
  NetworkError,
  QuotaExceededError,
} from '../../core/domain/errors/translation-errors';
import { createLogger } from '../../shared/logger';

const logger = createLogger('GoogleTranslateProvider');

const GOOGLE_TRANSLATE_ORIGIN = 'https://translate.googleapis.com';

export class GoogleTranslateProvider implements TranslationProvider {
  readonly id = 'google-provider' as ProviderId;
  readonly displayName = 'Google Translate (Free)';
  readonly capabilities: ProviderCapabilities = {
    streaming: false,
    glossary: false,
    context: false,
    maxSegments: 50,
  };

  validateConfig(_config: unknown): ProviderConfigValidation {
    return { isValid: true };
  }

  private mapTargetLanguage(lang: string): string {
    const l = lang.trim().toLowerCase();
    if (l === 'zh-hant' || l === 'zh-tw' || l === 'zh-hk') return 'zh-TW';
    if (l === 'zh-hans' || l === 'zh-cn') return 'zh-CN';
    return lang.split('-')[0];
  }

  private async translateSingle(text: string, targetLang: string, signal?: AbortSignal): Promise<string> {
    const url = `${GOOGLE_TRANSLATE_ORIGIN}/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

    const response = await fetch(url, {
      method: 'GET',
      signal,
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new QuotaExceededError('Google Translate rate limit reached');
      }
      throw new NetworkError(`Google Translate returned status ${response.status}`);
    }

    const data = await response.json();
    if (Array.isArray(data) && Array.isArray(data[0])) {
      return data[0].map((item: any) => item[0]).join('');
    }
    throw new ProviderError(this.id, 'Unexpected Google Translate response format');
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (request.signal?.aborted) {
      throw new Error('Translation aborted');
    }

    const targetLang = this.mapTargetLanguage(request.targetLanguage);

    const translatedSegments: TranslatedSegment[] = [];
    try {
      const promises = request.segments.map(async (seg) => {
        const translatedText = await this.translateSingle(seg.text, targetLang, request.signal);
        return {
          id: seg.id,
          text: translatedText,
        };
      });

      const results = await Promise.all(promises);
      translatedSegments.push(...results);
    } catch (err: any) {
      if (err instanceof QuotaExceededError || err instanceof NetworkError || err instanceof ProviderError) {
        throw err;
      }
      logger.error('Google Translate error', err);
      throw new NetworkError(`Google Translate failed: ${err?.message || 'Unknown error'}`);
    }

    return {
      providerId: this.id,
      segments: translatedSegments,
      warnings: [],
      cacheable: true,
    };
  }
}

/**
 * DeepL Translation Provider
 *
 * Supports DeepL API Free and DeepL API Pro endpoints with Authorization header.
 * Enforces strict key validation, error mapping, and payload sanitization.
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
  ConfigurationError,
  NetworkError,
  QuotaExceededError,
} from '../../core/domain/errors/translation-errors';
import { SettingsStorage } from '../storage/extension-storage/settings-storage';
import { httpTranslationFetch } from './http-translation-client';
import { createLogger } from '../../shared/logger';

const logger = createLogger('DeepLProvider');

const DEEPL_FREE_ORIGIN = 'https://api-free.deepl.com';
const DEEPL_PRO_ORIGIN = 'https://api.deepl.com';

export class DeepLProvider implements TranslationProvider {
  readonly id = 'deepl-provider' as ProviderId;
  readonly displayName = 'DeepL Translate';
  readonly capabilities: ProviderCapabilities = {
    streaming: false,
    glossary: true,
    context: false,
    maxSegments: 50,
  };

  validateConfig(config: unknown): ProviderConfigValidation {
    if (typeof config === 'object' && config !== null) {
      const cfg = config as Record<string, unknown>;
      if (typeof cfg.deeplApiKey === 'string' && cfg.deeplApiKey.trim().length > 0) {
        return { isValid: true };
      }
    }
    return {
      isValid: false,
      errors: ['DeepL API key is missing or invalid'],
    };
  }

  private sanitize(message: string, apiKey?: string): string {
    if (!apiKey) return message;
    return message.replaceAll(apiKey, '[REDACTED]');
  }

  private mapTargetLanguage(lang: string): string {
    const l = lang.trim().toLowerCase();
    if (l === 'zh-hant' || l === 'zh-tw' || l === 'zh-hk') return 'ZH-HANT';
    if (l === 'zh-hans' || l === 'zh-cn' || l === 'zh') return 'ZH-HANS';
    if (l === 'en' || l === 'en-us') return 'EN-US';
    if (l === 'en-gb') return 'EN-GB';
    return lang.toUpperCase();
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const settings = await SettingsStorage.get();
    const apiKey = settings.deeplApiKey?.trim();
    const isPro = Boolean(settings.deeplApiIsPro);

    if (!apiKey) {
      throw new ConfigurationError('DeepL API key is not configured. Please set your API key in Options.');
    }

    const origin = isPro ? DEEPL_PRO_ORIGIN : DEEPL_FREE_ORIGIN;
    const apiUrl = `${origin}/v2/translate`;

    const targetLang = this.mapTargetLanguage(request.targetLanguage);
    const texts = request.segments.map((s) => s.text);

    const requestBody = {
      text: texts,
      target_lang: targetLang,
    };

    const responseData = await httpTranslationFetch(this.id, {
      url: apiUrl,
      body: requestBody,
      headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
      signal: request.signal,
      sanitize: (message) => this.sanitize(message, apiKey),
      interpretStatus: (status, bodyText) => {
        const sanitizedErr = this.sanitize(bodyText, apiKey);
        if (status === 403) {
          logger.error(`DeepL authorization error (${status})`, sanitizedErr);
          return new ConfigurationError('DeepL API key invalid or unauthorized (HTTP 403)');
        }
        if (status === 456) {
          logger.error(`DeepL quota exceeded (${status})`, sanitizedErr);
          return new QuotaExceededError('DeepL character limit / quota exceeded (HTTP 456)');
        }
        if (status >= 500) {
          logger.error(`DeepL server error (${status})`, sanitizedErr);
          return new NetworkError(`DeepL service error (HTTP ${status})`);
        }
        logger.error(`DeepL API error (${status})`, sanitizedErr);
        return new ProviderError(this.id, `DeepL API returned error status HTTP ${status}`);
      },
    }).then((r) => r.json as Record<string, any>);

    const translations = responseData?.translations;
    if (!Array.isArray(translations) || translations.length !== request.segments.length) {
      logger.error('DeepL translation count mismatch or invalid response format');
      throw new ProviderError(this.id, 'DeepL response translation count mismatch');
    }

    const translatedSegments: TranslatedSegment[] = request.segments.map((s, idx) => ({
      id: s.id,
      text: translations[idx]?.text || s.text,
    }));

    return {
      providerId: this.id,
      segments: translatedSegments,
      warnings: [],
      cacheable: true,
    };
  }
}

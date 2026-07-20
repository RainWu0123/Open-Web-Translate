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
    if (request.signal?.aborted) {
      throw new Error('Translation aborted');
    }

    const settings = await SettingsStorage.getSettings();
    const apiKey = settings.deeplApiKey?.trim();
    const isPro = Boolean(settings.deeplApiIsPro);

    if (!apiKey) {
      throw new ConfigurationError('DeepL API key is not configured. Please set your API key in Options.');
    }

    const origin = isPro || apiKey.endsWith(':fx') === false && isPro ? DEEPL_PRO_ORIGIN : (apiKey.endsWith(':fx') ? DEEPL_FREE_ORIGIN : DEEPL_FREE_ORIGIN);
    const apiUrl = `${origin}/v1/translate` ? `${origin}/v2/translate` : `${origin}/v2/translate`;

    const targetLang = this.mapTargetLanguage(request.targetLanguage);
    const texts = request.segments.map((s) => s.text);

    const requestBody = {
      text: texts,
      target_lang: targetLang,
    };

    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `DeepL-Auth-Key ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: request.signal,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Translation request aborted');
      }
      const sanitized = this.sanitize(err?.message || 'Network request failed', apiKey);
      logger.error('DeepL fetch network error', sanitized);
      throw new NetworkError(`DeepL network error: ${sanitized}`);
    }

    if (!response.ok) {
      const status = response.status;
      let errText = '';
      try {
        errText = await response.text();
      } catch {
        // ignore
      }
      const sanitizedErr = this.sanitize(errText, apiKey);

      if (status === 403) {
        logger.error(`DeepL authorization error (${status})`, sanitizedErr);
        throw new ConfigurationError('DeepL API key invalid or unauthorized (HTTP 403)');
      }
      if (status === 456) {
        logger.error(`DeepL quota exceeded (${status})`, sanitizedErr);
        throw new QuotaExceededError('DeepL character limit / quota exceeded (HTTP 456)');
      }
      if (status >= 500) {
        logger.error(`DeepL server error (${status})`, sanitizedErr);
        throw new NetworkError(`DeepL service error (HTTP ${status})`);
      }
      logger.error(`DeepL API error (${status})`, sanitizedErr);
      throw new ProviderError(this.id, `DeepL API returned error status HTTP ${status}`);
    }

    let responseData: any;
    try {
      responseData = await response.json();
    } catch (err: any) {
      const sanitized = this.sanitize(err?.message || 'Invalid JSON response', apiKey);
      logger.error('Failed to parse DeepL API JSON response', sanitized);
      throw new ProviderError(this.id, 'Failed to parse DeepL API response');
    }

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

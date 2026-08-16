/**
 * Google Gemini Translation Provider
 *
 * Calls Gemini 2.0 Flash REST API directly with x-goog-api-key header.
 * Enforces strict runtime JSON schema validation and error mapping.
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
import {
  validateModelId,
  findModelEntry,
  DEFAULT_MODEL_ID,
} from './gemini/model-registry';
import { httpTranslationFetch } from './http-translation-client';
import { createLogger } from '../../shared/logger';

const logger = createLogger('GeminiProvider');

const GEMINI_API_ORIGIN = 'https://generativelanguage.googleapis.com';

interface GeminiResponseItem {
  id: string;
  translatedText: string;
}

export class GeminiProvider implements TranslationProvider {
  readonly id = 'gemini-provider' as ProviderId;
  readonly displayName = 'Google Gemini API';
  readonly capabilities: ProviderCapabilities = {
    streaming: false,
    glossary: false,
    context: false,
    maxSegments: 100,
  };

  /** In-memory session circuit breaker for models returning HTTP 404 / unsupported capability */
  private static sessionBlockedModels = new Set<string>();

  static clearSessionBlocks(): void {
    GeminiProvider.sessionBlockedModels.clear();
  }

  static isSessionBlocked(modelId: string): boolean {
    return GeminiProvider.sessionBlockedModels.has(modelId.trim().toLowerCase());
  }

  validateConfig(config: unknown): ProviderConfigValidation {
    if (typeof config === 'object' && config !== null) {
      const cfg = config as Record<string, unknown>;
      if (typeof cfg.geminiApiKey === 'string' && cfg.geminiApiKey.trim().length > 0) {
        return { isValid: true };
      }
    }
    return {
      isValid: false,
      errors: ['Gemini API key is missing or invalid'],
    };
  }

  private sanitize(message: string, apiKey?: string): string {
    if (!apiKey) return message;
    return message.replaceAll(apiKey, '[REDACTED]');
  }

  private validateParsedResponse(parsed: unknown): GeminiResponseItem[] {
    if (!Array.isArray(parsed)) {
      throw new ProviderError(this.id, 'Response is not a JSON array');
    }

    const validItems: GeminiResponseItem[] = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) {
        throw new ProviderError(this.id, 'JSON array element is not an object');
      }
      const obj = item as Record<string, unknown>;
      if (typeof obj.id !== 'string') {
        throw new ProviderError(this.id, 'Element is missing string property "id"');
      }
      if (typeof obj.translatedText !== 'string') {
        throw new ProviderError(this.id, 'Element is missing string property "translatedText"');
      }
      validItems.push({
        id: obj.id,
        translatedText: obj.translatedText,
      });
    }
    return validItems;
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const settings = await SettingsStorage.get();
    const apiKey = settings.geminiApiKey?.trim();
    const rawModel = settings.geminiModel?.trim() || DEFAULT_MODEL_ID;

    if (!apiKey) {
      throw new ConfigurationError('Gemini API key is not configured. Please set your API key in Options.');
    }

    // 1. Model Registry validation
    const modelValidation = validateModelId(rawModel);
    if (!modelValidation.valid) {
      throw new ConfigurationError(`Gemini model configuration error: ${modelValidation.message}`);
    }

    const modelId = modelValidation.modelId;

    // 2. Session Circuit Breaker check
    if (GeminiProvider.sessionBlockedModels.has(modelId)) {
      throw new ConfigurationError(
        `Gemini model "${modelId}" is session-blocked due to previous HTTP 404 or unsupported model error. Please select an active verified model in Options.`,
      );
    }

    // 3. Construct safe origin-locked endpoint
    const apiUrl = `${GEMINI_API_ORIGIN}/v1beta/models/${encodeURIComponent(modelId)}:generateContent`;

    const systemPrompt = `You are a professional, accurate translator.
Translate the provided text segments into the target language: "${request.targetLanguage}".
Source language (if known): "${request.sourceLanguage}".

CRITICAL INSTRUCTIONS:
- Return ONLY a valid JSON array of objects.
- Each object MUST have exact keys "id" and "translatedText".
- Preserve the exact "id" for each segment.
- Do NOT add markdown blocks or outside commentary.
Example: [{"id": "seg-1", "translatedText": "..."}]`;

    const segmentsPayload = request.segments.map((s) => ({
      id: s.id,
      text: s.text,
    }));

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: JSON.stringify(segmentsPayload) }],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        responseMimeType: 'application/json',
      },
    };

    const responseData = await httpTranslationFetch(this.id, {
      url: apiUrl,
      body: requestBody,
      headers: { 'x-goog-api-key': apiKey },
      signal: request.signal,
      sanitize: (message) => this.sanitize(message, apiKey),
      interpretStatus: (status, bodyText) => {
        const sanitizedErr = this.sanitize(bodyText, apiKey);

        // HTTP 404 / Model Not Found -> Session Block model
        if (status === 404 || sanitizedErr.toLowerCase().includes('model not found') || sanitizedErr.toLowerCase().includes('unsupported model')) {
          GeminiProvider.sessionBlockedModels.add(modelId);
          logger.error(`Gemini model HTTP 404 / unsupported -> session blocked (${modelId})`, sanitizedErr);
          return new ConfigurationError(`Gemini model "${modelId}" returned HTTP 404 (Not Found or Unsupported). Model has been session-blocked. Please select an active model in Options.`);
        }
        if (status === 401 || status === 403) {
          logger.error(`Gemini config error (${status})`, sanitizedErr);
          return new ConfigurationError(`Gemini API key invalid or unauthorized (HTTP ${status})`);
        }
        if (status === 429) {
          logger.error(`Gemini quota exceeded (${status})`, sanitizedErr);
          return new QuotaExceededError('Gemini API rate limit or quota exceeded');
        }
        if (status >= 500) {
          logger.error(`Gemini server error (${status})`, sanitizedErr);
          return new NetworkError(`Gemini service error (HTTP ${status})`);
        }
        logger.error(`Gemini API error (${status})`, sanitizedErr);
        return new ProviderError(this.id, `Gemini API returned error status HTTP ${status}`);
      },
    }).then((r) => r.json as Record<string, any>);

    const rawText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof rawText !== 'string' || !rawText.trim()) {
      logger.error('Empty candidate content from Gemini response');
      throw new ProviderError(this.id, 'Gemini returned empty translation response');
    }

    let parsedArray: unknown;
    try {
      parsedArray = JSON.parse(rawText.trim());
    } catch (err: any) {
      logger.error('Failed to parse Gemini internal output JSON');
      throw new ProviderError(this.id, 'Gemini response output was not valid JSON');
    }

    const validSegments = this.validateParsedResponse(parsedArray);

    const translatedSegments: TranslatedSegment[] = validSegments.map((item) => ({
      id: item.id as SegmentId,
      text: item.translatedText,
    }));

    return {
      providerId: this.id,
      segments: translatedSegments,
      warnings: [],
      cacheable: true,
    };
  }
}

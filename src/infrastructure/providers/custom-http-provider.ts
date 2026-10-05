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
  ConfigurationError,
  NetworkError,
  ProviderError,
} from '@/core/domain/errors/translation-errors';
import { httpTranslationFetch } from './http-translation-client';
import { createLogger } from '@/shared/logger';
import { normalizeSubtitleAlternatives } from '../../shared/utils/subtitle-text';
import { inspectHttpEndpoint } from './endpoint-security';
import { parseIndexedTranslations } from './indexed-translation-parser';

const logger = createLogger('CustomHttpProvider');

export interface CustomHttpConfig {
  model?: string;
  endpoint?: string;
  apiKey?: string;
  instructions?: string;
}

function validateCustomEndpoint(endpoint: string): { isValid: boolean; error?: string } {
  const inspection = inspectHttpEndpoint(endpoint);
  if (!inspection.isValid) {
    return { isValid: false, error: inspection.error || 'Invalid Custom HTTP endpoint' };
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return { isValid: false, error: 'Invalid Custom HTTP endpoint' };
  }

  if (!inspection.isLocal && parsed.protocol !== 'https:') {
    return {
      isValid: false,
      error: 'Remote Custom HTTP endpoints must use HTTPS to protect translated text and API credentials',
    };
  }

  return { isValid: true };
}

function assertCustomEndpoint(endpoint: string): string {
  const validation = validateCustomEndpoint(endpoint);
  if (!validation.isValid) {
    throw new ConfigurationError(validation.error || 'Invalid Custom HTTP endpoint');
  }
  return new URL(endpoint).toString().replace(/\/$/, '');
}

export class CustomHttpProvider implements TranslationProvider {
  readonly id = 'custom-http-provider' as ProviderId;
  readonly displayName = 'Custom HTTP API';
  readonly isLocal = false;
  readonly capabilities: ProviderCapabilities = {
    streaming: false,
    glossary: true,
    context: true,
    maxSegments: 30,
  };

  private endpoint: string;
  private model: string;
  private apiKey?: string;
  private instructions: string;

  constructor(config: CustomHttpConfig = {}) {
    this.endpoint = config.endpoint?.trim() || '';
    this.model = config.model?.trim() || 'default';
    this.apiKey = config.apiKey?.trim() || undefined;
    this.instructions = config.instructions?.trim().slice(0, 2000) || '';
  }

  validateConfig(config: unknown): ProviderConfigValidation {
    if (!config || typeof config !== 'object') {
      return { isValid: false, errors: ['Configuration must be an object'] };
    }

    const cfg = config as CustomHttpConfig;
    const endpoint = cfg.endpoint?.trim() || '';
    const endpointValidation = validateCustomEndpoint(endpoint);
    if (!endpointValidation.isValid) {
      return { isValid: false, errors: [endpointValidation.error || 'Invalid Custom HTTP endpoint'] };
    }

    if (cfg.model !== undefined && cfg.model.trim() === '') {
      return { isValid: false, errors: ['Model name cannot be empty'] };
    }

    return { isValid: true };
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (!request.segments || request.segments.length === 0) {
      return {
        providerId: this.id,
        segments: [],
        warnings: [],
        cacheable: true,
      };
    }

    const endpoint = assertCustomEndpoint(this.endpoint);
    const url = `${endpoint}/v1/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    let glossaryPrompt = '';
    if (request.glossary?.entries) {
      let terms = '';
      if (request.glossary.entries instanceof Map) {
        terms = Array.from(request.glossary.entries.entries())
          .map(([source, target]) => `${source} -> ${target}`)
          .join(', ');
      } else if (Array.isArray(request.glossary.entries)) {
        terms = request.glossary.entries
          .map((entry) => `${entry.source} -> ${entry.target}`)
          .join(', ');
      }
      if (terms) glossaryPrompt = ` Adhere to glossary: [${terms}].`;
    }

    const userInstructions = this.instructions
      ? ` User style instructions: ${this.instructions}.`
      : '';
    const isSingle = request.segments.length === 1;
    const promptContent = isSingle
      ? `Translate the following text to target language code "${request.targetLanguage}".${glossaryPrompt}${userInstructions} Return only the translation without quotes or commentary:\n${request.segments[0].text}`
      : `You are a professional translator. Translate the following text segments into target language code "${request.targetLanguage}".${glossaryPrompt}${userInstructions} Return only the translated text segments in the exact format [idx] Translated Text, without commentary. Do not return slash-separated alternatives such as "先生/小姐" or "他/她"; choose natural wording or a neutral phrase:\n\n${request.segments.map((segment, idx) => `[${idx}] ${segment.text}`).join('\n')}`;

    logger.debug('Sending Custom HTTP translation request', {
      endpoint: url,
      hasApiKey: Boolean(this.apiKey),
      segmentCount: request.segments.length,
    });

    const data = await httpTranslationFetch(this.id, {
      url,
      headers,
      body: {
        model: this.model,
        messages: [{ role: 'user', content: promptContent }],
      },
      signal: request.signal,
      timeoutMs: 15000,
      interpretStatus: (status) => new NetworkError(`Custom HTTP server returned HTTP ${status}`),
    }).then((response) => response.json as Record<string, any>);

    const outputText = data.choices?.[0]?.message?.content || data.translatedText || '';

    let translatedSegments: TranslatedSegment[];
    if (isSingle) {
      const cleanText = String(outputText).trim();
      if (!cleanText) {
        throw new ProviderError(this.id, 'Custom HTTP server returned an empty translation');
      }
      translatedSegments = [{
        id: request.segments[0].id,
        text: normalizeSubtitleAlternatives(cleanText),
      }];
    } else {
      const parsed = parseIndexedTranslations(outputText, {
        providerId: this.id,
        providerLabel: 'Custom HTTP',
        expectedCount: request.segments.length,
      });
      translatedSegments = request.segments.map((segment, idx) => ({
        id: segment.id,
        text: normalizeSubtitleAlternatives(parsed[idx]),
      }));
    }

    return {
      providerId: this.id,
      segments: translatedSegments,
      warnings: [],
      cacheable: true,
    };
  }
}

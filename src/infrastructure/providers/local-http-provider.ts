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
import { httpTranslationFetch } from './http-translation-client';
import { createLogger } from '@/shared/logger';

const logger = createLogger('LocalHttpProvider');

export interface LocalHttpConfig {
  endpoint?: string;
  apiKey?: string;
}

export class LocalHttpProvider implements TranslationProvider {
  readonly id = 'local-http-provider' as ProviderId;
  readonly displayName = 'Local HTTP AI Provider';
  readonly isLocal = true;
  readonly capabilities: ProviderCapabilities = {
    streaming: false,
    glossary: true,
    context: true,
    maxSegments: 30,
  };

  private endpoint: string;
  private apiKey?: string;

  constructor(config: LocalHttpConfig = {}) {
    this.endpoint = config.endpoint || 'http://127.0.0.1:8080';
    this.apiKey = config.apiKey;
  }

  validateConfig(config: unknown): ProviderConfigValidation {
    if (!config || typeof config !== 'object') {
      return { isValid: false, errors: ['Configuration must be an object'] };
    }
    const cfg = config as LocalHttpConfig;
    if (cfg.endpoint !== undefined && typeof cfg.endpoint === 'string' && cfg.endpoint.trim() === '') {
      return { isValid: false, errors: ['Endpoint URL cannot be empty'] };
    }
    if (cfg.endpoint) {
      try {
        const parsed = new URL(cfg.endpoint);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return { isValid: false, errors: ['Invalid endpoint URL scheme'] };
        }
      } catch {
        return { isValid: false, errors: ['Invalid endpoint URL format'] };
      }
    }
    return { isValid: true };
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {

    if (!this.isLocal) {
      throw new ProviderError(this.id, 'Privacy violation: Local HTTP provider must have isLocal set to true');
    }

    if (!request.segments || request.segments.length === 0) {
      return {
        providerId: this.id,
        segments: [],
        warnings: [],
        cacheable: true,
      };
    }

    const url = `${this.endpoint.replace(/\/+$/, '')}/v1/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    logger.debug('Sending Local HTTP translation request', { endpoint: url, hasApiKey: !!this.apiKey });

    let glossaryPrompt = '';
    if (request.glossary && request.glossary.entries) {
      let terms = '';
      if (request.glossary.entries instanceof Map) {
        terms = Array.from(request.glossary.entries.entries()).map(([k, v]) => `${k} -> ${v}`).join(', ');
      } else if (Array.isArray(request.glossary.entries)) {
        terms = request.glossary.entries.map((e) => `${e.source} -> ${e.target}`).join(', ');
      }
      if (terms) {
        glossaryPrompt = ` Adhere to glossary: [${terms}].`;
      }
    }

    const data = await httpTranslationFetch(this.id, {
      url,
      headers,
      body: {
        model: 'local-model',
        messages: [
          {
            role: 'user',
            content: `Translate to ${request.targetLanguage}${glossaryPrompt}: ${JSON.stringify(request.segments.map((s) => s.text))}`,
          },
        ],
      },
      signal: request.signal,
      timeoutMs: 15000,
      interpretStatus: (status) => new NetworkError(`Local HTTP server returned HTTP ${status}`),
    }).then((r) => r.json as Record<string, any>);

    let outputText = data.choices?.[0]?.message?.content || data.translatedText || '';

    const translatedSegments: TranslatedSegment[] = request.segments.map((seg) => ({
      id: seg.id,
      text: outputText ? `${outputText}` : `[Translated] ${seg.text}`,
    }));

    return {
      providerId: this.id,
      segments: translatedSegments,
      warnings: [],
      cacheable: true,
    };
  }
}

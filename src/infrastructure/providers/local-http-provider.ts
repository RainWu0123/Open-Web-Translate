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
import { normalizeSubtitleAlternatives } from '../../shared/utils/subtitle-text';

const logger = createLogger('LocalHttpProvider');

export interface LocalHttpConfig {
  endpoint?: string;
  apiKey?: string;
  instructions?: string;
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
  private instructions: string;

  constructor(config: LocalHttpConfig = {}) {
    this.endpoint = config.endpoint || 'http://127.0.0.1:8080';
    this.apiKey = config.apiKey;
    this.instructions = config.instructions?.trim().slice(0, 2000) || '';
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
    const userInstructions = this.instructions ? ` User style instructions: ${this.instructions}.` : '';
    const isSingle = request.segments.length === 1;
    const promptContent = isSingle
      ? `Translate the following text to target language code "${request.targetLanguage}".${glossaryPrompt}${userInstructions} Return only the translation without quotes or commentary:\n${request.segments[0].text}`
      : `You are a professional translator. Translate the following text segments into target language code "${request.targetLanguage}".${glossaryPrompt}${userInstructions} Return only the translated text segments in the exact format [idx] Translated Text, without commentary. Do not return slash-separated alternatives such as "先生/小姐" or "他/她"; choose natural wording or a neutral phrase:\n\n${request.segments.map((s, idx) => `[${idx}] ${s.text}`).join('\n')}`;

    const data = await httpTranslationFetch(this.id, {
      url,
      headers,
      body: {
        model: 'local-model',
        messages: [
          {
            role: 'user',
            content: promptContent,
          },
        ],
      },
      signal: request.signal,
      timeoutMs: 15000,
      interpretStatus: (status) => new NetworkError(`Local HTTP server returned HTTP ${status}`),
    }).then((r) => r.json as Record<string, any>);

    let outputText = data.choices?.[0]?.message?.content || data.translatedText || '';

    let translatedSegments: TranslatedSegment[];
    if (isSingle) {
      translatedSegments = [
        {
          id: request.segments[0].id,
          text: outputText ? normalizeSubtitleAlternatives(`${outputText}`.trim()) : `[Translated] ${request.segments[0].text}`,
        },
      ];
    } else {
      const lines = `${outputText}`.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      translatedSegments = request.segments.map((seg, idx) => {
        const matchingLine = lines.find((l: string) => l.startsWith(`[${idx}]`));
        if (matchingLine) {
          const cleanText = matchingLine.replace(/^\[\d+\]\s*/, '').trim();
          return { id: seg.id, text: normalizeSubtitleAlternatives(cleanText) };
        }
        if (lines[idx]) {
          return { id: seg.id, text: normalizeSubtitleAlternatives(lines[idx].replace(/^\[\d+\]\s*/, '').trim()) };
        }
        return { id: seg.id, text: outputText ? normalizeSubtitleAlternatives(outputText) : `[Translated] ${seg.text}` };
      });
    }

    return {
      providerId: this.id,
      segments: translatedSegments,
      warnings: [],
      cacheable: true,
    };
  }
}

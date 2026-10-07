import type { ProviderId } from '@/core/contracts/common';
import type { ProviderCapabilities } from '@/core/contracts/capabilities';
import type { TranslationProvider, ProviderConfigValidation } from '@/core/contracts/provider';
import type { TranslationRequest, TranslationResult, TranslatedSegment } from '@/core/contracts/translation';
import { ConfigurationError, NetworkError, ProviderError, QuotaExceededError } from '@/core/domain/errors/translation-errors';
import { httpTranslationFetch } from './http-translation-client';
import { normalizeSubtitleAlternatives } from '@/shared/utils/subtitle-text';
import { inspectHttpEndpoint } from './endpoint-security';
import { buildIndexedRepairPrompt, parseIndexedTranslationsWithRepair } from './indexed-translation-parser';
import { createLogger } from '@/shared/logger';

export interface OpenAiCompatibleProviderConfig {
  providerId: string;
  displayName: string;
  endpoint: string;
  model: string;
  apiKey?: string;
  instructions?: string;
  apiKeyPolicy?: 'required' | 'remote-only' | 'optional';
  maxSegments?: number;
}

function normalizeEndpoint(endpoint: string): { baseUrl: string; isLocal: boolean } {
  const inspection = inspectHttpEndpoint(endpoint);
  if (!inspection.isValid) {
    throw new ConfigurationError(inspection.error || 'Invalid provider endpoint');
  }

  const parsed = new URL(endpoint);
  if (!inspection.isLocal && parsed.protocol !== 'https:') {
    throw new ConfigurationError('Remote provider endpoints must use HTTPS');
  }

  return {
    baseUrl: parsed.toString().replace(/\/$/, ''),
    isLocal: inspection.isLocal,
  };
}

function chatCompletionsUrl(baseUrl: string): string {
  if (/\/chat\/completions$/i.test(baseUrl)) return baseUrl;
  if (/\/v1$/i.test(baseUrl)) return `${baseUrl}/chat/completions`;
  return `${baseUrl}/v1/chat/completions`;
}

export class OpenAiCompatibleProvider implements TranslationProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly isLocal: boolean;
  readonly capabilities: ProviderCapabilities;

  private readonly endpoint: string;
  private readonly model: string;
  private readonly apiKey?: string;
  private readonly instructions: string;
  private readonly apiKeyPolicy: 'required' | 'remote-only' | 'optional';
  private readonly logger;

  constructor(config: OpenAiCompatibleProviderConfig) {
    const endpointInfo = normalizeEndpoint(config.endpoint);
    this.id = config.providerId as ProviderId;
    this.displayName = config.displayName;
    this.endpoint = endpointInfo.baseUrl;
    this.isLocal = endpointInfo.isLocal;
    this.model = config.model.trim();
    this.apiKey = config.apiKey?.trim() || undefined;
    this.instructions = config.instructions?.trim().slice(0, 2000) || '';
    this.apiKeyPolicy = config.apiKeyPolicy ?? 'required';
    this.capabilities = {
      streaming: false,
      glossary: true,
      context: true,
      maxSegments: config.maxSegments ?? 30,
    };
    this.logger = createLogger(config.displayName.replace(/\s+/g, ''));
  }

  validateConfig(_config?: unknown): ProviderConfigValidation {
    const errors: string[] = [];
    if (!this.model) errors.push('Model name cannot be empty');
    if (this.apiKeyPolicy === 'required' && !this.apiKey) {
      errors.push(`${this.displayName} API key is required`);
    }
    if (this.apiKeyPolicy === 'remote-only' && !this.isLocal && !this.apiKey) {
      errors.push(`${this.displayName} API key is required for remote endpoints`);
    }
    return { isValid: errors.length === 0, ...(errors.length ? { errors } : {}) };
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (!request.segments?.length) {
      return { providerId: this.id, segments: [], warnings: [], cacheable: true };
    }

    if (!this.model) {
      throw new ConfigurationError(`${this.displayName} model is not configured`);
    }
    if (this.apiKeyPolicy === 'required' && !this.apiKey) {
      throw new ConfigurationError(`${this.displayName} API key is not configured`);
    }
    if (this.apiKeyPolicy === 'remote-only' && !this.isLocal && !this.apiKey) {
      throw new ConfigurationError(`${this.displayName} API key is required for remote endpoints`);
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

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
    const previousContext = (request.context?.previous ?? []).slice(-8);
    const contextPrompt = previousContext.length
      ? ` Use this prior dialogue only for context: ${previousContext.map((p) => `${p.source} => ${p.translation}`).join(' | ')}.`
      : '';

    const isSingle = request.segments.length === 1;
    const prompt = isSingle
      ? `Translate the following text to target language code "${request.targetLanguage}".${glossaryPrompt}${userInstructions}${contextPrompt} Return only the translation without quotes or commentary:\n${request.segments[0].text}`
      : `You are a professional translator. Translate the following text segments into target language code "${request.targetLanguage}".${glossaryPrompt}${userInstructions}${contextPrompt} Return only the translated text segments in the exact format [idx] Translated Text, without commentary. Do not return slash-separated alternatives; choose natural wording or a neutral phrase:\n\n${request.segments.map((segment, idx) => `[${idx}] ${segment.text}`).join('\n')}`;

    const sendPrompt = async (content: string): Promise<string> => {
      const response = await httpTranslationFetch(this.id, {
        url: chatCompletionsUrl(this.endpoint),
        headers,
        body: {
          model: this.model,
          messages: [{ role: 'user', content }],
          temperature: request.mode === 'quality' ? 0.2 : 0,
        },
        signal: request.signal,
        timeoutMs: 30000,
        interpretStatus: (status) => {
          if (status === 401 || status === 403) {
            return new ConfigurationError(`${this.displayName} rejected the API key or credentials`);
          }
          if (status === 429) {
            return new QuotaExceededError(`${this.displayName} rate limit or quota exceeded`);
          }
          return new NetworkError(`${this.displayName} returned HTTP ${status}`);
        },
      });

      const data = response.json as Record<string, any>;
      return String(data.choices?.[0]?.message?.content || data.translatedText || '');
    };

    this.logger.debug('Sending OpenAI-compatible translation request', {
      endpoint: chatCompletionsUrl(this.endpoint),
      model: this.model,
      segmentCount: request.segments.length,
      isLocal: this.isLocal,
    });

    const output = await sendPrompt(prompt);
    let translatedSegments: TranslatedSegment[];

    if (isSingle) {
      const clean = output.trim();
      if (!clean) throw new ProviderError(this.id, `${this.displayName} returned an empty translation`);
      translatedSegments = [{
        id: request.segments[0].id,
        text: normalizeSubtitleAlternatives(clean),
      }];
    } else {
      const parsed = await parseIndexedTranslationsWithRepair(
        output,
        {
          providerId: this.id,
          providerLabel: this.displayName,
          expectedCount: request.segments.length,
        },
        async (malformedOutput) => sendPrompt(buildIndexedRepairPrompt(malformedOutput, request.segments.length)),
      );
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

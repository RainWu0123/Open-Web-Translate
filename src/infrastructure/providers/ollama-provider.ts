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
import { assertLocalHttpEndpoint, inspectHttpEndpoint } from './endpoint-security';
import { buildIndexedRepairPrompt, parseIndexedTranslationsWithRepair } from './indexed-translation-parser';

const logger = createLogger('OllamaProvider');

export interface OllamaConfig {
  endpoint?: string;
  model?: string;
  temperature?: number;
  instructions?: string;
}

export class OllamaProvider implements TranslationProvider {
  readonly id = 'ollama-provider' as ProviderId;
  readonly displayName = 'Ollama Local AI';
  readonly isLocal = true;
  readonly capabilities: ProviderCapabilities = {
    streaming: false,
    glossary: true,
    context: true,
    maxSegments: 20,
  };

  private endpoint: string;
  private model: string;
  private instructions: string;

  constructor(config: OllamaConfig = {}) {
    this.endpoint = config.endpoint || 'http://localhost:11434';
    this.model = config.model || 'llama3';
    this.instructions = config.instructions?.trim().slice(0, 2000) || '';
  }

  validateConfig(config: unknown): ProviderConfigValidation {
    if (!config || typeof config !== 'object') {
      return { isValid: false, errors: ['Configuration must be an object'] };
    }
    const cfg = config as OllamaConfig;
    const endpoint = cfg.endpoint ?? 'http://localhost:11434';
    const inspection = inspectHttpEndpoint(endpoint);
    if (!inspection.isValid) {
      return { isValid: false, errors: [inspection.error || 'Invalid Ollama endpoint'] };
    }
    if (!inspection.isLocal) {
      return {
        isValid: false,
        errors: ['Ollama Local AI only accepts loopback endpoints (localhost, 127.0.0.0/8, or ::1)'],
      };
    }
    return { isValid: true };
  }

  private buildPrompt(request: TranslationRequest): string {
    let glossaryInstructions = '';
    if (request.glossary && request.glossary.entries) {
      let entriesStr = '';
      if (request.glossary.entries instanceof Map) {
        entriesStr = Array.from(request.glossary.entries.entries())
          .map(([k, v]) => `${k} -> ${v}`)
          .join(', ');
      } else if (Array.isArray(request.glossary.entries)) {
        entriesStr = request.glossary.entries
          .map((entry) => `${entry.source} -> ${entry.target}`)
          .join(', ');
      }
      if (entriesStr) {
        glossaryInstructions = `\nStrictly adhere to this glossary: [${entriesStr}].`;
      }
    }

    const segmentsText = request.segments.map((s, idx) => `[${idx}] ${s.text}`).join('\n');
    const userInstructions = this.instructions
      ? `\nUser style instructions: ${this.instructions}`
      : '';

    return `You are a professional translator. Translate the following text segments into target language code "${request.targetLanguage}".${glossaryInstructions}${userInstructions}\nReturn only the translated text segments in the exact format [idx] Translated Text, without commentary.\nDo not return slash-separated alternatives such as "先生/小姐" or "他/她"; choose natural wording or a neutral phrase.\n\n${segmentsText}`;
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    // Privacy boundary check
    if (!this.isLocal) {
      throw new ProviderError(this.id, 'Privacy violation: Local AI provider must have isLocal set to true');
    }

    if (!request.segments || request.segments.length === 0) {
      return {
        providerId: this.id,
        segments: [],
        warnings: [],
        cacheable: true,
      };
    }

    const prompt = this.buildPrompt(request);
    const endpoint = assertLocalHttpEndpoint(this.endpoint, 'Ollama Local AI');
    const url = `${endpoint}/api/generate`;

    logger.debug('Sending Ollama generate request', { endpoint: url, model: this.model, segmentCount: request.segments.length });

    const data = await httpTranslationFetch(this.id, {
      url,
      body: { model: this.model, prompt, stream: false },
      signal: request.signal,
      timeoutMs: 15000,
      interpretStatus: (status, bodyText) =>
        new NetworkError(`Ollama server error HTTP ${status}: ${bodyText.slice(0, 120)}`),
    }).then((r) => r.json as Record<string, any>);

    const generatedText = data.response || '';
    const parsedTranslations = await parseIndexedTranslationsWithRepair(
      generatedText,
      { providerId: this.id, providerLabel: 'Ollama', expectedCount: request.segments.length },
      async (malformedOutput) => {
        logger.info('Ollama returned malformed indexed output; requesting one format repair');
        const repairData = await httpTranslationFetch(this.id, {
          url,
          body: { model: this.model, prompt: buildIndexedRepairPrompt(malformedOutput, request.segments.length), stream: false },
          signal: request.signal,
          timeoutMs: 15000,
          interpretStatus: (status, bodyText) =>
            new NetworkError(`Ollama server error HTTP ${status}: ${bodyText.slice(0, 120)}`),
        }).then((r) => r.json as Record<string, any>);
        return repairData.response || '';
      },
    );

    const translatedSegments: TranslatedSegment[] = request.segments.map((seg, idx) => ({
      id: seg.id,
      text: normalizeSubtitleAlternatives(parsedTranslations[idx]),
    }));

    return {
      providerId: this.id,
      segments: translatedSegments,
      warnings: [],
      cacheable: true,
    };
  }
}

import { dialogueContextPrompt } from './dialogue-context';
import { languageOutputInstruction } from './language-output-instructions';
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

const logger = createLogger('LocalHttpProvider');

export interface LocalHttpConfig {
  model?: string;
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
  private model: string;
  private apiKey?: string;
  private instructions: string;

  constructor(config: LocalHttpConfig = {}) {
    this.endpoint = config.endpoint || 'http://127.0.0.1:8080';
    this.model = config.model || 'local-model';
    this.apiKey = config.apiKey;
    this.instructions = config.instructions?.trim().slice(0, 2000) || '';
  }

  validateConfig(config: unknown): ProviderConfigValidation {
    if (!config || typeof config !== 'object') {
      return { isValid: false, errors: ['Configuration must be an object'] };
    }
    const cfg = config as LocalHttpConfig;
    const endpoint = cfg.endpoint ?? 'http://127.0.0.1:8080';
    const inspection = inspectHttpEndpoint(endpoint);
    if (!inspection.isValid) {
      return { isValid: false, errors: [inspection.error || 'Invalid Local HTTP endpoint'] };
    }
    if (!inspection.isLocal) {
      return {
        isValid: false,
        errors: ['Local HTTP AI only accepts loopback endpoints (localhost, 127.0.0.0/8, or ::1)'],
      };
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

    const endpoint = assertLocalHttpEndpoint(this.endpoint, 'Local HTTP AI');
    const url = `${endpoint}/v1/chat/completions`;
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
    const languageRule = languageOutputInstruction(request.targetLanguage);
    const promptContent = isSingle
      ? `Translate the following text to target language code "${request.targetLanguage}".${languageRule}${glossaryPrompt}${userInstructions}${dialogueContextPrompt(request.context)} Return only the translation without quotes or commentary:\n${request.segments[0].text}`
      : `You are a professional translator. Translate the following text segments into target language code "${request.targetLanguage}".${languageRule}${glossaryPrompt}${userInstructions}${dialogueContextPrompt(request.context)} Return only the translated text segments in the exact format [idx] Translated Text, without commentary. Do not return slash-separated alternatives such as "先生/小姐" or "他/她"; choose natural wording or a neutral phrase:\n\n${request.segments.map((s, idx) => `[${idx}] ${s.text}`).join('\n')}`;

    const sendPrompt = async (content: string): Promise<string> => {
      const data = await httpTranslationFetch(this.id, {
        url,
        headers,
        body: { model: this.model, messages: [{ role: 'user', content }] },
        signal: request.signal,
        timeoutMs: 15000,
        interpretStatus: (status) => new NetworkError(`Local HTTP server returned HTTP ${status}`),
      }).then((response) => response.json as Record<string, any>);
      return String(data.choices?.[0]?.message?.content || data.translatedText || '');
    };

    const outputText = await sendPrompt(promptContent);

    let translatedSegments: TranslatedSegment[];
    if (isSingle) {
      if (!`${outputText}`.trim()) {
        throw new ProviderError(this.id, 'Local HTTP server returned an empty translation');
      }
      translatedSegments = [
        {
          id: request.segments[0].id,
          text: normalizeSubtitleAlternatives(`${outputText}`.trim()),
        },
      ];
    } else {
      const parsedTranslations = await parseIndexedTranslationsWithRepair(
        outputText,
        { providerId: this.id, providerLabel: 'Local HTTP', expectedCount: request.segments.length },
        async (malformedOutput) => {
          logger.info('Local HTTP returned malformed indexed output; requesting one format repair');
          return sendPrompt(buildIndexedRepairPrompt(malformedOutput, request.segments.length));
        },
      );
      translatedSegments = request.segments.map((segment, idx) => ({
        id: segment.id,
        text: normalizeSubtitleAlternatives(parsedTranslations[idx]),
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

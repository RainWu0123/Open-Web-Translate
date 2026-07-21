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
import { createLogger } from '@/shared/logger';

const logger = createLogger('OllamaProvider');

export interface OllamaConfig {
  endpoint?: string;
  model?: string;
  temperature?: number;
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

  constructor(config: OllamaConfig = {}) {
    this.endpoint = config.endpoint || 'http://localhost:11434';
    this.model = config.model || 'llama3';
  }

  validateConfig(config: unknown): ProviderConfigValidation {
    if (!config || typeof config !== 'object') {
      return { isValid: false, errors: ['Configuration must be an object'] };
    }
    const cfg = config as OllamaConfig;
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

    return `You are a professional translator. Translate the following text segments into target language code "${request.targetLanguage}".${glossaryInstructions}\nReturn only the translated text segments in the exact format [idx] Translated Text, without commentary.\n\n${segmentsText}`;
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (request.signal?.aborted) {
      throw new Error('Translation aborted');
    }

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
    const url = `${this.endpoint.replace(/\/+$/, '')}/api/generate`;

    logger.debug('Sending Ollama generate request', { endpoint: url, model: this.model, segmentCount: request.segments.length });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
        }),
        signal: request.signal,
      });
    } catch (err: any) {
      logger.error('Ollama network connection failed', err);
      throw new NetworkError(`Ollama connection failed: ${err.message || 'Connection refused / Offline'}`);
    }

    if (!response.ok) {
      throw new NetworkError(`Ollama server error HTTP ${response.status}: ${response.statusText}`);
    }

    let data: any;
    try {
      data = await response.json();
    } catch (e: any) {
      throw new ProviderError(this.id, `Malformed JSON response from Ollama: ${e.message}`);
    }

    const generatedText = data.response || '';
    const lines = generatedText.split('\n').filter((l: string) => l.trim().length > 0);

    const translatedSegments: TranslatedSegment[] = request.segments.map((seg, idx) => {
      // Look for line starting with [idx]
      const matchingLine = lines.find((l: string) => l.startsWith(`[${idx}]`));
      if (matchingLine) {
        const cleanText = matchingLine.replace(/^\[\d+\]\s*/, '').trim();
        return { id: seg.id, text: cleanText };
      }
      if (lines[idx]) {
        return { id: seg.id, text: lines[idx].replace(/^\[\d+\]\s*/, '').trim() };
      }
      return { id: seg.id, text: generatedText.trim() || seg.text };
    });

    return {
      providerId: this.id,
      segments: translatedSegments,
      warnings: [],
      cacheable: true,
    };
  }
}

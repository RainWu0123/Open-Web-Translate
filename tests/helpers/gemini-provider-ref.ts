import type { ProviderId, LanguageCode } from '../../src/core/contracts/common';
import type { ProviderCapabilities } from '../../src/core/contracts/capabilities';
import type { TranslationProvider, ProviderConfigValidation } from '../../src/core/contracts/provider';
import type { TranslationRequest, TranslationResult } from '../../src/core/contracts/translation';
import {
  ProviderError,
  ConfigurationError,
  NetworkError,
  QuotaExceededError,
} from '../../src/core/domain/errors/translation-errors';

export interface GeminiProviderConfig {
  apiKey?: string;
  model?: string;
}

export class GeminiProvider implements TranslationProvider {
  readonly id: ProviderId = 'gemini' as ProviderId;
  readonly displayName = 'Gemini 2.0 Flash';
  readonly capabilities: ProviderCapabilities = {
    streaming: false,
    glossary: true,
    context: true,
    maxSegments: 100,
  };

  private apiKey: string;
  private model: string;
  private endpoint: string;

  constructor(config: GeminiProviderConfig = {}) {
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'gemini-2.0-flash';
    this.endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  clearKey(): void {
    this.apiKey = '';
  }

  validateConfig(config: unknown): ProviderConfigValidation {
    const cfg = config as GeminiProviderConfig;
    if (!cfg || !cfg.apiKey || cfg.apiKey.trim() === '') {
      return { isValid: false, errors: ['API key is required'] };
    }
    return { isValid: true };
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new ConfigurationError('Gemini API key is missing or empty');
    }

    if (request.signal?.aborted) {
      throw new NetworkError('Translation aborted');
    }

    const systemPrompt = `You are a professional translator. Translate the JSON array of segments into target language '${request.targetLanguage}'. Return ONLY a JSON array of objects with 'id' and 'translatedText'.`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: JSON.stringify(
                request.segments.map((s) => ({ id: s.id, text: s.text }))
              ),
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
    };

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: request.signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new NetworkError('Request timed out');
      }
      throw new NetworkError(`Network request failed: ${err?.message || 'Unknown network error'}`);
    }

    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403) {
        throw new ConfigurationError(`Authentication failed with status ${status}`);
      }
      if (status === 429) {
        throw new QuotaExceededError(`Rate limit exceeded with status ${status}`);
      }
      throw new ProviderError(this.id, `Server error with status ${status}`);
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new ProviderError(this.id, 'Failed to parse HTTP response as JSON');
    }

    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText || typeof candidateText !== 'string') {
      throw new ProviderError(this.id, 'Missing or malformed candidate text in response');
    }

    let parsed: any[];
    try {
      const cleaned = candidateText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new ProviderError(this.id, 'Invalid JSON returned from model');
    }

    if (!Array.isArray(parsed)) {
      throw new ProviderError(this.id, 'Model output is not a JSON array');
    }

    if (parsed.length !== request.segments.length) {
      throw new ProviderError(this.id, `Segment count mismatch: expected ${request.segments.length}, got ${parsed.length}`);
    }

    for (const item of parsed) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.translatedText !== 'string') {
        throw new ProviderError(this.id, 'Invalid response schema: missing id or translatedText');
      }
    }

    return {
      providerId: this.id,
      segments: parsed.map((item) => ({
        id: item.id as any,
        text: item.translatedText,
      })),
      usage: data.usageMetadata
        ? { tokens: data.usageMetadata.totalTokenCount }
        : { characters: request.segments.reduce((sum, s) => sum + s.text.length, 0) },
      warnings: [],
      cacheable: true,
    };
  }
}

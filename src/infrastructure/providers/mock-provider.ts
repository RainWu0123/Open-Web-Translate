/**
 * Mock Translation Provider
 *
 * Returns bracketed text with target language indicator after a short delay.
 * Used for development and testing without real API calls.
 */
import type { ProviderId } from '@/core/contracts/common';
import type { ProviderCapabilities } from '@/core/contracts/capabilities';
import type {
  TranslationProvider,
  ProviderConfigValidation,
} from '@/core/contracts/provider';
import type {
  TranslationRequest,
  TranslationResult,
} from '@/core/contracts/translation';

const LANGUAGE_NAMES: Record<string, string> = {
  'zh-Hant': '繁體中文',
  'zh-Hans': '簡體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
};

export class MockProvider implements TranslationProvider {
  readonly id = 'mock-provider' as ProviderId;
  readonly displayName = 'Mock Provider';
  readonly capabilities: ProviderCapabilities = {
    streaming: false,
    glossary: false,
    context: false,
    maxSegments: 100,
  };

  validateConfig(_config: unknown): ProviderConfigValidation {
    return { isValid: true };
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    // Respect abort signal
    if (request.signal?.aborted) {
      throw new Error('Translation aborted');
    }

    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 200));

    const langName = LANGUAGE_NAMES[request.targetLanguage] || request.targetLanguage;

    return {
      providerId: this.id,
      segments: request.segments.map((seg) => ({
        id: seg.id,
        text: seg.text,
      })),
      usage: { characters: request.segments.reduce((sum, s) => sum + s.text.length, 0) },
      warnings: [],
      cacheable: true,
    };
  }
}

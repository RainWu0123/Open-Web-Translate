import type { ExtensionSettings } from '@/core/contracts/messages';
import type { TranslationProvider } from '@/core/contracts/provider';
import { GoogleTranslateProvider } from './google-provider';
import { DeepLProvider } from './deepl-provider';
import { GeminiProvider } from './gemini-provider';
import { MockProvider } from './mock-provider';
import { OllamaProvider } from './ollama-provider';
import { LocalHttpProvider } from './local-http-provider';
import { ChromeBuiltInAIProvider, ChromeAiProvider } from './chrome-builtin-ai-provider';
import { ModelRegistry } from './model-registry';

export * from './google-provider';
export * from './deepl-provider';
export * from './gemini-provider';
export * from './mock-provider';
export * from './ollama-provider';
export * from './local-http-provider';
export * from './chrome-builtin-ai-provider';
export * from './model-registry';

/**
 * Factory function to retrieve active provider based on ID and settings.
 */
export function getProvider(providerId: string, settings?: Partial<ExtensionSettings>): TranslationProvider {
  return ModelRegistry.createProvider(providerId, settings);
}

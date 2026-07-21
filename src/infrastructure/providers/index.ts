import type { TranslationProvider } from '@/core/contracts/provider';
import type { ExtensionSettings } from '@/core/contracts/messages';
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
 * Creates and registers all available translation providers.
 */
export function createProviderRegistry(settings?: Partial<ExtensionSettings>): Map<string, TranslationProvider> {
  const providers = new Map<string, TranslationProvider>();

  const ollama = new OllamaProvider({
    endpoint: settings?.ollamaEndpoint,
    model: settings?.ollamaModel,
    temperature: settings?.ollamaTemperature,
  });
  const localHttp = new LocalHttpProvider({
    endpoint: settings?.localHttpEndpoint,
    apiKey: settings?.localHttpApiKey,
  });
  const chromeBuiltIn = new ChromeAiProvider();
  const google = new GoogleTranslateProvider();
  const deepl = new DeepLProvider();
  const gemini = new GeminiProvider();
  const mock = new MockProvider();

  providers.set(ollama.id, ollama);
  providers.set('ollama', ollama);
  providers.set(localHttp.id, localHttp);
  providers.set('local-http', localHttp);
  providers.set(chromeBuiltIn.id, chromeBuiltIn);
  providers.set('chrome-ai', chromeBuiltIn);
  providers.set('chrome-builtin-ai-provider', chromeBuiltIn);
  providers.set(google.id, google);
  providers.set('google', google);
  providers.set(deepl.id, deepl);
  providers.set('deepl', deepl);
  providers.set(gemini.id, gemini);
  providers.set('gemini', gemini);
  providers.set(mock.id, mock);
  providers.set('mock', mock);

  return providers;
}

/**
 * Factory function to retrieve active provider based on ID and settings.
 */
export function getProvider(providerId: string, settings?: Partial<ExtensionSettings>): TranslationProvider {
  return ModelRegistry.createProvider(providerId, settings);
}

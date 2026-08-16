/**
 * Model Registry for Open Web Translate v3
 *
 * Central registry managing models, providers, and lifecycle validations.
 * Registers Gemini, Ollama Local Provider (OllamaProvider), and Chrome Built-in AI
 * Provider (ChromeAiProvider).
 */
import type { TranslationProvider } from '@/core/contracts/provider';
import type { ExtensionSettings } from '@/core/contracts/messages';
import {
  VERIFIED_MODEL_REGISTRY,
  validateModelId as validateGeminiModelId,
  type ModelEntry,
} from './gemini/model-registry';
import { OllamaProvider } from './ollama-provider';
import { ChromeAiProvider, ChromeBuiltInAIProvider } from './chrome-builtin-ai-provider';
import { GeminiProvider } from './gemini-provider';
import { GoogleTranslateProvider } from './google-provider';
import { DeepLProvider } from './deepl-provider';
import { LocalHttpProvider } from './local-http-provider';
import { MockProvider } from './mock-provider';

export * from './gemini/model-registry';

export interface ProviderRegistration {
  providerId: string;
  displayName: string;
  isLocal: boolean;
  supportedModels: string[];
}

export const REGISTERED_PROVIDERS: Record<string, ProviderRegistration> = {
  'ollama-provider': {
    providerId: 'ollama-provider',
    displayName: 'Ollama Local AI',
    isLocal: true,
    supportedModels: ['llama3', 'llama3.1', 'mistral', 'qwen2.5', 'gemma2'],
  },
  'chrome-builtin-ai-provider': {
    providerId: 'chrome-builtin-ai-provider',
    displayName: 'Chrome Built-in AI',
    isLocal: true,
    supportedModels: ['chrome-ai-translator'],
  },
  'gemini-provider': {
    providerId: 'gemini-provider',
    displayName: 'Google Gemini AI',
    isLocal: false,
    supportedModels: VERIFIED_MODEL_REGISTRY.map((m) => m.id),
  },
  'google-provider': {
    providerId: 'google-provider',
    displayName: 'Google Translate',
    isLocal: false,
    supportedModels: ['default'],
  },
  'deepl-provider': {
    providerId: 'deepl-provider',
    displayName: 'DeepL API',
    isLocal: false,
    supportedModels: ['default'],
  },
  'local-http-provider': {
    providerId: 'local-http-provider',
    displayName: 'Local HTTP Provider',
    isLocal: true,
    supportedModels: ['default'],
  },
  'mock-provider': {
    providerId: 'mock-provider',
    displayName: 'Mock Provider',
    isLocal: true,
    supportedModels: ['mock'],
  },
};

export class ModelRegistry {
  private static providerMap = new Map<string, ProviderRegistration>(
    Object.entries(REGISTERED_PROVIDERS),
  );

  /**
   * Alias mappings for flexible provider ID resolution
   */
  private static aliasMap = new Map<string, string>([
    ['ollama', 'ollama-provider'],
    ['chrome-ai', 'chrome-builtin-ai-provider'],
    ['chrome-builtin-ai', 'chrome-builtin-ai-provider'],
    ['chromeaiprovider', 'chrome-builtin-ai-provider'],
    ['gemini', 'gemini-provider'],
    ['google', 'google-provider'],
    ['deepl', 'deepl-provider'],
    ['local-http', 'local-http-provider'],
    ['mock', 'mock-provider'],
  ]);

  /**
   * Resolve provider ID including aliases
   */
  static resolveProviderId(id: string): string {
    const key = id.toLowerCase().trim();
    return this.aliasMap.get(key) || key;
  }

  /**
   * Check if a provider is registered in the Model Registry
   */
  static isRegistered(providerId: string): boolean {
    const resolved = this.resolveProviderId(providerId);
    return this.providerMap.has(resolved);
  }

  /**
   * Get registration details for a provider
   */
  static getProviderRegistration(providerId: string): ProviderRegistration | undefined {
    const resolved = this.resolveProviderId(providerId);
    return this.providerMap.get(resolved);
  }

  /**
   * Instantiate provider from registry
   */
  static createProvider(providerId: string, settings?: Partial<ExtensionSettings>): TranslationProvider {
    const resolved = this.resolveProviderId(providerId);
    const reg = this.providerMap.get(resolved);

    if (!reg) {
      return new GoogleTranslateProvider();
    }

    switch (resolved) {
      case 'ollama-provider':
        return new OllamaProvider({
          endpoint: settings?.ollamaEndpoint,
          model: settings?.ollamaModel,
          temperature: settings?.ollamaTemperature,
        });
      case 'chrome-builtin-ai-provider':
        return new ChromeAiProvider();
      case 'gemini-provider':
        return new GeminiProvider();
      case 'deepl-provider':
        return new DeepLProvider();
      case 'local-http-provider':
        return new LocalHttpProvider({
          endpoint: settings?.localHttpEndpoint,
          apiKey: settings?.localHttpApiKey,
        });
      case 'mock-provider':
        return new MockProvider();
      case 'google-provider':
      default:
        return new GoogleTranslateProvider();
    }
  }

  /**
   * Validates a model ID for a specific provider
   */
  static validateModel(providerId: string, modelId: string): { isValid: boolean; message?: string } {
    const resolved = this.resolveProviderId(providerId);
    if (resolved === 'gemini-provider') {
      const res = validateGeminiModelId(modelId);
      return { isValid: res.valid, message: 'message' in res ? res.message : undefined };
    }
    if (resolved === 'ollama-provider') {
      if (!modelId || modelId.trim().length === 0) {
        return { isValid: false, message: 'Ollama model ID cannot be empty' };
      }
      return { isValid: true };
    }
    if (resolved === 'chrome-builtin-ai-provider') {
      return { isValid: true };
    }
    return { isValid: true };
  }

  /**
   * Returns list of all registered models across all registered providers
   */
  static getAllRegisteredModels(): Array<{ providerId: string; modelId: string; displayName: string; isLocal: boolean }> {
    const result: Array<{ providerId: string; modelId: string; displayName: string; isLocal: boolean }> = [];

    for (const [providerId, reg] of this.providerMap.entries()) {
      for (const modelId of reg.supportedModels) {
        result.push({
          providerId,
          modelId,
          displayName: `${reg.displayName} (${modelId})`,
          isLocal: reg.isLocal,
        });
      }
    }

    return result;
  }
}

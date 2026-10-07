import type { ExtensionSettings } from '@/core/contracts/messages';
import { ModelRegistry } from './model-registry';
import { DEFAULT_MODEL_ID } from './gemini/model-registry';

function normalized(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/**
 * Returns the cache identity for settings that can materially change a
 * provider's translation output. Keep this provider-specific knowledge out
 * of TranslationPipeline so model/default changes cannot drift there.
 */
export function getProviderCacheIdentity(
  providerId: string,
  settings: Partial<ExtensionSettings>,
): { providerId: string; fingerprint: string } {
  const resolvedProviderId = ModelRegistry.resolveProviderId(providerId);
  const instructions = settings.aiTranslationInstructions?.trim() || '';

  switch (resolvedProviderId) {
    case 'gemini-provider':
      return {
        providerId: resolvedProviderId,
        fingerprint: `v3:model=${normalized(settings.geminiModel, DEFAULT_MODEL_ID)};instructions=${instructions}`,
      };

    case 'ollama-provider':
      return {
        providerId: resolvedProviderId,
        fingerprint: `v3:endpoint=${normalized(settings.ollamaEndpoint, 'http://localhost:11434')};model=${normalized(settings.ollamaModel, 'llama3')};instructions=${instructions}`,
      };

    case 'local-http-provider':
      return {
        providerId: resolvedProviderId,
        fingerprint: `v3:endpoint=${normalized(settings.localHttpEndpoint, 'http://127.0.0.1:8080')};model=${normalized(settings.localHttpModel, 'local-model')};instructions=${instructions}`,
      };

    case 'custom-http-provider':
      return {
        providerId: resolvedProviderId,
        fingerprint: `v1:endpoint=${normalized(settings.customHttpEndpoint, '')};model=${normalized(settings.customHttpModel, 'default')};instructions=${instructions}`,
      };

    case 'openrouter-provider':
      return {
        providerId: resolvedProviderId,
        fingerprint: `v1:endpoint=https://openrouter.ai/api/v1;model=${normalized(settings.openRouterModel, 'openrouter/auto')};instructions=${instructions}`,
      };

    case 'nvidia-nim-provider':
      return {
        providerId: resolvedProviderId,
        fingerprint: `v1:endpoint=${normalized(settings.nvidiaNimEndpoint, 'https://integrate.api.nvidia.com/v1')};model=${normalized(settings.nvidiaNimModel, 'meta/llama-3.1-8b-instruct')};instructions=${instructions}`,
      };

    case 'google-provider':
      return {
        providerId: resolvedProviderId,
        fingerprint: 'google-translate:v2-subtitle',
      };

    case 'deepl-provider':
      return {
        providerId: resolvedProviderId,
        fingerprint: `deepl:v1;tier=${settings.deeplApiIsPro ? 'pro' : 'free'}`,
      };

    case 'chrome-builtin-ai-provider':
      return {
        providerId: resolvedProviderId,
        fingerprint: 'chrome-builtin-ai:v1',
      };

    case 'mock-provider':
      return {
        providerId: resolvedProviderId,
        fingerprint: 'mock:v1',
      };

    default:
      return {
        providerId: resolvedProviderId,
        fingerprint: 'default:v1',
      };
  }
}

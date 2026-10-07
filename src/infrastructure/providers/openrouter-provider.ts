/**
 * OpenRouter provider.
 *
 * Official API reference:
 * https://openrouter.ai/docs
 *
 * OpenRouter exposes an OpenAI-compatible API at
 * https://openrouter.ai/api/v1. OWT does not bundle OpenRouter code.
 */
import { OpenAiCompatibleProvider } from './openai-compatible-provider';

export interface OpenRouterConfig {
  model?: string;
  apiKey?: string;
  instructions?: string;
}

export const OPENROUTER_DEFAULT_MODEL = 'openrouter/auto';
export const OPENROUTER_MODEL_SUGGESTIONS = [
  'openrouter/auto',
  'openrouter/free',
] as const;

export class OpenRouterProvider extends OpenAiCompatibleProvider {
  constructor(config: OpenRouterConfig = {}) {
    super({
      providerId: 'openrouter-provider',
      displayName: 'OpenRouter',
      endpoint: 'https://openrouter.ai/api/v1',
      model: config.model?.trim() || OPENROUTER_DEFAULT_MODEL,
      apiKey: config.apiKey,
      instructions: config.instructions,
      apiKeyPolicy: 'required',
      maxSegments: 30,
    });
  }
}

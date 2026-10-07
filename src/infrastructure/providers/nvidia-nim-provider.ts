/**
 * NVIDIA NIM provider.
 *
 * Official NIM API reference:
 * https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html
 *
 * NIM exposes OpenAI-compatible /v1/chat/completions and /v1/models endpoints.
 * The default endpoint below targets NVIDIA's hosted API catalog; users may
 * replace it with a loopback NIM endpoint for local inference.
 */
import { OpenAiCompatibleProvider } from './openai-compatible-provider';

export interface NvidiaNimConfig {
  endpoint?: string;
  model?: string;
  apiKey?: string;
  instructions?: string;
}

export const NVIDIA_NIM_DEFAULT_ENDPOINT = 'https://integrate.api.nvidia.com/v1';
export const NVIDIA_NIM_DEFAULT_MODEL = 'meta/llama-3.1-8b-instruct';
export const NVIDIA_NIM_MODEL_SUGGESTIONS = [
  'meta/llama-3.1-8b-instruct',
  'meta/llama-3.1-70b-instruct',
] as const;

export class NvidiaNimProvider extends OpenAiCompatibleProvider {
  constructor(config: NvidiaNimConfig = {}) {
    super({
      providerId: 'nvidia-nim-provider',
      displayName: 'NVIDIA NIM',
      endpoint: config.endpoint?.trim() || NVIDIA_NIM_DEFAULT_ENDPOINT,
      model: config.model?.trim() || NVIDIA_NIM_DEFAULT_MODEL,
      apiKey: config.apiKey,
      instructions: config.instructions,
      apiKeyPolicy: 'remote-only',
      maxSegments: 30,
    });
  }
}

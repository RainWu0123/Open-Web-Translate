import { describe, expect, it } from 'vitest';
import { getProviderCacheIdentity } from '@/infrastructure/providers/cache-identity';
import { DEFAULT_MODEL_ID } from '@/infrastructure/providers/gemini/model-registry';

describe('provider cache identity', () => {
  it('uses the Gemini registry default instead of a duplicated hard-coded model', () => {
    const identity = getProviderCacheIdentity('gemini-provider', {});

    expect(identity.providerId).toBe('gemini-provider');
    expect(identity.fingerprint).toContain(`model=${DEFAULT_MODEL_ID}`);
    expect(identity.fingerprint).not.toContain('gemini-2.0-flash');
  });

  it('canonicalizes provider aliases so aliases share the same cache namespace', () => {
    const canonical = getProviderCacheIdentity('google-provider', {});
    const alias = getProviderCacheIdentity('google', {});

    expect(alias).toEqual(canonical);
  });

  it('changes AI provider identity when output-affecting configuration changes', () => {
    const base = getProviderCacheIdentity('ollama-provider', {
      ollamaEndpoint: 'http://localhost:11434',
      ollamaModel: 'llama3',
      aiTranslationInstructions: 'Use formal language',
    });

    const changedModel = getProviderCacheIdentity('ollama-provider', {
      ollamaEndpoint: 'http://localhost:11434',
      ollamaModel: 'qwen2.5',
      aiTranslationInstructions: 'Use formal language',
    });

    const changedInstructions = getProviderCacheIdentity('ollama-provider', {
      ollamaEndpoint: 'http://localhost:11434',
      ollamaModel: 'llama3',
      aiTranslationInstructions: 'Use casual language',
    });

    expect(changedModel.fingerprint).not.toBe(base.fingerprint);
    expect(changedInstructions.fingerprint).not.toBe(base.fingerprint);
  });

  it('distinguishes remote Custom HTTP endpoints and models', () => {
    const first = getProviderCacheIdentity('custom-http-provider', {
      customHttpEndpoint: 'https://api.example.com',
      customHttpModel: 'model-a',
    });
    const second = getProviderCacheIdentity('custom-http-provider', {
      customHttpEndpoint: 'https://proxy.example.net',
      customHttpModel: 'model-b',
    });

    expect(first.providerId).toBe('custom-http-provider');
    expect(second.fingerprint).not.toBe(first.fingerprint);
  });

  it('tracks OpenRouter and NVIDIA NIM output-affecting settings', () => {
    const openRouterA = getProviderCacheIdentity('openrouter-provider', {
      openRouterModel: 'openrouter/auto',
      aiTranslationInstructions: 'Use concise subtitles',
    });
    const openRouterB = getProviderCacheIdentity('openrouter-provider', {
      openRouterModel: 'openrouter/free',
      aiTranslationInstructions: 'Use concise subtitles',
    });
    expect(openRouterB.fingerprint).not.toBe(openRouterA.fingerprint);

    const nimA = getProviderCacheIdentity('nvidia-nim-provider', {
      nvidiaNimEndpoint: 'https://integrate.api.nvidia.com/v1',
      nvidiaNimModel: 'meta/llama-3.1-8b-instruct',
    });
    const nimB = getProviderCacheIdentity('nvidia-nim-provider', {
      nvidiaNimEndpoint: 'http://127.0.0.1:8000/v1',
      nvidiaNimModel: 'meta/llama-3.1-70b-instruct',
    });
    expect(nimB.fingerprint).not.toBe(nimA.fingerprint);
  });

  it('distinguishes Local HTTP endpoints and models', () => {
    const first = getProviderCacheIdentity('local-http-provider', {
      localHttpEndpoint: 'http://127.0.0.1:8080',
      localHttpModel: 'model-a',
    });
    const second = getProviderCacheIdentity('local-http-provider', {
      localHttpEndpoint: 'http://127.0.0.1:9000',
      localHttpModel: 'model-b',
    });

    expect(second.fingerprint).not.toBe(first.fingerprint);
  });
});

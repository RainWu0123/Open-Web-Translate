import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterProvider } from '@/infrastructure/providers/openrouter-provider';
import { NvidiaNimProvider } from '@/infrastructure/providers/nvidia-nim-provider';
import type { LanguageCode, SegmentId } from '@/core/contracts/common';

describe('OpenRouter and NVIDIA NIM providers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends OpenRouter requests to the documented OpenAI-compatible endpoint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: '翻譯完成' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new OpenRouterProvider({
      model: 'openrouter/auto',
      apiKey: 'sk-or-test',
    });

    expect(provider.isLocal).toBe(false);
    expect(provider.validateConfig().isValid).toBe(true);

    const result = await provider.translate({
      segments: [{ id: 's1' as SegmentId, text: 'Hello' }],
      sourceLanguage: 'en' as LanguageCode,
      targetLanguage: 'zh-Hant' as LanguageCode,
      mode: 'fast',
    });

    expect(result.segments[0].text).toBe('翻譯完成');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer sk-or-test',
    });
    expect(JSON.parse(String((init as RequestInit).body)).model).toBe('openrouter/auto');
  });

  it('supports NVIDIA hosted NIM with an API key', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: '完成' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new NvidiaNimProvider({
      model: 'meta/llama-3.1-8b-instruct',
      apiKey: 'nvapi-test',
    });

    expect(provider.isLocal).toBe(false);
    expect(provider.validateConfig().isValid).toBe(true);

    await provider.translate({
      segments: [{ id: 's1' as SegmentId, text: 'Hello' }],
      sourceLanguage: 'en' as LanguageCode,
      targetLanguage: 'zh-Hant' as LanguageCode,
      mode: 'fast',
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer nvapi-test',
    });
  });

  it('treats loopback NVIDIA NIM as local and does not require a key', () => {
    const provider = new NvidiaNimProvider({
      endpoint: 'http://127.0.0.1:8000/v1',
      model: 'local-model',
    });

    expect(provider.isLocal).toBe(true);
    expect(provider.validateConfig().isValid).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomHttpProvider } from '@/infrastructure/providers/custom-http-provider';
import type { LanguageCode, SegmentId } from '@/core/contracts/common';

describe('CustomHttpProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is explicitly remote and accepts HTTPS custom endpoints', () => {
    const provider = new CustomHttpProvider();
    expect(provider.isLocal).toBe(false);
    expect(provider.validateConfig({
      endpoint: 'https://api.example.com',
      model: 'my-model',
    }).isValid).toBe(true);
  });

  it('rejects insecure remote HTTP endpoints', () => {
    const provider = new CustomHttpProvider();
    const result = provider.validateConfig({
      endpoint: 'http://api.example.com',
      model: 'my-model',
    });

    expect(result.isValid).toBe(false);
    expect(result.errors?.[0]).toContain('HTTPS');
  });

  it('allows loopback HTTP endpoints for development without claiming local privacy', () => {
    const provider = new CustomHttpProvider();
    expect(provider.validateConfig({
      endpoint: 'http://127.0.0.1:9000',
      model: 'dev-model',
    }).isValid).toBe(true);
    expect(provider.isLocal).toBe(false);
  });

  it('sends translations and API credentials only to the configured endpoint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '翻譯完成' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new CustomHttpProvider({
      endpoint: 'https://api.example.com',
      model: 'remote-model',
      apiKey: 'secret-token',
    });

    const result = await provider.translate({
      segments: [{ id: 's1' as SegmentId, text: 'Hello' }],
      sourceLanguage: 'en' as LanguageCode,
      targetLanguage: 'zh-Hant' as LanguageCode,
      mode: 'fast',
    });

    expect(result.segments[0].text).toBe('翻譯完成');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer secret-token',
    });
  });
});

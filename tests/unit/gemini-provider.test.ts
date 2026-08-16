// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeminiProvider } from '../../src/infrastructure/providers/gemini-provider';
import { SettingsStorage } from '../../src/infrastructure/storage/extension-storage/settings-storage';
import {
  ProviderError,
  ConfigurationError,
  NetworkError,
  QuotaExceededError,
} from '../../src/core/domain/errors/translation-errors';

describe('GeminiProvider Unit Tests', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    GeminiProvider.clearSessionBlocks();
    originalFetch = global.fetch;
    vi.spyOn(SettingsStorage, 'get').mockResolvedValue({
      targetLanguage: 'zh-Hant',
      enabled: true,
      defaultTranslationMode: 'fast',
      activeProviderId: 'gemini-provider',
      geminiApiKey: 'test-gemini-api-key-999',
      geminiModel: 'gemini-3.5-flash',
      displayMode: 'bilingual',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('throws ConfigurationError when API key is missing or empty', async () => {
    vi.spyOn(SettingsStorage, 'get').mockResolvedValueOnce({
      targetLanguage: 'zh-Hant',
      enabled: true,
      defaultTranslationMode: 'fast',
      activeProviderId: 'gemini-provider',
      geminiApiKey: '',
      geminiModel: 'gemini-3.5-flash',
      displayMode: 'bilingual',
    });
    const provider = new GeminiProvider();
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    await expect(
      provider.translate({
        segments: [{ id: 'seg-1' as any, text: 'Hello' }],
        sourceLanguage: 'auto' as any,
        targetLanguage: 'zh-Hant' as any,
        mode: 'fast',
      })
    ).rejects.toThrow(ConfigurationError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends request to correct HTTPS endpoint, header, and system prompt', async () => {
    const apiKey = 'test-gemini-api-key-999';
    const provider = new GeminiProvider();

    let capturedUrl = '';
    let capturedOptions: any = null;

    global.fetch = vi.fn().mockImplementation(async (url, options) => {
      capturedUrl = url.toString();
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify([
                      { id: 'seg-1', translatedText: '你好' },
                      { id: 'seg-2', translatedText: '世界' },
                    ]),
                  },
                ],
              },
            },
          ],
        }),
      };
    });

    const result = await provider.translate({
      segments: [
        { id: 'seg-1' as any, text: 'Hello' },
        { id: 'seg-2' as any, text: 'World' },
      ],
      sourceLanguage: 'auto' as any,
      targetLanguage: 'zh-Hant' as any,
      mode: 'fast',
    });

    expect(capturedUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent');
    expect(capturedOptions.headers['x-goog-api-key']).toBe(apiKey);
    expect(capturedOptions.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(capturedOptions.body);
    expect(body.systemInstruction).toBeDefined();
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toEqual({ id: 'seg-1', text: '你好' });
    expect(result.segments[1]).toEqual({ id: 'seg-2', text: '世界' });
  });

  it('fails closed when response candidate text is invalid JSON', async () => {
    const provider = new GeminiProvider();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'This is not valid JSON string' }] } }],
      }),
    });

    await expect(
      provider.translate({
        segments: [{ id: 's1' as any, text: 'Test' }],
        sourceLanguage: 'auto' as any,
        targetLanguage: 'zh-Hant' as any,
        mode: 'fast',
      })
    ).rejects.toThrow(ProviderError);
  });

  it('fails closed when response missing required fields (id or translatedText)', async () => {
    const provider = new GeminiProvider();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify([{ id: 's1' }]) }] } }],
      }),
    });

    await expect(
      provider.translate({
        segments: [{ id: 's1' as any, text: 'Test' }],
        sourceLanguage: 'auto' as any,
        targetLanguage: 'zh-Hant' as any,
        mode: 'fast',
      })
    ).rejects.toThrow(ProviderError);
  });

  it('maps 401/403 status code without leaking secret API key in error message', async () => {
    const secretKey = 'super-secret-gemini-key-12345';
    vi.spyOn(SettingsStorage, 'get').mockResolvedValueOnce({
      targetLanguage: 'zh-Hant',
      enabled: true,
      defaultTranslationMode: 'fast',
      activeProviderId: 'gemini-provider',
      geminiApiKey: secretKey,
      geminiModel: 'gemini-3.5-flash',
      displayMode: 'bilingual',
    });
    const provider = new GeminiProvider();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => `Invalid API Key ${secretKey}`,
    });

    let caughtError: Error | null = null;
    try {
      await provider.translate({
        segments: [{ id: 's1' as any, text: 'Hello' }],
        sourceLanguage: 'auto' as any,
        targetLanguage: 'zh-Hant' as any,
        mode: 'fast',
      });
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ConfigurationError);
    expect(caughtError?.message).not.toContain(secretKey);
  });

  it('maps 429 status code to QuotaExceededError without leaking key', async () => {
    const secretKey = 'super-secret-gemini-key-12345';
    const provider = new GeminiProvider();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => `Quota exceeded for key ${secretKey}`,
    });

    let caughtError: Error | null = null;
    try {
      await provider.translate({
        segments: [{ id: 's1' as any, text: 'Hello' }],
        sourceLanguage: 'auto' as any,
        targetLanguage: 'zh-Hant' as any,
        mode: 'fast',
      });
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(QuotaExceededError);
    expect(caughtError?.message).not.toContain(secretKey);
  });

  it('maps 500 status code to NetworkError without leaking key', async () => {
    const secretKey = 'super-secret-gemini-key-12345';
    const provider = new GeminiProvider();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => `Error on key ${secretKey}`,
    });

    let caughtError: Error | null = null;
    try {
      await provider.translate({
        segments: [{ id: 's1' as any, text: 'Hello' }],
        sourceLanguage: 'auto' as any,
        targetLanguage: 'zh-Hant' as any,
        mode: 'fast',
      });
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(NetworkError);
    expect(caughtError?.message).not.toContain(secretKey);
  });

  it('maps network fetch rejection to NetworkError without leaking key', async () => {
    const secretKey = 'super-secret-gemini-key-12345';
    const provider = new GeminiProvider();
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Network connection reset'));

    let caughtError: Error | null = null;
    try {
      await provider.translate({
        segments: [{ id: 's1' as any, text: 'Hello' }],
        sourceLanguage: 'auto' as any,
        targetLanguage: 'zh-Hant' as any,
        mode: 'fast',
      });
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(NetworkError);
    expect(caughtError?.message).not.toContain(secretKey);
  });
});

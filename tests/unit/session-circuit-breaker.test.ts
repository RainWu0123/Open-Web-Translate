// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiProvider } from '../../src/infrastructure/providers/gemini-provider';
import { SettingsStorage } from '../../src/infrastructure/storage/extension-storage/settings-storage';
import { ConfigurationError, QuotaExceededError, NetworkError } from '../../src/core/domain/errors/translation-errors';
import type { TranslationRequest } from '../../src/core/contracts/translation';

describe('GeminiProvider Session Circuit Breaker Unit Tests', () => {
  let provider: GeminiProvider;
  const originalFetch = global.fetch;

  beforeEach(() => {
    provider = new GeminiProvider();
    GeminiProvider.clearSessionBlocks();
    vi.restoreAllMocks();

    vi.spyOn(SettingsStorage, 'get').mockResolvedValue({
      sourceLanguage: 'auto',
      targetLanguage: 'zh-Hant',
      enabled: true,
      defaultTranslationMode: 'fast',
      activeProviderId: 'gemini-provider',
      geminiApiKey: 'test-dummy-gemini-key-123456789',
      geminiModel: 'gemini-3.5-flash',
      displayMode: 'bilingual',
    });
  });

  const sampleRequest: TranslationRequest = {
    segments: [{ id: 'seg-1' as any, text: 'Hello world' }],
    sourceLanguage: 'en' as any,
    targetLanguage: 'zh-Hant' as any,
    mode: 'fast',
  };

  it('blocks model on HTTP 404 response and fails closed on subsequent calls', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Model Not Found: models/gemini-invalid',
    } as Response);

    expect(GeminiProvider.isSessionBlocked('gemini-3.5-flash')).toBe(false);

    // First call -> returns 404 -> triggers session block
    await expect(provider.translate(sampleRequest)).rejects.toThrow(ConfigurationError);
    expect(GeminiProvider.isSessionBlocked('gemini-3.5-flash')).toBe(true);

    // Reset fetch mock to prove subsequent call fails immediately without calling fetch
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true } as Response);
    global.fetch = fetchSpy;

    await expect(provider.translate(sampleRequest)).rejects.toThrow(ConfigurationError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks model when response body contains "unsupported model"', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Unsupported model generateContent endpoint',
    } as Response);

    await expect(provider.translate(sampleRequest)).rejects.toThrow(ConfigurationError);
    expect(GeminiProvider.isSessionBlocked('gemini-3.5-flash')).toBe(true);
  });

  it('does NOT session-block model on HTTP 401 or 403 (invalid key / unauthorized)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'API key invalid',
    } as Response);

    await expect(provider.translate(sampleRequest)).rejects.toThrow(ConfigurationError);
    expect(GeminiProvider.isSessionBlocked('gemini-3.5-flash')).toBe(false);
  });

  it('does NOT session-block model on HTTP 429 (rate limit / quota)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Resource exhausted',
    } as Response);

    await expect(provider.translate(sampleRequest)).rejects.toThrow(QuotaExceededError);
    expect(GeminiProvider.isSessionBlocked('gemini-3.5-flash')).toBe(false);
  });

  it('does NOT session-block model on HTTP 500 or network error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);

    await expect(provider.translate(sampleRequest)).rejects.toThrow(NetworkError);
    expect(GeminiProvider.isSessionBlocked('gemini-3.5-flash')).toBe(false);
  });

  it('clears session blocks via clearSessionBlocks()', () => {
    (GeminiProvider as any).sessionBlockedModels.add('gemini-3.5-flash');
    expect(GeminiProvider.isSessionBlocked('gemini-3.5-flash')).toBe(true);

    GeminiProvider.clearSessionBlocks();
    expect(GeminiProvider.isSessionBlocked('gemini-3.5-flash')).toBe(false);
  });
});

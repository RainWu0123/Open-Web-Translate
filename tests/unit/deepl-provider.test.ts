import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeepLProvider } from '../../src/infrastructure/providers/deepl-provider';
import { SettingsStorage } from '../../src/infrastructure/storage/extension-storage/settings-storage';
import {
  ConfigurationError,
  NetworkError,
  QuotaExceededError,
} from '../../src/core/domain/errors/translation-errors';

vi.mock('wxt/browser', () => {
  const store: Record<string, any> = {};
  return {
    browser: {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: store[key] })),
          set: vi.fn(async (obj: Record<string, any>) => {
            Object.assign(store, obj);
          }),
        },
      },
    },
  };
});

describe('DeepLProvider Unit Tests', () => {
  let provider: DeepLProvider;

  beforeEach(() => {
    provider = new DeepLProvider();
    vi.restoreAllMocks();
  });

  it('validates configuration correctly', () => {
    expect(provider.validateConfig({ deeplApiKey: 'test-key:fx' }).isValid).toBe(true);
    expect(provider.validateConfig({}).isValid).toBe(false);
  });

  it('throws ConfigurationError when API key is missing', async () => {
    vi.spyOn(SettingsStorage, 'get').mockResolvedValue({
      targetLanguage: 'zh-Hant',
      enabled: true,
      defaultTranslationMode: 'fast',
      activeProviderId: 'deepl-provider',
      deeplApiKey: '',
    });

    await expect(
      provider.translate({
        segments: [{ id: 'seg1' as any, text: 'Hello' }],
        sourceLanguage: 'en' as any,
        targetLanguage: 'zh-Hant' as any,
        mode: 'fast',
      }),
    ).rejects.toThrow(ConfigurationError);
  });

  it('translates successfully via mocked DeepL API response', async () => {
    vi.spyOn(SettingsStorage, 'get').mockResolvedValue({
      targetLanguage: 'zh-Hant',
      enabled: true,
      defaultTranslationMode: 'fast',
      activeProviderId: 'deepl-provider',
      deeplApiKey: 'fake-deepl-key:fx',
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        translations: [{ detected_source_language: 'EN', text: '你好' }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await provider.translate({
      segments: [{ id: 'seg1' as any, text: 'Hello' }],
      sourceLanguage: 'en' as any,
      targetLanguage: 'zh-Hant' as any,
      mode: 'fast',
    });

    expect(result.providerId).toBe('deepl-provider');
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].text).toBe('你好');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api-free.deepl.com/v2/translate',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'DeepL-Auth-Key fake-deepl-key:fx',
        }),
      }),
    );
  });

  it('handles DeepL 456 quota exceeded error correctly', async () => {
    vi.spyOn(SettingsStorage, 'get').mockResolvedValue({
      targetLanguage: 'zh-Hant',
      enabled: true,
      defaultTranslationMode: 'fast',
      activeProviderId: 'deepl-provider',
      deeplApiKey: 'fake-deepl-key:fx',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 456,
        text: async () => 'Quota exceeded',
      }),
    );

    await expect(
      provider.translate({
        segments: [{ id: 'seg1' as any, text: 'Hello' }],
        sourceLanguage: 'en' as any,
        targetLanguage: 'zh-Hant' as any,
        mode: 'fast',
      }),
    ).rejects.toThrow(QuotaExceededError);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: {
    activeProviderId: 'remote-provider',
    defaultTranslationMode: 'fast',
    remoteProviderDisclosureVersion: 0 as number | undefined,
  },
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  provider: {
    id: 'remote-provider',
    displayName: 'Remote Provider',
    isLocal: false,
    capabilities: { streaming: false, glossary: false, context: false, maxSegments: 10 },
    validateConfig: vi.fn(() => ({ isValid: true })),
    translate: vi.fn(),
  },
}));

vi.mock('@/infrastructure/storage/extension-storage/settings-storage', () => ({
  SettingsStorage: {
    getInternal: vi.fn(async () => ({ ...mocks.settings })),
    watch: vi.fn(() => () => {}),
  },
}));

vi.mock('@/infrastructure/storage/repositories/cache-repository', async () => {
  const actual = await vi.importActual<any>('@/infrastructure/storage/repositories/cache-repository');
  return {
    ...actual,
    CacheRepository: vi.fn().mockImplementation(() => ({
      get: mocks.cacheGet,
      set: mocks.cacheSet,
    })),
  };
});

vi.mock('@/infrastructure/providers', () => ({
  getProvider: vi.fn(() => mocks.provider),
}));

vi.mock('@/infrastructure/providers/cache-identity', () => ({
  getProviderCacheIdentity: vi.fn(() => ({
    providerId: 'remote-provider',
    fingerprint: 'privacy-test:v1',
  })),
}));

import { TranslationPipeline } from '@/core/pipeline/translation-pipeline';

describe('TranslationPipeline first-run remote-provider disclosure', () => {
  beforeEach(() => {
    mocks.settings.remoteProviderDisclosureVersion = 0;
    mocks.provider.isLocal = false;
    mocks.cacheGet.mockReset().mockResolvedValue(null);
    mocks.cacheSet.mockReset().mockResolvedValue(undefined);
    mocks.provider.translate.mockReset().mockResolvedValue({
      providerId: 'remote-provider',
      cacheable: false,
      warnings: [],
      segments: [{ id: 's1', text: 'translated' }],
    });
  });

  it('blocks remote providers before acknowledgement without making a provider request', async () => {
    const pipeline = new TranslationPipeline();

    await expect(pipeline.translate({
      bypassCache: true,
      segments: [{ id: 's1', text: 'hello' }],
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hant',
    })).rejects.toThrow('確認資料傳輸說明');

    expect(mocks.provider.translate).not.toHaveBeenCalled();
    expect(mocks.cacheGet).not.toHaveBeenCalled();
  });

  it('allows local providers before acknowledgement', async () => {
    mocks.provider.isLocal = true;
    const pipeline = new TranslationPipeline();

    const result = await pipeline.translate({
      bypassCache: true,
      segments: [{ id: 's1', text: 'hello' }],
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hant',
    });

    expect(result.segments[0].translatedText).toBe('translated');
    expect(mocks.provider.translate).toHaveBeenCalledTimes(1);
  });

  it('allows remote providers after acknowledgement', async () => {
    mocks.settings.remoteProviderDisclosureVersion = 1;
    const pipeline = new TranslationPipeline();

    const result = await pipeline.translate({
      bypassCache: true,
      segments: [{ id: 's1', text: 'hello' }],
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hant',
    });

    expect(result.segments[0].translatedText).toBe('translated');
    expect(mocks.provider.translate).toHaveBeenCalledTimes(1);
  });

  it('keeps legacy installs compatible when the disclosure field is absent', async () => {
    mocks.settings.remoteProviderDisclosureVersion = undefined;
    const pipeline = new TranslationPipeline();

    await expect(pipeline.translate({
      bypassCache: true,
      segments: [{ id: 's1', text: 'hello' }],
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hant',
    })).resolves.toBeDefined();
  });
});

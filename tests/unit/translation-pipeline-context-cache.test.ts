import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  translate: vi.fn(),
  provider: {
    id: 'context-provider',
    displayName: 'Context Provider',
    isLocal: false,
    capabilities: {
      streaming: false,
      glossary: false,
      context: true,
      maxSegments: 10,
    },
    validateConfig: vi.fn(() => ({ isValid: true })),
    translate: vi.fn(),
  },
}));

vi.mock('@/infrastructure/storage/extension-storage/settings-storage', () => ({
  SettingsStorage: {
    get: vi.fn().mockResolvedValue({
      activeProviderId: 'context-provider',
      defaultTranslationMode: 'fast',
    }),
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
    providerId: 'context-provider',
    fingerprint: 'provider:v1',
  })),
}));

import { TranslationPipeline } from '@/core/pipeline/translation-pipeline';

describe('TranslationPipeline context-aware cache identity', () => {
  beforeEach(() => {
    mocks.cacheGet.mockReset().mockResolvedValue(null);
    mocks.cacheSet.mockReset().mockResolvedValue(undefined);
    mocks.provider.capabilities.context = true;
    mocks.provider.translate.mockReset().mockImplementation(async (request: any) => ({
      providerId: 'context-provider',
      cacheable: true,
      warnings: [],
      segments: request.segments.map((segment: any) => ({
        id: segment.id,
        text: `translated:${segment.text}`,
      })),
    }));
  });

  it('uses different cache fingerprints for different dialogue context', async () => {
    const pipeline = new TranslationPipeline();
    const base = {
      segments: [{ id: 's1', text: "He's coming." }],
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hant',
    };

    await pipeline.translate({
      ...base,
      context: {
        previous: [{ source: 'John left early.', translation: 'John 很早就離開了。' }],
      },
    });

    const firstFingerprint = mocks.cacheGet.mock.calls[0][0].providerFingerprint;
    mocks.cacheGet.mockClear();

    await pipeline.translate({
      ...base,
      context: {
        previous: [{ source: 'Mary called me.', translation: 'Mary 打電話給我。' }],
      },
    });

    const secondFingerprint = mocks.cacheGet.mock.calls[0][0].providerFingerprint;

    expect(firstFingerprint).not.toBe(secondFingerprint);
    expect(firstFingerprint).toMatch(/^provider:v1;context=[a-f0-9]{64}$/);
    expect(secondFingerprint).toMatch(/^provider:v1;context=[a-f0-9]{64}$/);
  });

  it('normalizes inconsequential whitespace in context before hashing', async () => {
    const pipeline = new TranslationPipeline();
    const base = {
      segments: [{ id: 's1', text: 'Continue.' }],
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hant',
    };

    await pipeline.translate({
      ...base,
      context: {
        previous: [{ source: 'Hello   world', translation: '你好   世界' }],
      },
    });
    const firstFingerprint = mocks.cacheGet.mock.calls[0][0].providerFingerprint;
    mocks.cacheGet.mockClear();

    await pipeline.translate({
      ...base,
      context: {
        previous: [{ source: ' Hello world ', translation: ' 你好 世界 ' }],
      },
    });
    const secondFingerprint = mocks.cacheGet.mock.calls[0][0].providerFingerprint;

    expect(secondFingerprint).toBe(firstFingerprint);
  });

  it('ignores context for providers that declare context unsupported', async () => {
    mocks.provider.capabilities.context = false;
    const pipeline = new TranslationPipeline();

    await pipeline.translate({
      segments: [{ id: 's1', text: 'Hello' }],
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hant',
      context: {
        previous: [{ source: 'Prior line', translation: '前一句' }],
      },
    });

    expect(mocks.cacheGet.mock.calls[0][0].providerFingerprint).toBe('provider:v1;context=none');
    expect(mocks.provider.translate.mock.calls[0][0].context).toBeUndefined();
  });
});

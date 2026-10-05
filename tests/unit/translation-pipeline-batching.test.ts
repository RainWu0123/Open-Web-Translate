import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  translate: vi.fn(),
  provider: {
    id: 'test-provider',
    displayName: 'Test Provider',
    isLocal: true,
    capabilities: {
      streaming: false,
      glossary: false,
      context: true,
      maxSegments: 2,
    },
    validateConfig: vi.fn(() => ({ isValid: true })),
    translate: vi.fn(),
  },
}));

vi.mock('@/infrastructure/storage/extension-storage/settings-storage', () => ({
  SettingsStorage: {
    get: vi.fn().mockResolvedValue({
      activeProviderId: 'test-provider',
      defaultTranslationMode: 'fast',
    }),
    watch: vi.fn(() => () => {}),
  },
}));

vi.mock('@/infrastructure/storage/repositories/cache-repository', () => ({
  CacheRepository: vi.fn().mockImplementation(() => ({
    get: mocks.cacheGet,
    set: mocks.cacheSet,
  })),
}));

vi.mock('@/infrastructure/providers', () => ({
  getProvider: vi.fn(() => mocks.provider),
}));

import { TranslationPipeline } from '@/core/pipeline/translation-pipeline';

describe('TranslationPipeline provider-aware batching', () => {
  beforeEach(() => {
    mocks.cacheGet.mockReset().mockResolvedValue(null);
    mocks.cacheSet.mockReset().mockResolvedValue(undefined);
    mocks.provider.capabilities.maxSegments = 2;
    mocks.provider.translate.mockReset().mockImplementation(async (request: any) => ({
      providerId: 'test-provider',
      cacheable: true,
      warnings: [],
      segments: request.segments.map((segment: any) => ({
        id: segment.id,
        text: `translated:${segment.text}`,
      })),
    }));
  });

  it('splits requests at the provider maxSegments boundary and preserves result order', async () => {
    const pipeline = new TranslationPipeline();
    const segments = Array.from({ length: 5 }, (_, index) => ({
      id: `seg-${index}`,
      text: `text-${index}`,
    }));

    const result = await pipeline.translate({
      bypassCache: true,
      segments,
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hant',
    });

    expect(mocks.provider.translate).toHaveBeenCalledTimes(3);
    expect(mocks.provider.translate.mock.calls.map(([request]: any[]) => request.segments.length))
      .toEqual([2, 2, 1]);
    expect(result.segments).toEqual(
      segments.map((segment) => ({
        id: segment.id,
        translatedText: `translated:${segment.text}`,
      })),
    );
    expect(mocks.cacheSet).toHaveBeenCalledTimes(5);
  });

  it('does not persist partial cache entries when a later batch fails', async () => {
    const pipeline = new TranslationPipeline();
    mocks.provider.translate
      .mockResolvedValueOnce({
        providerId: 'test-provider',
        cacheable: true,
        warnings: [],
        segments: [
          { id: 'seg-0', text: 'ok-0' },
          { id: 'seg-1', text: 'ok-1' },
        ],
      })
      .mockResolvedValueOnce({
        providerId: 'test-provider',
        cacheable: true,
        warnings: [],
        segments: [{ id: 'seg-2', text: 'ok-2' }],
      });

    await expect(
      pipeline.translate({
        bypassCache: true,
        segments: [
          { id: 'seg-0', text: 'text-0' },
          { id: 'seg-1', text: 'text-1' },
          { id: 'seg-2', text: 'text-2' },
          { id: 'seg-3', text: 'text-3' },
        ],
        sourceLanguage: 'en',
        targetLanguage: 'zh-Hant',
      }),
    ).rejects.toThrow('翻譯服務未回傳完整譯文');

    expect(mocks.cacheSet).not.toHaveBeenCalled();
  });
});

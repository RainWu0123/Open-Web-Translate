import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({
  value: {
    activeProviderId: 'google-provider',
    defaultTranslationMode: 'fast',
    remoteProviderDisclosureVersion: 0,
  } as any,
}));

vi.mock('@/infrastructure/storage/extension-storage/settings-storage', () => ({
  SettingsStorage: {
    getInternal: vi.fn(async () => settings.value),
    watch: vi.fn(),
  },
}));

vi.mock('@/infrastructure/providers', () => ({
  getProvider: vi.fn((id: string) => ({
    id,
    isLocal: id === 'ollama-provider',
    capabilities: { maxSegments: 10 },
    translate: vi.fn(async (request: any) => ({
      cacheable: true,
      segments: request.segments.map((segment: any) => ({ id: segment.id, text: 'ok' })),
    })),
  })),
}));

vi.mock('@/infrastructure/providers/cache-identity', () => ({
  getProviderCacheIdentity: vi.fn((providerId: string) => ({
    providerId,
    fingerprint: 'test',
  })),
}));

vi.mock('@/infrastructure/storage/repositories/cache-repository', () => ({
  CacheRepository: vi.fn().mockImplementation(() => ({
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
  })),
  sha256: vi.fn(async () => 'hash'),
}));

import { TranslationPipeline } from '@/core/pipeline/translation-pipeline';

describe('first-run remote provider disclosure', () => {
  beforeEach(() => {
    settings.value = {
      activeProviderId: 'google-provider',
      defaultTranslationMode: 'fast',
      remoteProviderDisclosureVersion: 0,
    };
  });

  it('blocks a remote provider before the first-run notice is acknowledged', async () => {
    const pipeline = new TranslationPipeline();

    await expect(pipeline.translate({
      segments: [{ id: 's1', text: 'Hello' }],
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hant',
    })).rejects.toThrow('資料傳輸說明');
  });

  it('allows a local provider before acknowledgement', async () => {
    settings.value.activeProviderId = 'ollama-provider';
    const pipeline = new TranslationPipeline();

    await expect(pipeline.translate({
      segments: [{ id: 's1', text: 'Hello' }],
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hant',
    })).resolves.toMatchObject({
      segments: [{ id: 's1', translatedText: 'ok' }],
    });
  });

  it('allows the selected remote provider after acknowledgement', async () => {
    settings.value.remoteProviderDisclosureVersion = 1;
    const pipeline = new TranslationPipeline();

    await expect(pipeline.translate({
      segments: [{ id: 's1', text: 'Hello' }],
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hant',
    })).resolves.toMatchObject({
      segments: [{ id: 's1', translatedText: 'ok' }],
    });
  });
});

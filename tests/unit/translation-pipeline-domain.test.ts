import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationPipeline } from '@/core/pipeline/translation-pipeline';

vi.mock('@/infrastructure/storage/extension-storage/settings-storage', () => ({
  SettingsStorage: {
    getSettings: vi.fn().mockResolvedValue({
      activeProviderId: 'mock-provider',
      defaultTranslationMode: 'fast',
    }),
  },
}));

vi.mock('@/infrastructure/providers', () => {
  const MockProv = vi.fn().mockImplementation(() => ({
    isLocal: false,
    translate: vi.fn().mockResolvedValue({
      cacheable: true,
      segments: [{ id: 'seg-1', text: '[Mock] Hello' }],
    }),
  }));
  return {
    MockProvider: MockProv,
    GoogleTranslateProvider: MockProv,
    getProvider: () => new MockProv(),
  };
});

describe('TranslationPipeline Domain Interface Unit Tests', () => {
  let pipeline: TranslationPipeline;

  beforeEach(() => {
    vi.clearAllMocks();
    pipeline = new TranslationPipeline();
  });

  it('accepts generic TranslationPipelineRequest domain model and returns TranslationPipelineResponse', async () => {
    const response = await pipeline.translate({
      segments: [{ id: 'seg-1', text: 'Hello' }],
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hant',
    });

    expect(response.segments).toHaveLength(1);
    expect(response.segments[0].id).toBe('seg-1');
    expect(response.segments[0].translatedText).toBe('[Mock] Hello');
  });
});

import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/infrastructure/storage/extension-storage/settings-storage', () => ({
  SettingsStorage: {
    watch: vi.fn(),
    getInternal: vi.fn().mockResolvedValue({
      activeProviderId: 'google-provider',
      defaultTranslationMode: 'fast',
    }),
  },
}));

import { TranslationPipeline } from '@/core/pipeline/translation-pipeline';

describe('TranslationPipeline: fallback results are never cached', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not pin untranslated text in the cache after a transient outage', async () => {
    const pipeline = new TranslationPipeline();
    const req = {
      segments: [{ id: 's1', text: 'Hello world' }],
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hant',
    };

    // A network failure must reject, never show the original text as a translation.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(pipeline.translate(req)).rejects.toThrow();

    // 2) Network recovered -> the real translation must be fetched, not the echoed source
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([[['你好，世界', 'Hello world']]]), { status: 200 }),
      ),
    );
    const recovered = await pipeline.translate(req);
    expect(recovered.error).toBeUndefined();
    expect(recovered.segments[0].translatedText).toBe('你好，世界');
  }, 20000);
});

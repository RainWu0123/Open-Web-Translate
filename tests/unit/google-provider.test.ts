import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleTranslateProvider } from '../../src/infrastructure/providers/google-provider';

describe('GoogleTranslateProvider Unit Tests', () => {
  let provider: GoogleTranslateProvider;

  beforeEach(() => {
    provider = new GoogleTranslateProvider();
    vi.restoreAllMocks();
  });

  it('validates config without requiring API key', () => {
    expect(provider.validateConfig({}).isValid).toBe(true);
  });

  it('translates successfully via mocked Google Translate free endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [[['你好', 'Hello', null, null, 1]]],
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await provider.translate({
      segments: [{ id: 'seg1' as any, text: 'Hello' }],
      sourceLanguage: 'en' as any,
      targetLanguage: 'zh-Hant' as any,
    });

    expect(result.providerId).toBe('google-provider');
    expect(result.segments[0].text).toBe('你好');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('translate.googleapis.com/translate_a/single'),
      expect.anything(),
    );
  });
});

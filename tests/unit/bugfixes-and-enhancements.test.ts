import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalHttpProvider } from '@/infrastructure/providers/local-http-provider';
import { ChromeBuiltInAIProvider } from '@/infrastructure/providers/chrome-builtin-ai-provider';
import { ModelRegistry } from '@/infrastructure/providers/model-registry';
import { GoogleTranslateProvider } from '@/infrastructure/providers/google-provider';
import { setupSelectionTranslate, hideSelectionPill, showSelectionPill, isInsideOwnUi } from '@/features/selection-translation';
import type { SegmentId, LanguageCode } from '@/core/contracts/common';

describe('Bugfixes & Enhancements Unit Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    hideSelectionPill();
  });

  describe('LocalHttpProvider Multi-Segment Translation', () => {
    it('correctly maps multi-segment translations using [idx] format', async () => {
      const provider = new LocalHttpProvider({ endpoint: 'http://127.0.0.1:8080' });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '[0] 第一段翻譯\n[1] 第二段翻譯',
              },
            },
          ],
        }),
      }));

      const result = await provider.translate({
        segments: [
          { id: 'seg-1' as SegmentId, text: 'First paragraph' },
          { id: 'seg-2' as SegmentId, text: 'Second paragraph' },
        ],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-Hant' as LanguageCode,
        mode: 'fast',
      });

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].text).toBe('第一段翻譯');
      expect(result.segments[1].text).toBe('第二段翻譯');
    });

    it('repairs an unindexed multi-segment response once without guessing locally', async () => {
      const provider = new LocalHttpProvider({ endpoint: 'http://127.0.0.1:8080' });
      const fetchSpy = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '段落甲\n段落乙' } }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '[0] 段落甲\n[1] 段落乙' } }] }) });
      vi.stubGlobal('fetch', fetchSpy);

      const result = await provider.translate({
        segments: [
          { id: 'seg-1' as SegmentId, text: 'First paragraph' },
          { id: 'seg-2' as SegmentId, text: 'Second paragraph' },
        ],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-Hant' as LanguageCode,
        mode: 'fast',
      });

      expect(result.segments.map((segment) => segment.text)).toEqual(['段落甲', '段落乙']);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('rejects an empty response instead of echoing the source text', async () => {
      const provider = new LocalHttpProvider({ endpoint: 'http://127.0.0.1:8080' });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '' } }] }),
      }));

      await expect(provider.translate({
        segments: [{ id: 'seg-1' as SegmentId, text: 'Source text' }],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-Hant' as LanguageCode,
        mode: 'fast',
      })).rejects.toThrow('empty translation');
    });
  });

  describe('ChromeBuiltInAIProvider Prompt API support', () => {
    it('uses Chrome Gemini Nano through the document Prompt API', async () => {
      const provider = new ChromeBuiltInAIProvider();
      const previousLanguageModel = (globalThis as any).LanguageModel;
      (globalThis as any).LanguageModel = {
        availability: vi.fn().mockResolvedValue('available'),
        create: vi.fn().mockResolvedValue({
          prompt: vi.fn().mockResolvedValue(JSON.stringify([
            { id: 'seg-official', translatedText: '[Gemini Nano] Hello official API' },
          ])),
          destroy: vi.fn(),
        }),
      };

      try {
        expect(provider.validateConfig().isValid).toBe(true);
        const result = await provider.translate({
          segments: [{ id: 'seg-official' as SegmentId, text: 'Hello official API' }],
          sourceLanguage: 'auto' as LanguageCode,
          targetLanguage: 'zh-Hant' as LanguageCode,
          mode: 'fast',
        });
        expect(result.segments[0].text).toBe('[Gemini Nano] Hello official API');
      } finally {
        if (previousLanguageModel === undefined) delete (globalThis as any).LanguageModel;
        else (globalThis as any).LanguageModel = previousLanguageModel;
      }
    });

    it('supports the earlier ai.languageModel Prompt API namespace', async () => {
      const provider = new ChromeBuiltInAIProvider();
      (globalThis as any).ai = {
        languageModel: {
          availability: vi.fn().mockResolvedValue('available'),
          create: vi.fn().mockResolvedValue({
            prompt: vi.fn().mockResolvedValue(JSON.stringify([
              { id: 'seg-1', translatedText: '[Gemini Nano] Hello from document' },
            ])),
          }),
        },
      };

      const validation = provider.validateConfig();
      expect(validation.isValid).toBe(true);

      const result = await provider.translate({
        segments: [{ id: 'seg-1' as SegmentId, text: 'Hello from document' }],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-Hant' as LanguageCode,
        mode: 'fast',
      });

      expect(result.segments[0].text).toBe('[Gemini Nano] Hello from document');

      delete (globalThis as any).ai;
    });

    it.each([
      [[{ id: 'other', translatedText: '錯誤 ID' }], 'unknown translation id'],
      [[{ id: 'seg-1', translatedText: '   ' }], 'empty translation'],
      [[{ id: 'seg-1', translatedText: '甲' }, { id: 'seg-1', translatedText: '乙' }], 'duplicate translation id'],
    ])('rejects malformed Prompt API segment mappings', async (payload, expectedError) => {
      (globalThis as any).LanguageModel = {
        availability: vi.fn().mockResolvedValue('available'),
        create: vi.fn().mockResolvedValue({ prompt: vi.fn().mockResolvedValue(JSON.stringify(payload)) }),
      };
      const provider = new ChromeBuiltInAIProvider();
      await expect(provider.translate({
        segments: [{ id: 'seg-1' as SegmentId, text: 'Hello' }],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-Hant' as LanguageCode,
        mode: 'fast',
      })).rejects.toThrow(expectedError);
      delete (globalThis as any).LanguageModel;
    });

    it('accepts complete Prompt API output even when the model reorders segments', async () => {
      (globalThis as any).LanguageModel = {
        availability: vi.fn().mockResolvedValue('available'),
        create: vi.fn().mockResolvedValue({
          prompt: vi.fn().mockResolvedValue(JSON.stringify([
            { id: 'seg-2', translatedText: '二' },
            { id: 'seg-1', translatedText: '一' },
          ])),
        }),
      };
      const provider = new ChromeBuiltInAIProvider();
      const result = await provider.translate({
        segments: [
          { id: 'seg-1' as SegmentId, text: 'One' },
          { id: 'seg-2' as SegmentId, text: 'Two' },
        ],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-Hant' as LanguageCode,
        mode: 'fast',
      });
      expect(result.segments.map((segment) => segment.text)).toEqual(['一', '二']);
      delete (globalThis as any).LanguageModel;
    });
  });

  describe('ModelRegistry Provider ID Resolution', () => {
    it('resolves chrome-ai-provider to chrome-builtin-ai-provider and instantiates correctly', () => {
      const resolved = ModelRegistry.resolveProviderId('chrome-ai-provider');
      expect(resolved).toBe('chrome-builtin-ai-provider');

      const provider = ModelRegistry.createProvider('chrome-ai-provider');
      expect(provider.id).toBe('chrome-builtin-ai-provider');
      expect(provider.isLocal).toBe(true);
    });
  });

  describe('GoogleTranslateProvider Concurrency Limiter', () => {
    it('translates all segments in batches without exceeding concurrency', async () => {
      const provider = new GoogleTranslateProvider();

      let activeConcurrentRequests = 0;
      let maxObservedConcurrency = 0;

      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
        activeConcurrentRequests++;
        maxObservedConcurrency = Math.max(maxObservedConcurrency, activeConcurrentRequests);
        await new Promise((r) => setTimeout(r, 10));
        activeConcurrentRequests--;

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify([[['已翻譯', 'Item', null, null, 1]]]),
        };
      }));

      const segments = Array.from({ length: 7 }, (_, i) => ({
        id: `seg-${i}` as SegmentId,
        text: `Item ${i}`,
      }));

      const result = await provider.translate({
        segments,
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-Hant' as LanguageCode,
        mode: 'fast',
      });

      expect(result.segments).toHaveLength(7);
      expect(maxObservedConcurrency).toBeLessThanOrEqual(3);
    });
  });

  describe('Selection Translation Pill Module', () => {
    it('creates and hides selection pill properly', () => {
      const dummyRect = {
        left: 100,
        top: 200,
        right: 150,
        bottom: 220,
        width: 50,
        height: 20,
        x: 100,
        y: 200,
        toJSON: () => {},
      } as DOMRect;

      const onTranslate = vi.fn();
      showSelectionPill(dummyRect, onTranslate);

      const pill = document.getElementById('owt-selection-pill');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toBeTruthy();

      hideSelectionPill();
      expect(document.getElementById('owt-selection-pill')).toBeNull();
    });

    it('identifies own UI correctly', () => {
      const ownDiv = document.createElement('div');
      ownDiv.id = 'owt-floating-badge-host';
      document.body.appendChild(ownDiv);

      const childSpan = document.createElement('span');
      ownDiv.appendChild(childSpan);

      expect(isInsideOwnUi(childSpan)).toBe(true);

      const foreignDiv = document.createElement('div');
      foreignDiv.id = 'article-content';
      document.body.appendChild(foreignDiv);
      expect(isInsideOwnUi(foreignDiv)).toBe(false);

      ownDiv.remove();
      foreignDiv.remove();
    });
  });
});

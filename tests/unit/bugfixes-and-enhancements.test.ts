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

    it('falls back gracefully to line-by-line or output text when unindexed', async () => {
      const provider = new LocalHttpProvider({ endpoint: 'http://127.0.0.1:8080' });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '段落甲\n段落乙',
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
      expect(result.segments[0].text).toBe('段落甲');
      expect(result.segments[1].text).toBe('段落乙');
    });
  });

  describe('ChromeBuiltInAIProvider Service Worker & globalThis Support', () => {
    it('detects AI API from globalThis when window is not available', async () => {
      const provider = new ChromeBuiltInAIProvider();

      const originalWindowAi = (window as any).ai;
      delete (window as any).ai;

      (globalThis as any).ai = {
        translator: {
          create: vi.fn().mockResolvedValue({
            translate: vi.fn().mockImplementation(async (text: string) => `[SW Chrome AI] ${text}`),
          }),
        },
      };

      const validation = provider.validateConfig();
      expect(validation.isValid).toBe(true);

      const result = await provider.translate({
        segments: [{ id: 'seg-1' as SegmentId, text: 'Hello from Service Worker' }],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-Hant' as LanguageCode,
        mode: 'fast',
      });

      expect(result.segments[0].text).toBe('[SW Chrome AI] Hello from Service Worker');

      delete (globalThis as any).ai;
      if (originalWindowAi) {
        (window as any).ai = originalWindowAi;
      }
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
      expect(pill?.textContent).toBe('譯');

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

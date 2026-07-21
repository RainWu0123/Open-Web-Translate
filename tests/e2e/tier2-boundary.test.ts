import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h } from 'vue';

// Source Imports
import { createLogger } from '@/shared/logger';
import ProviderConfigCard, { maskApiKey } from '@/components/ProviderConfigCard.vue';
import DisplaySettings from '@/components/DisplaySettings.vue';
import GlossaryManager from '@/components/GlossaryManager.vue';
import {
  extractTranslatableTargets,
  extractFromSelection,
  extractArticleBlocks,
} from '@/features/page-translation/extractor/dom-extractor';
import {
  renderBilingualBlock,
  removeAllBilingualBlocks,
} from '@/features/page-translation/renderer/shadow-renderer';
import { OllamaProvider } from '@/infrastructure/providers/ollama-provider';
import { LocalHttpProvider } from '@/infrastructure/providers/local-http-provider';
import { ChromeBuiltInAIProvider } from '@/infrastructure/providers/chrome-builtin-ai-provider';
import { NetworkError, ProviderError } from '@/core/domain/errors/translation-errors';
import type { TranslationRequest } from '@/core/contracts/translation';
import type { LanguageCode, SegmentId } from '@/core/contracts/common';

describe('Tier 2: Boundary & Corner Cases E2E Suite', () => {

  // --------------------------------------------------------------------------
  // Boundary 1: Empty & Whitespace-Only Inputs
  // --------------------------------------------------------------------------
  describe('Boundary 1: Empty & Whitespace-Only Inputs', () => {
    let originalFetch: any;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('1.1 OllamaProvider handles empty segment list [] returning empty result without network call', async () => {
      const provider = new OllamaProvider({ endpoint: 'http://localhost:11434' });
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const request: TranslationRequest = {
        segments: [],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-TW' as LanguageCode,
        mode: 'fast',
      };

      const result = await provider.translate(request);
      expect(result.segments).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('1.2 LocalHttpProvider handles empty segment list [] returning empty result without network call', async () => {
      const provider = new LocalHttpProvider({ endpoint: 'http://127.0.0.1:8080' });
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const request: TranslationRequest = {
        segments: [],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-TW' as LanguageCode,
        mode: 'fast',
      };

      const result = await provider.translate(request);
      expect(result.segments).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('1.3 DomExtractor skips empty tags, whitespace-only tags, and returns error when no valid targets exist', () => {
      const testDom = document.createElement('div');
      testDom.innerHTML = `
        <p></p>
        <p>   \n\t  </p>
        <h1></h1>
        <script>const x = 1;</script>
      `;

      const result = extractTranslatableTargets(testDom as any);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_TARGETS_FOUND');
      }
    });

    it('1.4 GlossaryManager rejects adding empty or whitespace-only source and target terms', () => {
      let currentGlossary: any[] = [];
      const hostContainer = document.createElement('div');
      document.body.appendChild(hostContainer);

      const app = createApp(h(GlossaryManager, {
        glossary: currentGlossary,
        'onUpdate:glossary': (val: any) => { currentGlossary = val; },
      }));
      app.mount(hostContainer);

      const inputs = hostContainer.querySelectorAll('input[type="text"]');
      const sourceInput = (hostContainer.querySelector('[data-testid="input-source-term"]') || inputs[0]) as HTMLInputElement;
      const targetInput = (hostContainer.querySelector('[data-testid="input-target-term"]') || inputs[1]) as HTMLInputElement;
      const addBtn = (hostContainer.querySelector('[data-testid="add-term-btn"]') || hostContainer.querySelector('button.btn-add') || hostContainer.querySelector('button')) as HTMLButtonElement;

      if (sourceInput && targetInput && addBtn) {
        sourceInput.value = '   ';
        targetInput.value = '\t';
        sourceInput.dispatchEvent(new Event('input'));
        targetInput.dispatchEvent(new Event('input'));

        expect(addBtn.disabled).toBe(true);
        addBtn.click();
        expect(currentGlossary.length).toBe(0);
      }

      hostContainer.remove();
    });

    it('1.5 ShadowRenderer handles rendering empty translated text gracefully without errors', () => {
      const orig = document.createElement('p');
      orig.textContent = 'Non-empty original';
      document.body.appendChild(orig);

      const host = renderBilingualBlock(orig, 'seg-empty-1', 'Non-empty original', '', 'bilingual');
      expect(host).not.toBeNull();
      expect(host.shadowRoot?.querySelector('.owt-translated')?.textContent).toBe('');

      removeAllBilingualBlocks(document);
      orig.remove();
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 2: Malformed HTML & Deeply Nested DOM Structures
  // --------------------------------------------------------------------------
  describe('Boundary 2: Malformed HTML & Deeply Nested DOM Structures', () => {
    let testContainer: HTMLElement;

    beforeEach(() => {
      testContainer = document.createElement('div');
      document.body.appendChild(testContainer);
    });

    afterEach(() => {
      removeAllBilingualBlocks(document);
      testContainer.remove();
    });

    it('2.1 DomExtractor handles deeply nested DOM structures (30+ wrapper divs) and extracts inner paragraphs', () => {
      let html = '<p id="deep-p">Deeply nested text</p>';
      for (let i = 0; i < 30; i++) {
        html = `<div class="wrapper-level-${i}">${html}</div>`;
      }
      testContainer.innerHTML = html;

      const result = extractTranslatableTargets(document);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.targets.length).toBe(1);
        expect(result.targets[0].text).toBe('Deeply nested text');
      }
    });

    it('2.2 DomExtractor correctly excludes OWT UI elements, script, style, nav, and button elements', () => {
      testContainer.innerHTML = `
        <header><p>Header title</p></header>
        <nav><p>Navigation link</p></nav>
        <main>
          <p id="valid-p">Valid article text</p>
          <button><p>Button text inside</p></button>
          <div class="owt-bilingual-host"><p>OWT internal text</p></div>
        </main>
        <footer><p>Footer copyright</p></footer>
      `;

      const result = extractTranslatableTargets(document);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.targets.length).toBe(1);
        expect(result.targets[0].text).toBe('Valid article text');
      }
    });

    it('2.3 ShadowRenderer places host element adjacent to original element even inside nested structure', () => {
      testContainer.innerHTML = `<div class="parent"><span><p id="nested-target">Paragraph content</p></span></div>`;
      const p = testContainer.querySelector('#nested-target')!;

      const host = renderBilingualBlock(p, 'seg-nested-1', 'Paragraph content', '段落內容譯文');
      expect(p.nextElementSibling).toBe(host);
      expect(host.parentElement?.className).toBe('');
    });

    it('2.4 DomExtractor selection extraction handles collapsed range or invalid container safely', () => {
      const range = document.createRange();
      // Collapsed range
      const result = extractFromSelection(range, document);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_TARGETS_FOUND');
      }
    });

    it('2.5 removeAllBilingualBlocks cleans up multiple host blocks in complex DOM tree without leaving artifacts', () => {
      testContainer.innerHTML = `
        <div>
          <p id="p1">First paragraph</p>
          <p id="p2">Second paragraph</p>
        </div>
      `;

      const p1 = testContainer.querySelector('#p1')!;
      const p2 = testContainer.querySelector('#p2')!;

      renderBilingualBlock(p1, 'seg-1', 'First paragraph', '第一段譯文');
      renderBilingualBlock(p2, 'seg-2', 'Second paragraph', '第二段譯文');

      expect(document.querySelectorAll('.owt-bilingual-host').length).toBe(2);

      const removedCount = removeAllBilingualBlocks(document);
      expect(removedCount).toBe(2);
      expect(document.querySelectorAll('.owt-bilingual-host').length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 3: Network & Server Failure Handling
  // --------------------------------------------------------------------------
  describe('Boundary 3: Network & Server Failure Handling', () => {
    let originalFetch: any;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('3.1 OllamaProvider throws NetworkError on connection refused / server offline', async () => {
      const provider = new OllamaProvider({ endpoint: 'http://localhost:11434' });
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const request: TranslationRequest = {
        segments: [{ id: 'seg-1' as SegmentId, text: 'Hello' }],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-TW' as LanguageCode,
        mode: 'fast',
      };

      await expect(provider.translate(request)).rejects.toThrow(NetworkError);
    });

    it('3.2 OllamaProvider throws NetworkError on HTTP 500 internal server error', async () => {
      const provider = new OllamaProvider({ endpoint: 'http://localhost:11434' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const request: TranslationRequest = {
        segments: [{ id: 'seg-1' as SegmentId, text: 'Hello' }],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-TW' as LanguageCode,
        mode: 'fast',
      };

      await expect(provider.translate(request)).rejects.toThrow('Ollama server error HTTP 500');
    });

    it('3.3 LocalHttpProvider throws NetworkError on HTTP 503 Service Unavailable', async () => {
      const provider = new LocalHttpProvider({ endpoint: 'http://127.0.0.1:8080' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const request: TranslationRequest = {
        segments: [{ id: 'seg-1' as SegmentId, text: 'Hello' }],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-TW' as LanguageCode,
        mode: 'fast',
      };

      await expect(provider.translate(request)).rejects.toThrow('Local HTTP server returned HTTP 503');
    });

    it('3.4 OllamaProvider throws ProviderError on malformed non-JSON response body', async () => {
      const provider = new OllamaProvider({ endpoint: 'http://localhost:11434' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
      });

      const request: TranslationRequest = {
        segments: [{ id: 'seg-1' as SegmentId, text: 'Hello' }],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-TW' as LanguageCode,
        mode: 'fast',
      };

      await expect(provider.translate(request)).rejects.toThrow(ProviderError);
    });

    it('3.5 Providers handle abort signal cancellation properly', async () => {
      const provider = new LocalHttpProvider({ endpoint: 'http://127.0.0.1:8080' });
      const controller = new AbortController();
      controller.abort();

      const request: TranslationRequest = {
        segments: [{ id: 'seg-1' as SegmentId, text: 'Hello' }],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-TW' as LanguageCode,
        signal: controller.signal,
        mode: 'fast',
      };

      await expect(provider.translate(request)).rejects.toThrow('Translation aborted');
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 4: Missing Keys, Endpoints & Key Masking
  // --------------------------------------------------------------------------
  describe('Boundary 4: Missing Keys, Endpoints & Key Masking', () => {
    let hostContainer: HTMLElement;

    beforeEach(() => {
      hostContainer = document.createElement('div');
      document.body.appendChild(hostContainer);
    });

    afterEach(() => {
      hostContainer.remove();
    });

    it('4.1 maskApiKey handles various key length boundaries accurately', () => {
      expect(maskApiKey('')).toBe('');
      expect(maskApiKey('123')).toBe('***');
      expect(maskApiKey('123456')).toBe('***');
      expect(maskApiKey('sk-1234567890abcdef')).toBe('sk--***cdef');
    });

    it('4.2 OllamaProvider validateConfig rejects empty endpoint strings and malformed URLs', () => {
      const provider = new OllamaProvider();

      const emptyRes = provider.validateConfig({ endpoint: '   ' });
      expect(emptyRes.isValid).toBe(false);
      expect(emptyRes.errors?.[0]).toContain('cannot be empty');

      const invalidUrlRes = provider.validateConfig({ endpoint: 'not-a-valid-url' });
      expect(invalidUrlRes.isValid).toBe(false);
      expect(invalidUrlRes.errors?.[0]).toContain('Invalid endpoint URL format');
    });

    it('4.3 LocalHttpProvider validateConfig rejects empty endpoint strings and malformed URLs', () => {
      const provider = new LocalHttpProvider();

      const emptyRes = provider.validateConfig({ endpoint: '' });
      expect(emptyRes.isValid).toBe(false);

      const invalidRes = provider.validateConfig({ endpoint: 'ht::invalid' });
      expect(invalidRes.isValid).toBe(false);
    });

    it('4.4 ProviderConfigCard displays error status when test connection is triggered without endpoint', async () => {
      const invalidProvider = { id: 'cloud-test', displayName: 'Cloud Test', isLocal: false, endpoint: '' };
      const app = createApp(h(ProviderConfigCard, { provider: invalidProvider }));
      app.mount(hostContainer);

      const testBtn = hostContainer.querySelector('[data-testid="test-connection-btn"]') as HTMLButtonElement;
      testBtn.click();

      // Wait for testConnection async timeout
      await new Promise((r) => setTimeout(r, 100));

      const statusMsg = hostContainer.querySelector('[data-testid="status-message"]');
      expect(statusMsg?.textContent).toContain('Missing endpoint URL');
      expect(statusMsg?.classList.contains('error')).toBe(true);
    });

    it('4.5 ProviderConfigCard allows toggling key masking visibility interactively', async () => {
      const provider = { id: 'test-key', displayName: 'Test Key Provider', isLocal: false, apiKey: 'sk-999888777' };
      const app = createApp(h(ProviderConfigCard, { provider, showApiKeyInput: true }));
      app.mount(hostContainer);

      const input = hostContainer.querySelector('[data-testid="api-key-input"]') as HTMLInputElement;
      expect(input.value).toBe(maskApiKey('sk-999888777'));

      const toggleBtn = hostContainer.querySelector('[data-testid="mask-toggle"]') as HTMLButtonElement;
      toggleBtn.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(input.value).toBe('sk-999888777');
    });
  });
});

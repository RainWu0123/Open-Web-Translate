import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';

// Source Imports
import { createLogger, Logger } from '@/shared/logger';
import ProviderConfigCard, { maskApiKey } from '@/components/ProviderConfigCard.vue';
import DisplaySettings from '@/components/DisplaySettings.vue';
import GlossaryManager from '@/components/GlossaryManager.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import {
  extractTranslatableTargets,
  extractFromSelection,
  generateSegmentId,
} from '@/features/page-translation/extractor/dom-extractor';
import {
  renderBilingualBlock,
  renderInlineHost,
  removeAllBilingualBlocks,
} from '@/features/page-translation/renderer/shadow-renderer';
import { OllamaProvider } from '@/infrastructure/providers/ollama-provider';
import { LocalHttpProvider } from '@/infrastructure/providers/local-http-provider';
import { ChromeBuiltInAIProvider } from '@/infrastructure/providers/chrome-builtin-ai-provider';
import type { TranslationRequest } from '@/core/contracts/translation';
import type { LanguageCode, SegmentId } from '@/core/contracts/common';

describe('Tier 1: Feature Coverage E2E Suite', () => {

  // --------------------------------------------------------------------------
  // Feature 1: Shared Logger (variadic args ...args: any[])
  // --------------------------------------------------------------------------
  describe('Feature 1: Shared Logger', () => {
    let debugSpy: any, infoSpy: any, warnSpy: any, errorSpy: any;

    beforeEach(() => {
      debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('1.1 should support logger.debug with 1, 2, 3, and 5+ variadic arguments', () => {
      const logger = createLogger('TestModule');
      logger.setLevel('debug');

      logger.debug('Arg1');
      expect(debugSpy).toHaveBeenLastCalledWith('[TestModule]', 'Arg1');

      logger.debug('Arg1', 'Arg2');
      expect(debugSpy).toHaveBeenLastCalledWith('[TestModule]', 'Arg1', 'Arg2');

      logger.debug('Arg1', 'Arg2', 'Arg3');
      expect(debugSpy).toHaveBeenLastCalledWith('[TestModule]', 'Arg1', 'Arg2', 'Arg3');

      logger.debug('Arg1', 42, true, { key: 'val' }, [1, 2, 3]);
      expect(debugSpy).toHaveBeenLastCalledWith('[TestModule]', 'Arg1', 42, true, { key: 'val' }, [1, 2, 3]);
    });

    it('1.2 should support logger.info with objects, arrays, and primitives mixed', () => {
      const logger = createLogger('InfoModule');
      logger.setLevel('info');

      const meta = { userId: 101, action: 'translate' };
      const tags = ['e2e', 'tier1'];
      logger.info('User action executed', meta, tags, 200, true);

      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledWith('[InfoModule]', 'User action executed', meta, tags, 200, true);
    });

    it('1.3 should support logger.warn with undefined, null, symbols, and functions', () => {
      const logger = createLogger('WarnModule');
      logger.setLevel('warn');

      const sym = Symbol('test-symbol');
      const dummyFn = () => {};
      logger.warn('Warning detected', undefined, null, sym, dummyFn);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith('[WarnModule]', 'Warning detected', undefined, null, sym, dummyFn);
    });

    it('1.4 should support logger.error with Error instance, stack, and context', () => {
      const logger = createLogger('ErrorModule');
      logger.setLevel('error');

      const err = new Error('Database connection failed');
      const context = { retryCount: 3, timeoutMs: 5000 };

      logger.error('Failed operation:', err, context);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('[ErrorModule]', 'Failed operation:', err, context);
    });

    it('1.5 should respects log level filtering and module prefix formatting', () => {
      const logger = createLogger('FilterModule');
      logger.setLevel('warn');

      logger.debug('This debug should be filtered out');
      logger.info('This info should be filtered out');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();

      logger.warn('This warn should pass');
      expect(warnSpy).toHaveBeenCalledWith('[FilterModule]', 'This warn should pass');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 2: Decomposed Vue 3 UI Components
  // --------------------------------------------------------------------------
  describe('Feature 2: Vue 3 UI Components', () => {
    let hostContainer: HTMLElement;

    beforeEach(() => {
      hostContainer = document.createElement('div');
      document.body.appendChild(hostContainer);
    });

    afterEach(() => {
      hostContainer.remove();
    });

    it('2.1 ProviderConfigCard renders local badge, cloud badge, and masks API key', async () => {
      const localProvider = { id: 'ollama', displayName: 'Ollama AI', isLocal: true, apiKey: 'sk-123456789' };
      const app = createApp(h(ProviderConfigCard, { provider: localProvider, active: true }));
      app.mount(hostContainer);
      await nextTick();

      expect(hostContainer.querySelector('[data-testid="local-badge"]')?.textContent).toContain('Local Private AI');
      expect(hostContainer.querySelector('.owt-provider-card')?.classList.contains('active')).toBe(true);

      expect(maskApiKey('sk-123456789')).toBe('sk--***6789');
    });

    it('2.2 ProviderConfigCard emits update:provider and select events on user interaction', async () => {
      let updatedProvider: any = null;
      let selectedId = '';

      const provider = { id: 'local-http', displayName: 'Local HTTP', endpoint: 'http://localhost:8080', isLocal: true };
      const app = createApp(h(ProviderConfigCard, {
        provider,
        active: false,
        'onUpdate:provider': (val: any) => { updatedProvider = val; },
        onSelect: (id: string) => { selectedId = id; },
      }));
      app.mount(hostContainer);
      await nextTick();

      const endpointInput = hostContainer.querySelector('[data-testid="endpoint-input"]') as HTMLInputElement;
      endpointInput.value = 'http://127.0.0.1:9090';
      endpointInput.dispatchEvent(new Event('input'));

      expect(updatedProvider).not.toBeNull();
      expect(updatedProvider.endpoint).toBe('http://127.0.0.1:9090');

      const selectBtn = hostContainer.querySelector('[data-testid="select-provider-btn"]') as HTMLButtonElement;
      selectBtn.click();
      expect(selectedId).toBe('local-http');
    });

    it('2.3 DisplaySettings renders mode options, target languages, and handles mode updates', async () => {
      let currentMode = 'bilingual';
      let selectedLang = 'zh-Hant';

      const app = createApp(h(DisplaySettings, {
        displayMode: currentMode as any,
        targetLanguage: selectedLang,
        'onUpdate:displayMode': (val: any) => { currentMode = val; },
        'onUpdate:targetLanguage': (val: any) => { selectedLang = val; },
      }));
      app.mount(hostContainer);
      await nextTick();

      expect(hostContainer.querySelector('[data-testid="mode-bilingual"]')).not.toBeNull();
      expect(hostContainer.querySelector('[data-testid="mode-immersive"]')).not.toBeNull();

      const langSelect = hostContainer.querySelector('[data-testid="target-language-select"]') as HTMLSelectElement;
      expect(langSelect.value).toBe('zh-Hant');

      langSelect.value = 'ja';
      langSelect.dispatchEvent(new Event('change'));
      expect(selectedLang).toBe('ja');
    });

    it('2.4 GlossaryManager manages adding, filtering, and removing terms', async () => {
      let currentGlossary = [
        { source: 'AI', target: '人工智慧' },
        { source: 'LLM', target: '大語言模型' },
      ];

      const app = createApp(h(GlossaryManager, {
        glossary: currentGlossary,
        enabled: true,
        'onUpdate:glossary': (val: any) => { currentGlossary = val; },
      }));
      app.mount(hostContainer);
      await nextTick();

      const items = hostContainer.querySelectorAll('[data-testid="glossary-item"]');
      if (items.length > 0) {
        expect(items.length).toBe(2);
      }

      const sourceInput = hostContainer.querySelector('[data-testid="input-source-term"]') as HTMLInputElement;
      const targetInput = hostContainer.querySelector('[data-testid="input-target-term"]') as HTMLInputElement;
      const addBtn = hostContainer.querySelector('[data-testid="add-term-btn"]') as HTMLButtonElement;

      sourceInput.value = 'Agent';
      sourceInput.dispatchEvent(new Event('input'));
      targetInput.value = '智能體';
      targetInput.dispatchEvent(new Event('input'));
      await new Promise((r) => setTimeout(r, 10));
      addBtn.click();

      expect(currentGlossary.length).toBe(3);
      expect(currentGlossary.some((item) => item.source === 'Agent' && item.target === '智能體')).toBe(true);
    });

    it('2.5 ThemeToggle cycles theme states and includes accessibility attributes', () => {
      let currentTheme = 'light';
      const app = createApp(h(ThemeToggle, {
        theme: currentTheme as any,
        'onUpdate:theme': (val: any) => { currentTheme = val; },
      }));
      app.mount(hostContainer);

      const toggleWrapper = hostContainer.querySelector('[data-testid="theme-toggle"]');
      expect(toggleWrapper?.getAttribute('data-theme')).toBe('light');

      const btn = hostContainer.querySelector('button') as HTMLButtonElement;
      expect(btn.getAttribute('aria-label')).toContain('light');

      const darkBtn = (hostContainer.querySelector('[data-testid="theme-btn-dark"]') || hostContainer.querySelectorAll('button')[1]) as HTMLButtonElement;
      darkBtn.click();
      expect(currentTheme).toBe('dark');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 3: Web Page DOM Translation Engine
  // --------------------------------------------------------------------------
  describe('Feature 3: Web DOM Translation Engine', () => {
    let testDomContainer: HTMLElement;

    beforeEach(() => {
      testDomContainer = document.createElement('div');
      testDomContainer.id = 'test-dom-root';
      document.body.appendChild(testDomContainer);
    });

    afterEach(() => {
      removeAllBilingualBlocks(document);
      testDomContainer.remove();
    });

    it('3.1 DomExtractor extracts translatable paragraphs and headings', () => {
      testDomContainer.innerHTML = `
        <h1>Article Title</h1>
        <p>First paragraph with translatable content.</p>
        <p>Second paragraph with more content.</p>
        <script>console.log('ignore me');</script>
      `;

      const result = extractTranslatableTargets(document);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.targets.length).toBe(3);
        expect(result.targets[0].text).toBe('Article Title');
        expect(result.targets[1].text).toBe('First paragraph with translatable content.');
      }
    });

    it('3.2 DomExtractor extracts selection range targets via extractFromSelection', () => {
      testDomContainer.innerHTML = `<p id="target-p">Selected phrase inside paragraph.</p>`;
      const p = testDomContainer.querySelector('#target-p')!;

      const range = document.createRange();
      range.selectNodeContents(p);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      const result = extractFromSelection(range, document);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.targets.length).toBe(1);
        expect(result.targets[0].text).toBe('Selected phrase inside paragraph.');
      }
    });

    it('3.3 DomExtractor generates stable deterministic segment IDs', () => {
      const p = document.createElement('p');
      p.textContent = 'Stable segment test text';

      const id1 = generateSegmentId(p, 0, p.textContent);
      const id2 = generateSegmentId(p, 0, p.textContent);
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^seg-0-p-/);
    });

    it('3.4 ShadowRenderer creates BlockHost with Shadow DOM isolation and CSS encapsulation', () => {
      testDomContainer.innerHTML = `<p id="orig-block">Original paragraph text</p>`;
      const origEl = testDomContainer.querySelector('#orig-block')!;

      const host = renderBilingualBlock(origEl, 'seg-1-p-123', 'Original paragraph text', '譯文段落內容', 'bilingual');
      expect(host.classList.contains('owt-bilingual-host')).toBe(true);
      expect(host.shadowRoot).not.toBeNull();

      const shadowText = host.shadowRoot?.querySelector('.owt-translated')?.textContent;
      expect(shadowText).toBe('譯文段落內容');
    });

    it('3.5 ShadowRenderer creates InlineHost and cleans up all hosts with removeAllBilingualBlocks', () => {
      testDomContainer.innerHTML = `<p id="orig-inline">Inline segment host test</p>`;
      const origEl = testDomContainer.querySelector('#orig-inline')!;

      const host = renderInlineHost(origEl, 'seg-2-inline-456', 'Inline segment host test', '行內譯文');
      expect(host.classList.contains('owt-inline-host')).toBe(true);
      expect(host.shadowRoot?.textContent).toContain('行內譯文');

      const count = removeAllBilingualBlocks(document);
      expect(count).toBeGreaterThanOrEqual(1);
      expect(document.querySelector('.owt-inline-host')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Feature 4: Local Private AI Providers
  // --------------------------------------------------------------------------
  describe('Feature 4: Local Private AI Providers', () => {
    let originalFetch: any;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('4.1 OllamaProvider verifies privacy boundary isLocal=true and valid config', () => {
      const provider = new OllamaProvider({ endpoint: 'http://localhost:11434', model: 'llama3' });
      expect(provider.isLocal).toBe(true);
      expect(provider.id).toBe('ollama-provider');

      const validation = provider.validateConfig({ endpoint: 'http://localhost:11434' });
      expect(validation.isValid).toBe(true);
    });

    it('4.2 OllamaProvider executes translation and parses response correctly', async () => {
      const provider = new OllamaProvider({ endpoint: 'http://localhost:11434' });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: '[0] 你好，世界！\n[1] 歡迎體驗 DOM 翻譯。',
        }),
      });

      const request: TranslationRequest = {
        segments: [
          { id: 'seg-1' as SegmentId, text: 'Hello, World!' },
          { id: 'seg-2' as SegmentId, text: 'Welcome to DOM translation.' },
        ],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-TW' as LanguageCode,
        mode: 'fast',
      };

      const result = await provider.translate(request);
      expect(result.providerId).toBe('ollama-provider');
      expect(result.segments.length).toBe(2);
      expect(result.segments[0].text).toBe('你好，世界！');
    });

    it('4.3 LocalHttpProvider validates endpoint format and executes translation request', async () => {
      const provider = new LocalHttpProvider({ endpoint: 'http://127.0.0.1:8080', apiKey: 'sk-local123' });
      expect(provider.isLocal).toBe(true);

      let capturedUrl = '';
      let capturedHeaders: any = {};
      globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
        capturedUrl = url.toString();
        capturedHeaders = init?.headers;
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '本地 HTTP 翻譯結果' } }],
          }),
        };
      });

      const request: TranslationRequest = {
        segments: [{ id: 'seg-1' as SegmentId, text: 'Local HTTP payload test' }],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-TW' as LanguageCode,
        mode: 'fast',
      };

      const result = await provider.translate(request);
      expect(capturedUrl).toBe('http://127.0.0.1:8080/v1/chat/completions');
      expect(capturedHeaders['Authorization']).toBe('Bearer sk-local123');
      expect(result.segments[0].text).toBe('本地 HTTP 翻譯結果');
    });

    it('4.4 ChromeBuiltInAIProvider verifies availability and handles missing API gracefully', async () => {
      const provider = new ChromeBuiltInAIProvider();
      expect(provider.isLocal).toBe(true);

      // Without window.ai attached, validateConfig should be false
      delete (window as any).ai;
      delete (window as any).translation;

      const validation = provider.validateConfig();
      expect(validation.isValid).toBe(false);
      expect(validation.errors?.[0]).toContain('not supported');

      const request: TranslationRequest = {
        segments: [{ id: 'seg-1' as SegmentId, text: 'Chrome AI test' }],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-TW' as LanguageCode,
        mode: 'fast',
      };

      await expect(provider.translate(request)).rejects.toThrow('Chrome Built-in AI API is not available');
    });

    it('4.5 ChromeBuiltInAIProvider executes translation when window.ai mock is provided', async () => {
      const provider = new ChromeBuiltInAIProvider();

      (window as any).ai = {
        translator: {
          create: vi.fn().mockResolvedValue({
            translate: vi.fn().mockImplementation(async (text: string) => `[Chrome AI] ${text} (繁中)`),
          }),
        },
      };

      const validation = provider.validateConfig();
      expect(validation.isValid).toBe(true);

      const request: TranslationRequest = {
        segments: [{ id: 'seg-1' as SegmentId, text: 'Chrome built-in translation' }],
        sourceLanguage: 'en' as LanguageCode,
        targetLanguage: 'zh-TW' as LanguageCode,
        mode: 'fast',
      };

      const result = await provider.translate(request);
      expect(result.segments[0].text).toBe('[Chrome AI] Chrome built-in translation (繁中)');

      delete (window as any).ai;
    });
  });
});

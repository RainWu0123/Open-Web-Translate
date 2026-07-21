import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h } from 'vue';

// Source Imports
import { createLogger } from '@/shared/logger';
import ProviderConfigCard, { maskApiKey } from '@/components/ProviderConfigCard.vue';
import DisplaySettings from '@/components/DisplaySettings.vue';
import GlossaryManager from '@/components/GlossaryManager.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import {
  extractTranslatableTargets,
  extractArticleBlocks,
} from '@/features/page-translation/extractor/dom-extractor';
import {
  renderBilingualBlock,
  removeAllBilingualBlocks,
} from '@/features/page-translation/renderer/shadow-renderer';
import { OllamaProvider } from '@/infrastructure/providers/ollama-provider';
import { LocalHttpProvider } from '@/infrastructure/providers/local-http-provider';
import { ChromeBuiltInAIProvider } from '@/infrastructure/providers/chrome-builtin-ai-provider';
import { NetworkError } from '@/core/domain/errors/translation-errors';
import type { TranslationRequest } from '@/core/contracts/translation';
import type { LanguageCode, SegmentId } from '@/core/contracts/common';
import type { GlossaryEntry } from '@/core/contracts/glossary';

describe('Tier 4: Real-World Application Scenarios E2E Suite', () => {
  let docRoot: HTMLElement;
  let originalFetch: any;

  beforeEach(() => {
    docRoot = document.createElement('div');
    docRoot.id = 'web-doc-root';
    document.body.appendChild(docRoot);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    removeAllBilingualBlocks(document);
    docRoot.remove();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('Scenario 1: Offline Local AI translation of multi-paragraph web documentation', async () => {
    // Setup realistic multi-paragraph HTML page
    docRoot.innerHTML = `
      <article>
        <h1>Open Web Translate Architecture</h1>
        <p>Open Web Translate provides private, offline-first machine translation capabilities.</p>
        <p>By leveraging local LLMs such as Ollama or Local HTTP servers, sensitive documents never leave the local machine.</p>
        <p>The Shadow DOM renderer ensures non-destructive DOM updates on all web pages.</p>
      </article>
    `;

    // Step 1: Extract translatable targets
    const extractRes = extractArticleBlocks(document);
    expect(extractRes.success).toBe(true);
    if (!extractRes.success) return;
    expect(extractRes.targets.length).toBe(4);

    // Step 2: Configure Ollama Local AI Provider
    const provider = new OllamaProvider({ endpoint: 'http://localhost:11434', model: 'llama3' });
    expect(provider.isLocal).toBe(true);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: `[0] Open Web Translate 架構\n[1] Open Web Translate 提供私密、離線優先的機器翻譯功能。\n[2] 透過利用本地 LLM（如 Ollama 或 Local HTTP 伺服器），敏感文件絕不離開本地機器。\n[3] Shadow DOM 渲染器可確保在所有網頁上進行非破壞性的 DOM 更新。`,
      }),
    });

    const request: TranslationRequest = {
      segments: extractRes.targets.map((t) => ({ id: t.id as SegmentId, text: t.text })),
      sourceLanguage: 'en' as LanguageCode,
      targetLanguage: 'zh-TW' as LanguageCode,
      mode: 'quality',
    };

    // Step 3: Execute translation
    const transResult = await provider.translate(request);
    expect(transResult.providerId).toBe('ollama-provider');
    expect(transResult.segments.length).toBe(4);
    expect(transResult.segments[0].text).toContain('Open Web Translate 架構');

    // Step 4: Render Shadow DOM bilingual blocks onto web page
    extractRes.targets.forEach((target, i) => {
      const host = renderBilingualBlock(target.element, target.id, target.text, transResult.segments[i].text, 'bilingual');
      expect(host.shadowRoot?.querySelector('.owt-translated')?.textContent).toBe(transResult.segments[i].text);
    });

    expect(document.querySelectorAll('.owt-bilingual-host').length).toBe(4);
  });

  it('Scenario 2: Dynamic Provider Fallback & Switching during Web Browsing', async () => {
    docRoot.innerHTML = `<p id="web-para">Browsing news article with dynamic provider fallback.</p>`;
    const targetP = docRoot.querySelector('#web-para')!;

    const extractRes = extractTranslatableTargets(document);
    expect(extractRes.success).toBe(true);
    if (!extractRes.success) return;

    const primaryProvider = new OllamaProvider({ endpoint: 'http://localhost:11434' });
    const fallbackProvider = new LocalHttpProvider({ endpoint: 'http://127.0.0.1:8080' });

    // Primary provider (Ollama) fails with 503 Service Unavailable
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('11434')) {
        return { ok: false, status: 503, statusText: 'Service Unavailable' };
      }
      // Fallback provider (Local HTTP) succeeds
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '動態備援與切換成功' } }] }),
      };
    });

    const request: TranslationRequest = {
      segments: extractRes.targets.map((t) => ({ id: t.id as SegmentId, text: t.text })),
      sourceLanguage: 'en' as LanguageCode,
      targetLanguage: 'zh-TW' as LanguageCode,
      mode: 'fast',
    };

    let finalResult;
    try {
      finalResult = await primaryProvider.translate(request);
    } catch (err) {
      expect(err).toBeInstanceOf(NetworkError);
      // Fallback execution
      finalResult = await fallbackProvider.translate(request);
    }

    expect(finalResult.providerId).toBe('local-http-provider');
    expect(finalResult.segments[0].text).toBe('動態備援與切換成功');

    renderBilingualBlock(targetP, extractRes.targets[0].id, extractRes.targets[0].text, finalResult.segments[0].text);
    expect(document.querySelector('.owt-bilingual-host')?.shadowRoot?.textContent).toContain('動態備援與切換成功');
  });

  it('Scenario 3: Custom Theme & Dynamic Glossary Integration during article translation', async () => {
    docRoot.innerHTML = `
      <div id="app-settings-root"></div>
      <article id="article-content">
        <h1>Zero-Shot Prompting in LLMs</h1>
        <p>Zero-shot learning relies on pre-trained transformers.</p>
      </article>
    `;

    // 1. Manage Glossary & Theme via UI components
    let activeTheme: 'light' | 'dark' | 'auto' = 'dark';
    let activeGlossary: GlossaryEntry[] = [{ source: 'transformers', target: '變形金剛架構', scope: 'global' }];

    const uiHost = docRoot.querySelector('#app-settings-root')!;

    const themeApp = createApp(h(ThemeToggle, {
      theme: activeTheme,
      'onUpdate:theme': (val: any) => { activeTheme = val; },
    }));
    themeApp.mount(uiHost);

    const glossaryApp = createApp(h(GlossaryManager, {
      glossary: activeGlossary,
      'onUpdate:glossary': (val: any) => { activeGlossary = val; },
    }));
    const glossaryContainer = document.createElement('div');
    uiHost.appendChild(glossaryContainer);
    glossaryApp.mount(glossaryContainer);

    expect(activeTheme).toBe('dark');
    expect(activeGlossary[0].target).toBe('變形金剛架構');

    // 2. Translate article with dynamic glossary
    const extractRes = extractArticleBlocks(document);
    expect(extractRes.success).toBe(true);
    if (!extractRes.success) return;

    const provider = new OllamaProvider({ endpoint: 'http://localhost:11434' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: '[0] LLM 中的零樣本提示\n[1] 零樣本學習依賴於預訓練的變形金剛架構。',
      }),
    });

    const transRes = await provider.translate({
      segments: extractRes.targets.map((t) => ({ id: t.id as SegmentId, text: t.text })),
      sourceLanguage: 'en' as LanguageCode,
      targetLanguage: 'zh-TW' as LanguageCode,
      glossary: { id: 'g4', entries: activeGlossary },
      mode: 'quality',
    });

    expect(transRes.segments[1].text).toContain('變形金剛架構');

    // 3. Render Shadow DOM host in immersive mode
    extractRes.targets.forEach((target, i) => {
      renderBilingualBlock(target.element, target.id, target.text, transRes.segments[i].text, 'immersive');
    });

    expect(document.querySelectorAll('.owt-bilingual-host').length).toBe(2);
    expect(docRoot.querySelector('#article-content h1')?.classList.contains('owt-source-hidden')).toBe(true);
  });

  it('Scenario 4: Large Article Block Batch Translation with variadic logger tracing', async () => {
    const logger = createLogger('BatchTranslation');
    logger.setLevel('debug');

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    // Generate large article with 10 paragraph blocks
    let paragraphsHtml = '';
    for (let i = 0; i < 10; i++) {
      paragraphsHtml += `<p class="batch-p-${i}">Batch article paragraph block ${i} describing technical specifications.</p>\n`;
    }
    docRoot.innerHTML = `<article>${paragraphsHtml}</article>`;

    logger.debug('Starting large article batch extraction', { paragraphCount: 10 });

    const extractRes = extractArticleBlocks(document);
    expect(extractRes.success).toBe(true);
    if (!extractRes.success) return;
    expect(extractRes.targets.length).toBe(10);

    logger.debug('Extraction successful', 'Targets:', extractRes.targets.length);

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '批次大文章段落翻譯結果' } }] }),
      };
    });

    const provider = new LocalHttpProvider({ endpoint: 'http://127.0.0.1:8080' });
    const transResult = await provider.translate({
      segments: extractRes.targets.map((t) => ({ id: t.id as SegmentId, text: t.text })),
      sourceLanguage: 'en' as LanguageCode,
      targetLanguage: 'zh-TW' as LanguageCode,
      mode: 'fast',
    });

    logger.debug('Batch translation completed', transResult.providerId, 'Segments count:', transResult.segments.length);

    // Render batch host elements
    extractRes.targets.forEach((target, i) => {
      renderBilingualBlock(target.element, target.id, target.text, transResult.segments[i].text);
    });

    expect(document.querySelectorAll('.owt-bilingual-host').length).toBe(10);
    expect(debugSpy).toHaveBeenCalledTimes(4);
  });

  it('Scenario 5: Privacy-Boundary Local AI configuration & key masking verification', async () => {
    const providerConfig = {
      id: 'ollama-private',
      displayName: 'Ollama Secure AI',
      endpoint: 'http://localhost:11434',
      apiKey: 'sk-private-token-987654321',
      isLocal: true,
    };

    const hostUI = document.createElement('div');
    docRoot.appendChild(hostUI);

    // 1. Render UI Card and verify key masking display
    const app = createApp(h(ProviderConfigCard, { provider: providerConfig, showApiKeyInput: true }));
    app.mount(hostUI);

    const keyInput = hostUI.querySelector('[data-testid="api-key-input"]') as HTMLInputElement;
    expect(keyInput.value).toBe(maskApiKey('sk-private-token-987654321'));
    expect(keyInput.value).toBe('sk--***4321');

    // 2. Instantiate Local Provider and enforce strict privacy boundary isLocal=true
    const provider = new OllamaProvider({ endpoint: providerConfig.endpoint });
    expect(provider.isLocal).toBe(true);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: '[0] 隱私邊界本地 AI 驗證成功',
      }),
    });

    // 3. Perform translation under private local boundary
    const result = await provider.translate({
      segments: [{ id: 'seg-privacy' as SegmentId, text: 'Strict privacy confidential medical text' }],
      sourceLanguage: 'en' as LanguageCode,
      targetLanguage: 'zh-TW' as LanguageCode,
      mode: 'quality',
    });

    expect(result.providerId).toBe('ollama-provider');
    expect(result.segments[0].text).toBe('隱私邊界本地 AI 驗證成功');
  });
});

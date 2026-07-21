import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h } from 'vue';

// Source Imports
import { createLogger } from '@/shared/logger';
import ProviderConfigCard from '@/components/ProviderConfigCard.vue';
import DisplaySettings from '@/components/DisplaySettings.vue';
import GlossaryManager from '@/components/GlossaryManager.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import {
  extractTranslatableTargets,
  extractFromSelection,
  extractArticleBlocks,
} from '@/features/page-translation/extractor/dom-extractor';
import {
  renderBilingualBlock,
  renderInlineHost,
  removeAllBilingualBlocks,
} from '@/features/page-translation/renderer/shadow-renderer';
import { OllamaProvider } from '@/infrastructure/providers/ollama-provider';
import { LocalHttpProvider } from '@/infrastructure/providers/local-http-provider';
import { ChromeBuiltInAIProvider } from '@/infrastructure/providers/chrome-builtin-ai-provider';
import { GoogleTranslateProvider } from '@/infrastructure/providers/google-provider';
import type { TranslationRequest } from '@/core/contracts/translation';
import type { LanguageCode, SegmentId } from '@/core/contracts/common';
import type { TranslationProvider } from '@/core/contracts/provider';
import type { GlossaryEntry } from '@/core/contracts/glossary';

describe('Tier 3: Cross-Feature Combinations E2E Suite', () => {
  let testContainer: HTMLElement;
  let originalFetch: any;

  beforeEach(() => {
    testContainer = document.createElement('div');
    testContainer.id = 'tier3-test-root';
    document.body.appendChild(testContainer);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    removeAllBilingualBlocks(document);
    testContainer.remove();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('3.1 Local AI Provider (OllamaProvider) + Selection Translation (DomExtractor + ShadowRenderer)', async () => {
    // 1. Setup DOM with paragraph
    testContainer.innerHTML = `<p id="selected-text-node">Quantum computing harnesses quantum mechanics to solve complex problems.</p>`;
    const pEl = testContainer.querySelector('#selected-text-node')!;

    // 2. Mock Selection
    const range = document.createRange();
    range.selectNodeContents(pEl);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    // 3. Extract target
    const extractRes = extractFromSelection(range, document);
    expect(extractRes.success).toBe(true);
    if (!extractRes.success) return;

    // 4. Local Ollama Provider translate execution
    const provider = new OllamaProvider({ endpoint: 'http://localhost:11434' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: '[0] 量子計算利用量子力學來解決複雜問題。',
      }),
    });

    const request: TranslationRequest = {
      segments: extractRes.targets.map((t) => ({ id: t.id as SegmentId, text: t.text })),
      sourceLanguage: 'en' as LanguageCode,
      targetLanguage: 'zh-TW' as LanguageCode,
      mode: 'fast',
    };

    const transRes = await provider.translate(request);
    expect(transRes.segments[0].text).toBe('量子計算利用量子力學來解決複雜問題。');

    // 5. Render Inline Host into DOM
    const inlineHost = renderInlineHost(pEl, transRes.segments[0].id, extractRes.targets[0].text, transRes.segments[0].text);
    expect(inlineHost.shadowRoot?.textContent).toContain('量子計算利用量子力學來解決複雜問題。');
  });

  it('3.2 UI Settings + Provider Switching (Ollama -> ChromeBuiltInAI -> GoogleTranslate)', async () => {
    const providers: Record<string, TranslationProvider> = {
      'ollama': new OllamaProvider({ endpoint: 'http://localhost:11434' }),
      'chrome-ai': new ChromeBuiltInAIProvider(),
      'google': new GoogleTranslateProvider(),
    };

    let activeProviderId = 'ollama';

    // Mock Chrome AI on window
    (window as any).ai = {
      translator: {
        create: vi.fn().mockResolvedValue({
          translate: vi.fn().mockImplementation(async (text: string) => `[Chrome AI] ${text}`),
        }),
      },
    };

    // Mock Fetch for Ollama and Google
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('11434')) {
        return { ok: true, json: async () => ({ response: '[0] [Ollama] Artificial Intelligence' }) };
      }
      return { ok: true, json: async () => [[['[Google] Artificial Intelligence']]] };
    });

    const reqSegments = [{ id: 'seg-switch' as SegmentId, text: 'Artificial Intelligence' }];

    // Step A: Translate with Ollama
    let res = await providers[activeProviderId].translate({
      segments: reqSegments, sourceLanguage: 'en' as LanguageCode, targetLanguage: 'zh-TW' as LanguageCode, mode: 'fast',
    });
    expect(res.segments[0].text).toBe('[Ollama] Artificial Intelligence');

    // Step B: Switch to Chrome Built-in AI
    activeProviderId = 'chrome-ai';
    res = await providers[activeProviderId].translate({
      segments: reqSegments, sourceLanguage: 'en' as LanguageCode, targetLanguage: 'zh-TW' as LanguageCode, mode: 'fast',
    });
    expect(res.segments[0].text).toBe('[Chrome AI] Artificial Intelligence');

    // Step C: Switch to Google Translate
    activeProviderId = 'google';
    res = await providers[activeProviderId].translate({
      segments: reqSegments, sourceLanguage: 'en' as LanguageCode, targetLanguage: 'zh-TW' as LanguageCode, mode: 'fast',
    });
    expect(res.segments[0].text).toBe('[Google] Artificial Intelligence');

    delete (window as any).ai;
  });

  it('3.3 Custom Glossary + DOM Article Translation + Shadow DOM Host Rendering', async () => {
    testContainer.innerHTML = `
      <article>
        <h1>Neural Networks Overview</h1>
        <p>Neural networks use backpropagation to optimize weights.</p>
      </article>
    `;

    // 1. Setup Glossary Entries
    const glossaryEntries: GlossaryEntry[] = [
      { source: 'backpropagation', target: '反向傳播演算法', scope: 'global' },
      { source: 'weights', target: '權重', scope: 'global' },
    ];

    // 2. Extract DOM targets
    const extractRes = extractArticleBlocks(document);
    expect(extractRes.success).toBe(true);
    if (!extractRes.success) return;

    // 3. Execute translation with Glossary
    const provider = new OllamaProvider({ endpoint: 'http://localhost:11434' });
    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(body.prompt).toContain('backpropagation -> 反向傳播演算法');

      return {
        ok: true,
        json: async () => ({
          response: '[0] 類神經網絡概述\n[1] 類神經網絡使用反向傳播演算法來優化權重。',
        }),
      };
    });

    const request: TranslationRequest = {
      segments: extractRes.targets.map((t) => ({ id: t.id as SegmentId, text: t.text })),
      sourceLanguage: 'en' as LanguageCode,
      targetLanguage: 'zh-TW' as LanguageCode,
      glossary: { id: 'g3', entries: glossaryEntries },
      mode: 'quality',
    };

    const transRes = await provider.translate(request);
    expect(transRes.segments[1].text).toContain('反向傳播演算法');

    // 4. Render Immersive mode Shadow DOM blocks
    extractRes.targets.forEach((target, i) => {
      renderBilingualBlock(target.element, target.id, target.text, transRes.segments[i].text, 'immersive');
    });

    expect(document.querySelectorAll('.owt-bilingual-host').length).toBe(2);
    expect(extractRes.targets[0].element.classList.contains('owt-source-hidden')).toBe(true);
  });

  it('3.4 Variadic Logger Tracing during DOM Extraction & Provider Translation Pipeline', async () => {
    const logger = createLogger('PipelineTrace');
    logger.setLevel('debug');

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    testContainer.innerHTML = `<p>Tracing execution flow with variadic logger.</p>`;

    // Step 1: Log extraction start
    logger.debug('Starting DOM Extraction', { selector: 'p', root: '#tier3-test-root' });
    const extractRes = extractTranslatableTargets(document);
    expect(extractRes.success).toBe(true);
    if (!extractRes.success) return;

    // Step 2: Log extraction results
    logger.info('Extraction completed successfully', 'Target count:', extractRes.targets.length, extractRes.targets[0].id);

    // Step 3: Log Provider translation call
    logger.debug('Initiating Provider Translation', 'Provider:', 'LocalHttpProvider', 'Segments:', extractRes.targets);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '變態日誌追蹤成功' } }] }),
    });

    const provider = new LocalHttpProvider({ endpoint: 'http://127.0.0.1:8080' });
    const res = await provider.translate({
      segments: extractRes.targets.map((t) => ({ id: t.id as SegmentId, text: t.text })),
      sourceLanguage: 'en' as LanguageCode,
      targetLanguage: 'zh-TW' as LanguageCode,
      mode: 'fast',
    });

    logger.info('Translation Finished:', res.providerId, res.segments);

    expect(debugSpy).toHaveBeenCalledTimes(3);
    expect(infoSpy).toHaveBeenCalledTimes(2);
  });

  it('3.5 ProviderConfigCard settings update -> LocalHttpProvider configuration -> DOM Pipeline', async () => {
    let currentProviderConfig = {
      id: 'local-http-provider',
      displayName: 'Local HTTP AI',
      endpoint: 'http://127.0.0.1:8080',
      apiKey: 'sk-test-key-12345',
      isLocal: true,
    };

    const hostUI = document.createElement('div');
    document.body.appendChild(hostUI);

    const app = createApp(h(ProviderConfigCard, {
      provider: currentProviderConfig,
      showApiKeyInput: true,
      'onUpdate:provider': (updated: any) => { currentProviderConfig = updated; },
    }));
    app.mount(hostUI);

    // Update endpoint via UI event simulation
    const endpointInput = hostUI.querySelector('[data-testid="endpoint-input"]') as HTMLInputElement;
    endpointInput.value = 'http://127.0.0.1:9999';
    endpointInput.dispatchEvent(new Event('input'));

    expect(currentProviderConfig.endpoint).toBe('http://127.0.0.1:9999');

    // Instantiate provider with updated config
    const provider = new LocalHttpProvider({
      endpoint: currentProviderConfig.endpoint,
      apiKey: currentProviderConfig.apiKey,
    });

    let requestedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'UI 設定驅動管道成功' } }] }) };
    });

    const result = await provider.translate({
      segments: [{ id: 'seg-ui' as SegmentId, text: 'UI driven configuration test' }],
      sourceLanguage: 'en' as LanguageCode,
      targetLanguage: 'zh-TW' as LanguageCode,
      mode: 'fast',
    });

    expect(requestedUrl).toBe('http://127.0.0.1:9999/v1/chat/completions');
    expect(result.segments[0].text).toBe('UI 設定驅動管道成功');

    hostUI.remove();
  });

  it('3.6 ThemeToggle mode switch + ShadowRenderer CSS encapsulation verification', () => {
    let themeState: 'light' | 'dark' | 'auto' = 'light';

    const hostUI = document.createElement('div');
    document.body.appendChild(hostUI);

    const app = createApp(h(ThemeToggle, {
      theme: themeState,
      'onUpdate:theme': (next: any) => { themeState = next; },
    }));
    app.mount(hostUI);

    const btn = (hostUI.querySelector('[data-testid="theme-btn-dark"]') || hostUI.querySelectorAll('button')[1]) as HTMLButtonElement;
    btn.click(); // light -> dark
    expect(themeState).toBe('dark');

    // Render Shadow DOM block and inspect scoped style tag
    testContainer.innerHTML = `<p id="theme-p">Theme test element</p>`;
    const p = testContainer.querySelector('#theme-p')!;
    const shadowHost = renderBilingualBlock(p, 'seg-theme', 'Theme test element', '主題測試譯文');

    const shadowStyle = shadowHost.shadowRoot?.querySelector('style')?.textContent;
    expect(shadowStyle).toContain('@media (prefers-color-scheme: dark)');

    hostUI.remove();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GenericDomAdapter } from '@/adapters/generic/generic-dom-adapter';
import { ModelRegistry, REGISTERED_PROVIDERS } from '@/infrastructure/providers/model-registry';
import { OllamaProvider } from '@/infrastructure/providers/ollama-provider';
import { ChromeAiProvider, ChromeBuiltInAIProvider } from '@/infrastructure/providers/chrome-builtin-ai-provider';
import { removeAllBilingualBlocks } from '@/features/page-translation/renderer/shadow-renderer';

describe('Generic Web Page DOM Translation Adapter & Model Registry', () => {
  let adapter: GenericDomAdapter;
  let testContainer: HTMLElement;

  beforeEach(() => {
    adapter = new GenericDomAdapter();
    testContainer = document.createElement('div');
    testContainer.id = 'test-root';
    document.body.appendChild(testContainer);
  });

  afterEach(() => {
    removeAllBilingualBlocks(document);
    testContainer.remove();
  });

  // --------------------------------------------------------------------------
  // 1. GenericDomAdapter Tests
  // --------------------------------------------------------------------------
  describe('GenericDomAdapter Implementation', () => {
    it('1.1 matches any standard Web URL and document', () => {
      const url = new URL('https://example.com/article/1');
      expect(adapter.matches(url, document)).toBe(true);
      expect(adapter.id).toBe('generic-dom-adapter');
      expect(adapter.priority).toBe(0);
    });

    it('1.2 extracts page content summary and translatable targets', () => {
      document.title = 'Test Article Page';
      testContainer.innerHTML = `
        <h1>Article Headline</h1>
        <p id="p1">This is the first paragraph of test content.</p>
        <p id="p2">This is the second paragraph of test content.</p>
      `;

      const pageSummary = adapter.extractPage(document);
      expect(pageSummary?.content).toContain('Test Article Page');

      const targets = adapter.getTranslationTargets(document);
      expect(targets.length).toBe(3);
      expect(targets[0].text).toBe('Article Headline');
      expect(targets[1].text).toBe('This is the first paragraph of test content.');
    });

    it('1.3 translates HTML content blocks and renders Shadow DOM bilingual blocks', async () => {
      testContainer.innerHTML = `
        <h1 id="h1">Header Title Text</h1>
        <p id="p1">Paragraph to be translated via Shadow DOM.</p>
      `;

      const mockTranslateFn = vi.fn().mockImplementation(async (segments) => {
        return segments.map((s: { id: string; text: string }) => ({
          id: s.id,
          translatedText: `[Translated] ${s.text}`,
        }));
      });

      const result = await adapter.translatePage(document, {
        targetLanguage: 'zh-TW',
        displayMode: 'bilingual',
        translateFn: mockTranslateFn,
      });

      expect(result.success).toBe(true);
      expect(result.translatedCount).toBe(2);
      expect(mockTranslateFn).toHaveBeenCalledTimes(1);

      const hosts = document.querySelectorAll('.owt-bilingual-host');
      expect(hosts.length).toBe(2);
      expect(hosts[0].shadowRoot).not.toBeNull();
      expect(hosts[0].shadowRoot?.querySelector('.owt-translated')?.textContent).toContain('[Translated] Header Title Text');
    });

    it('1.4 translates selected text and renders inline Shadow DOM host', async () => {
      testContainer.innerHTML = `<p id="target-p">Specific phrase selected by user.</p>`;
      const targetP = document.getElementById('target-p')!;

      const range = document.createRange();
      range.selectNodeContents(targetP);

      const mockTranslateFn = vi.fn().mockResolvedValue([
        { id: 'seg-sel', translatedText: '使用者選擇的特定短語' },
      ]);

      const result = await adapter.translateSelection(range, document, {
        targetLanguage: 'zh-TW',
        displayMode: 'bilingual',
        translateFn: mockTranslateFn,
      });

      expect(result.success).toBe(true);
      expect(result.translatedText).toBe('使用者選擇的特定短語');
      expect(result.host).not.toBeNull();
      expect(result.host?.classList.contains('owt-inline-host') || result.host?.classList.contains('owt-bilingual-host')).toBe(true);
    });

    it('1.5 restores page by removing injected Shadow DOM hosts', async () => {
      testContainer.innerHTML = `<p>Test content block for restore verification.</p>`;

      await adapter.translatePage(document, {
        targetLanguage: 'zh-TW',
        translateFn: async (segs) => segs.map((s) => ({ id: s.id, translatedText: '譯文' })),
      });

      expect(document.querySelectorAll('.owt-bilingual-host').length).toBe(1);

      const restoredCount = adapter.restorePage(document);
      expect(restoredCount).toBe(1);
      expect(document.querySelectorAll('.owt-bilingual-host').length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 2. ModelRegistry Provider Registration Tests
  // --------------------------------------------------------------------------
  describe('ModelRegistry Provider Registration', () => {
    it('2.1 registers OllamaProvider in ModelRegistry with local private AI settings', () => {
      expect(ModelRegistry.isRegistered('ollama-provider')).toBe(true);
      expect(ModelRegistry.isRegistered('ollama')).toBe(true);

      const reg = ModelRegistry.getProviderRegistration('ollama-provider');
      expect(reg?.displayName).toBe('Ollama Local AI');
      expect(reg?.isLocal).toBe(true);
      expect(reg?.supportedModels).toContain('llama3');

      const provider = ModelRegistry.createProvider('ollama', { ollamaEndpoint: 'http://localhost:11434', ollamaModel: 'llama3' });
      expect(provider).toBeInstanceOf(OllamaProvider);
      expect(provider.isLocal).toBe(true);
      expect(provider.id).toBe('ollama-provider');
    });

    it('2.2 registers ChromeAiProvider in ModelRegistry with local built-in AI capabilities', () => {
      expect(ModelRegistry.isRegistered('chrome-builtin-ai-provider')).toBe(true);
      expect(ModelRegistry.isRegistered('chrome-ai')).toBe(true);

      const reg = ModelRegistry.getProviderRegistration('chrome-builtin-ai-provider');
      expect(reg?.displayName).toBe('Chrome Built-in AI');
      expect(reg?.isLocal).toBe(true);

      const provider = ModelRegistry.createProvider('chrome-ai');
      expect(provider).toBeInstanceOf(ChromeBuiltInAIProvider);
      expect(provider).toBeInstanceOf(ChromeAiProvider);
      expect(provider.isLocal).toBe(true);
      expect(provider.id).toBe('chrome-builtin-ai-provider');
    });

    it('2.3 lists all registered models across local and cloud providers', () => {
      const allModels = ModelRegistry.getAllRegisteredModels();
      expect(allModels.length).toBeGreaterThan(5);

      const ollamaModels = allModels.filter((m) => m.providerId === 'ollama-provider');
      expect(ollamaModels.length).toBeGreaterThan(0);
      expect(ollamaModels[0].isLocal).toBe(true);

      const chromeAiModels = allModels.filter((m) => m.providerId === 'chrome-builtin-ai-provider');
      expect(chromeAiModels.length).toBeGreaterThan(0);
      expect(chromeAiModels[0].isLocal).toBe(true);
    });

    it('2.4 validates model IDs correctly for Ollama and Chrome AI', () => {
      const ollamaVal = ModelRegistry.validateModel('ollama-provider', 'llama3');
      expect(ollamaVal.isValid).toBe(true);

      const emptyOllama = ModelRegistry.validateModel('ollama-provider', '');
      expect(emptyOllama.isValid).toBe(false);

      const chromeAiVal = ModelRegistry.validateModel('chrome-ai', 'default');
      expect(chromeAiVal.isValid).toBe(true);
    });
  });
});

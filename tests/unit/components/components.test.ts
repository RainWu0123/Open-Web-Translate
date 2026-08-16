import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ThemeToggle from '@/components/ThemeToggle.vue';
import ProviderConfigCard, { maskApiKey } from '@/components/ProviderConfigCard.vue';
import DisplaySettings from '@/components/DisplaySettings.vue';
import SubtitleStyleSettings from '@/components/SubtitleStyleSettings.vue';
import GlossaryManager from '@/components/GlossaryManager.vue';

describe('Decomposed UI Components Unit Tests', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  describe('ThemeToggle.vue', () => {
    it('renders theme toggle options and sets data-theme attribute on documentElement', async () => {
      const wrapper = mount(ThemeToggle, {
        props: {
          modelValue: 'light',
        },
      });

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');

      const darkBtn = wrapper.find('[data-testid="theme-btn-dark"]');
      expect(darkBtn.exists()).toBe(true);

      await darkBtn.trigger('click');

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['dark']);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('supports compact mode rendering', () => {
      const wrapper = mount(ThemeToggle, {
        props: {
          compact: true,
          modelValue: 'system',
        },
      });
      expect(wrapper.find('[data-testid="theme-toggle"]').exists()).toBe(true);
    });
  });

  describe('ProviderConfigCard.vue', () => {
    it('masks API keys correctly using maskApiKey helper function', () => {
      expect(maskApiKey('')).toBe('');
      expect(maskApiKey('12345')).toBe('***');
      expect(maskApiKey('AIzaSyA1234567890BCDEF')).toBe('AIz-***CDEF');
    });

    it('renders provider selection dropdown and emits activeProviderId updates', async () => {
      const wrapper = mount(ProviderConfigCard, {
        props: {
          activeProviderId: 'mock-provider',
          hasGeminiApiKey: false,
        },
      });

      const select = wrapper.find('[data-testid="active-provider-select"]');
      expect(select.exists()).toBe(true);

      await select.setValue('gemini-provider');

      expect(wrapper.emitted('update:activeProviderId')?.[0]).toEqual(['gemini-provider']);

      await select.setValue('chrome-ai-provider');
      expect(wrapper.emitted('update:activeProviderId')?.[1]).toEqual(['chrome-ai-provider']);
    });

    it('handles Gemini API key input and save emission', async () => {
      const wrapper = mount(ProviderConfigCard, {
        props: {
          activeProviderId: 'gemini-provider',
          hasGeminiApiKey: false,
        },
      });

      const keyInput = wrapper.find('[data-testid="gemini-key-input"]');
      expect(keyInput.exists()).toBe(true);

      await keyInput.setValue('test-gemini-key-12345');
      const saveBtn = wrapper.find('[data-testid="save-gemini-key-btn"]');
      await saveBtn.trigger('click');

      expect(wrapper.emitted('saveGeminiKey')?.[0]).toEqual(['test-gemini-key-12345']);
    });
  });

  describe('DisplaySettings.vue', () => {
    it('renders compact mode with toggle and language selector for Popup', async () => {
      const wrapper = mount(DisplaySettings, {
        props: {
          compact: true,
          settings: {
            enabled: true,
            targetLanguage: 'zh-Hant',
          },
        },
      });

      const langSelect = wrapper.find('[data-testid="target-language-select"]');
      expect(langSelect.exists()).toBe(true);

      await langSelect.setValue('ja');

      expect(wrapper.emitted('update:settings')?.[0]).toEqual([{ targetLanguage: 'ja' }]);
    });

    it('renders full mode with general controls (subtitle styles moved to SubtitleStyleSettings)', () => {
      const wrapper = mount(DisplaySettings, {
        props: {
          compact: false,
          settings: {
            enabled: true,
            targetLanguage: 'en',
            displayMode: 'bilingual',
          },
        },
      });

      expect(wrapper.find('[data-testid="display-mode-select"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="range-orig-font-size"]').exists()).toBe(false);
    });

    it('SubtitleStyleSettings renders subtitle range sliders and color pickers', () => {
      const wrapper = mount(SubtitleStyleSettings, {
        props: {
          settings: {
            subtitleOriginalFontSize: 18,
            subtitleTranslatedFontSize: 22,
          },
        },
      });

      expect(wrapper.find('[data-testid="range-orig-font-size"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="range-trans-font-size"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="color-orig-color"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="color-trans-color"]').exists()).toBe(true);
    });
  });

  describe('GlossaryManager.vue', () => {
    it('renders vocabulary items list and handles search filter', async () => {
      const sampleItems = [
        { id: '1', word: 'apple', translation: '蘋果', context: 'An apple a day' },
        { id: '2', word: 'banana', translation: '香蕉', context: 'Yellow banana' },
      ];

      const wrapper = mount(GlossaryManager, {
        props: {
          items: sampleItems,
        },
      });

      expect(wrapper.findAll('[data-testid="vocab-row"]').length).toBe(2);

      const searchInput = wrapper.find('[data-testid="vocab-search-input"]');
      await searchInput.setValue('apple');

      expect(wrapper.findAll('[data-testid="vocab-row"]').length).toBe(1);
    });

    it('emits deleteItem, clearAll, and exportCsv events', async () => {
      const sampleItems = [{ id: 'item-1', word: 'test', translation: '測試' }];

      const wrapper = mount(GlossaryManager, {
        props: {
          items: sampleItems,
        },
      });

      const deleteBtn = wrapper.find('[data-testid="delete-vocab-item-btn"]');
      await deleteBtn.trigger('click');
      expect(wrapper.emitted('deleteItem')?.[0]).toEqual(['item-1']);

      const exportBtn = wrapper.find('[data-testid="export-csv-btn"]');
      await exportBtn.trigger('click');
      expect(wrapper.emitted('exportCsv')).toBeTruthy();

      const clearBtn = wrapper.find('[data-testid="clear-all-btn"]');
      await clearBtn.trigger('click');
      expect(wrapper.emitted('clearAll')).toBeTruthy();
    });
  });
});

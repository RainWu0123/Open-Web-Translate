import { describe, expect, it, vi } from 'vitest';
vi.mock('wxt/browser', () => ({ browser: { i18n: { getUILanguage: () => 'en-US' } } }));
import { browser } from 'wxt/browser';
import { normalizeBrowserLocale, resolveUiLocale, translate } from '@/shared/i18n';

describe('UI i18n', () => {
  it('maps browser Chinese locales to the correct writing system', () => {
    expect(normalizeBrowserLocale('zh-TW')).toBe('zh-Hant');
    expect(normalizeBrowserLocale('zh-HK')).toBe('zh-Hant');
    expect(normalizeBrowserLocale('zh-CN')).toBe('zh-Hans');
    expect(normalizeBrowserLocale('zh-SG')).toBe('zh-Hans');
    expect(normalizeBrowserLocale('zh')).toBe('zh-Hans');
    expect(normalizeBrowserLocale('zh_HK')).toBe('zh-Hant');
    expect(normalizeBrowserLocale('zh-TW-u-ca-gregory')).toBe('zh-Hant');
    expect(normalizeBrowserLocale('ja-JP')).toBe('ja');
    expect(normalizeBrowserLocale('en-US')).toBe('en');
    expect(normalizeBrowserLocale('fr-FR')).toBe('en');
  });

  it('keeps Traditional and Simplified Chinese terminology distinct', () => {
    expect(translate('zh-Hant', 'common.save')).toBe('儲存');
    expect(translate('zh-Hans', 'common.save')).toBe('保存');

    expect(translate('zh-Hant', 'options.apiKey')).toContain('金鑰');
    expect(translate('zh-Hans', 'options.apiKey')).toContain('密钥');

    expect(translate('zh-Hant', 'ui.language')).toBe('介面語言');
    expect(translate('zh-Hans', 'ui.language')).toBe('界面语言');
  });

  it('supports English and Japanese as first-class UI locales', () => {
    expect(translate('en', 'popup.translatePage')).toBe('Translate current page');
    expect(translate('ja', 'popup.translatePage')).toBe('現在のページを翻訳');
  });

  it('localizes Netflix translation progress and errors', () => {
    expect(translate('zh-Hant', 'subtitle.translatingLine')).toBe('翻譯中…');
    expect(translate('zh-Hans', 'subtitle.prefetchUnavailable')).toBe('暂时无法获取译文');
    expect(translate('en', 'subtitle.prefetchRetrying')).toContain('retrying');
    expect(translate('ja', 'subtitle.translationTimeout')).toContain('タイムアウト');
  });

  it('interpolates dynamic values', () => {
    expect(translate('en', 'status.translationDone', { count: 12 }))
      .toBe('Translation complete (12 segments)');
  });

  it('accepts explicit locale preferences without browser inference', () => {
    expect(resolveUiLocale('zh-Hans')).toBe('zh-Hans');
    expect(resolveUiLocale('ja')).toBe('ja');
  });

  it('uses the browser interface language in auto mode, while manual choice takes priority', () => {
    const spy = vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('ja-JP');
    try {
      expect(resolveUiLocale('auto')).toBe('ja');
      expect(resolveUiLocale('zh-Hans')).toBe('zh-Hans');
      expect(translate('auto', 'popup.translatePage')).toBe('現在のページを翻訳');
    } finally { spy.mockRestore(); }
  });
});

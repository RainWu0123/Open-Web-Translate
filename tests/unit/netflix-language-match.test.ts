import { describe, it, expect } from 'vitest';
import { trackMatchesTargetLanguage } from '@/adapters/netflix/netflix-track-manager';

describe('Netflix target language matching', () => {
  it.each([
    ['zh-Hant', 'zh-Hans', false], ['zh-Hans', 'zh-Hant', false],
    ['zh-TW', 'zh-Hant', true], ['zh-CN', 'zh-Hant', false],
    ['cmn-Hant', 'zh-Hant', true], ['yue-Hans', 'zh-Hant', false],
    ['zh-Hant-CN', 'zh-Hant', true], ['zh-Hans-TW', 'zh-Hant', false],
  ])('matches script %s against %s: %s', (language, target, expected) => {
    expect(trackMatchesTargetLanguage({ language, label: '' }, target)).toBe(expected);
  });

  it('uses labels when the Chinese language code has no script', () => {
    expect(trackMatchesTargetLanguage({ language: 'zh', label: '繁體中文' }, 'zh-Hant')).toBe(true);
    expect(trackMatchesTargetLanguage({ language: 'zh', label: '简体中文' }, 'zh-Hant')).toBe(false);
    expect(trackMatchesTargetLanguage({ language: 'unknown', label: 'Chinese (Traditional)' }, 'zh-Hant')).toBe(true);
  });
  it('matches cmn-Hant and Chinese labels for zh-Hant target', () => {
    expect(
      trackMatchesTargetLanguage({ language: 'cmn-Hant', label: '中文（繁體）' }, 'zh-Hant'),
    ).toBe(true);
    expect(
      trackMatchesTargetLanguage({ language: 'zh', label: 'Chinese' }, 'zh-Hant'),
    ).toBe(true);
    expect(
      trackMatchesTargetLanguage({ language: 'yue', label: '粵語' }, 'zh-Hant'),
    ).toBe(true);
  });

  it('does not match Japanese/English for Chinese target', () => {
    expect(
      trackMatchesTargetLanguage({ language: 'ja', label: 'Japanese' }, 'zh-Hant'),
    ).toBe(false);
    expect(
      trackMatchesTargetLanguage({ language: 'en', label: 'English' }, 'zh-Hant'),
    ).toBe(false);
  });

  it('matches English tracks for en target', () => {
    expect(
      trackMatchesTargetLanguage({ language: 'en', label: 'English' }, 'en'),
    ).toBe(true);
  });
});

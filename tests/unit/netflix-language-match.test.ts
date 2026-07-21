import { describe, it, expect } from 'vitest';

/**
 * Mirror of trackMatchesTargetLanguage used by NetflixCaptionAdapter.
 * Kept in sync for unit coverage of Chinese family matching (cmn/yue/hant labels).
 */
function trackMatchesTargetLanguage(
  track: { language: string; label: string },
  targetLang: string,
): boolean {
  const lang = (track.language || '').toLowerCase().replace(/_/g, '-');
  const label = (track.label || '').toLowerCase();
  const target = (targetLang || '').toLowerCase().replace(/_/g, '-');
  const targetPrefix = target.split('-')[0];

  if (!targetPrefix) return false;

  if (targetPrefix === 'zh' || target.startsWith('cmn') || target.startsWith('yue')) {
    const isChineseLang =
      lang.startsWith('zh') ||
      lang.startsWith('cmn') ||
      lang.startsWith('yue') ||
      lang.includes('hant') ||
      lang.includes('hans') ||
      lang.includes('cht') ||
      lang.includes('chs');
    const isChineseLabel =
      label.includes('中文') ||
      label.includes('chinese') ||
      label.includes('mandarin') ||
      label.includes('cantonese') ||
      label.includes('繁體') ||
      label.includes('繁体') ||
      label.includes('简体') ||
      label.includes('簡體') ||
      label.includes('國語') ||
      label.includes('国语') ||
      label.includes('粵語') ||
      label.includes('粤语');
    return isChineseLang || isChineseLabel;
  }

  if (lang.startsWith(targetPrefix)) return true;
  if (label.includes(targetPrefix)) return true;
  return false;
}

describe('Netflix target language matching', () => {
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

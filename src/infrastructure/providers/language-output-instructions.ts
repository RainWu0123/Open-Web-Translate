const LANGUAGE_RULES: Record<string, string> = {
  'zh-Hant': 'Write exclusively in Traditional Chinese. Use Taiwan-standard Traditional characters and natural Taiwanese terminology. Never output Simplified Chinese characters or Mainland-China-specific wording when a common Taiwanese equivalent exists.',
  'zh-Hans': 'Write exclusively in Simplified Chinese, using standard Simplified Chinese characters and natural Mainland Chinese terminology.',
  en: 'Write exclusively in natural English.',
  ja: 'Write exclusively in natural Japanese, using appropriate kanji and kana.',
  ko: 'Write exclusively in natural Korean, using Hangul.',
  es: 'Write exclusively in natural Spanish.',
  fr: 'Write exclusively in natural French.',
  de: 'Write exclusively in natural German.',
  it: 'Write exclusively in natural Italian.',
  pt: 'Write exclusively in natural Portuguese.',
  ru: 'Write exclusively in natural Russian.',
  ar: 'Write exclusively in natural Arabic.',
  hi: 'Write exclusively in natural Hindi.',
  th: 'Write exclusively in natural Thai.',
  vi: 'Write exclusively in natural Vietnamese.',
  id: 'Write exclusively in natural Indonesian.',
};

const LANGUAGE_ALIASES: Record<string, string> = {
  'zh-tw': 'zh-Hant',
  'zh-hk': 'zh-Hant',
  'zh-mo': 'zh-Hant',
  'zh-hant': 'zh-Hant',
  'zh-cn': 'zh-Hans',
  'zh-sg': 'zh-Hans',
  'zh-hans': 'zh-Hans',
};

/** Stable language-specific output contract shared by every prompt-aware provider. */
export function languageOutputInstruction(targetLanguage: string): string {
  const raw = targetLanguage.trim();
  const canonical = LANGUAGE_ALIASES[raw.toLowerCase()] || raw.split('-')[0].toLowerCase();
  const rule = LANGUAGE_RULES[canonical]
    || `Write exclusively in the language identified by BCP 47 code "${raw}". Do not mix in the source language unless it is a proper noun that should remain unchanged.`;
  return `\nTARGET LANGUAGE REQUIREMENT:\n${rule}`;
}


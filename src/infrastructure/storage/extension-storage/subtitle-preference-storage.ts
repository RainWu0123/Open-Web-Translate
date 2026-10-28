import { browser } from 'wxt/browser';

export interface SubtitleTranslationPreference {
  mode: 'native' | 'ai';
  /** A selected subtitle language, or absent to follow the target language. */
  language?: string;
}

export const SUBTITLE_PREFERENCE_KEY = 'owt_subtitle_translation_preference';
export const DEFAULT_SUBTITLE_PREFERENCE: SubtitleTranslationPreference = { mode: 'native' };

function normalize(value: unknown): SubtitleTranslationPreference {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SUBTITLE_PREFERENCE };
  const input = value as Record<string, unknown>;
  if (input.mode !== 'native' && input.mode !== 'ai') return { ...DEFAULT_SUBTITLE_PREFERENCE };
  const language = typeof input.language === 'string' && /^[a-zA-Z0-9-]{2,40}$/.test(input.language) ? input.language : undefined;
  return input.mode === 'native' && language ? { mode: 'native', language } : { mode: input.mode };
}

/** Separate key avoids rewriting the shared settings object containing credentials. */
export class SubtitlePreferenceStorage {
  static async get(): Promise<SubtitleTranslationPreference> {
    try { return normalize((await browser.storage.local.get(SUBTITLE_PREFERENCE_KEY))[SUBTITLE_PREFERENCE_KEY]); }
    catch { return { ...DEFAULT_SUBTITLE_PREFERENCE }; }
  }

  static async set(preference: SubtitleTranslationPreference): Promise<void> {
    await browser.storage.local.set({ [SUBTITLE_PREFERENCE_KEY]: normalize(preference) });
  }

  static watch(callback: (preference: SubtitleTranslationPreference) => void): () => void {
    if (!browser?.storage?.local?.onChanged) return () => {};
    const listener = (changes: Record<string, { newValue?: unknown }>) => {
      if (changes[SUBTITLE_PREFERENCE_KEY]) callback(normalize(changes[SUBTITLE_PREFERENCE_KEY].newValue));
    };
    browser.storage.local.onChanged.addListener(listener);
    return () => browser.storage.local.onChanged.removeListener(listener);
  }

  static observe(callback: (preference: SubtitleTranslationPreference) => void): () => void {
    let revision = 0;
    let active = true;
    let unwatch = () => {};
    try {
      unwatch = this.watch(value => { revision += 1; if (active) callback(value); });
    } catch { /* A test or restricted context may not expose change events. */ }
    void this.get().then(value => { if (active && revision === 0) callback(value); });
    return () => { active = false; unwatch(); };
  }
}

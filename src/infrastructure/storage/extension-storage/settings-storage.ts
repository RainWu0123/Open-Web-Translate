/**
 * Settings storage with a strict public/secret boundary.
 *
 * Public callers (content scripts, popup, options UI) use get/set/watch and
 * never receive raw provider credentials. Background-only provider code uses
 * getInternal() when a real API key is required to perform a request.
 */
import { browser } from 'wxt/browser';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../../../shared/constants';
import type {
  ExtensionSettings,
  InternalExtensionSettings,
  SecretSettings,
} from '../../../core/contracts/messages';

type StoredSettings = Partial<InternalExtensionSettings>;

const SECRET_KEYS: Array<keyof SecretSettings> = [
  'geminiApiKey',
  'deeplApiKey',
  'localHttpApiKey',
  'customHttpApiKey',
];

export class SettingsStorage {
  static maskApiKey(key?: string): string {
    if (!key || key.trim().length === 0) return '';
    const trimmed = key.trim();
    if (trimmed.length <= 8) return '••••••••';
    return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
  }

  /** Public settings view. Raw API keys are always stripped. */
  static async get(): Promise<ExtensionSettings> {
    return this.toPublic(await this.readRaw());
  }

  /**
   * Background/provider-only settings view. This contains raw credentials and
   * must never be returned through extension messaging or exposed to page UI.
   */
  static async getInternal(): Promise<InternalExtensionSettings> {
    const raw = await this.readRaw();
    return {
      ...this.toPublic(raw),
      ...this.pickSecrets(raw),
    };
  }

  /**
   * Merge-patch public settings. Secret and derived fields are ignored even
   * if an untyped caller tries to smuggle them into the patch.
   */
  static async set(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    const current = await this.readRaw();
    const safePatch = this.sanitizePublicPatch(patch as Record<string, unknown>);
    const updated: StoredSettings = {
      ...current,
      ...safePatch,
      ...(current.netflix || safePatch.netflix
        ? { netflix: { ...(current.netflix ?? {}), ...(safePatch.netflix ?? {}) } as ExtensionSettings['netflix'] }
        : {}),
    };
    await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
    return this.toPublic(updated);
  }

  /** Public change stream; raw credentials never leave this module. */
  static watch(callback: (newSettings: ExtensionSettings) => void): () => void {
    const listener = (changes: Record<string, { newValue?: unknown }>) => {
      if (changes[STORAGE_KEYS.SETTINGS]) {
        callback(this.toPublic(changes[STORAGE_KEYS.SETTINGS].newValue as StoredSettings | undefined));
      }
    };
    browser.storage.local.onChanged.addListener(listener);
    return () => browser.storage.local.onChanged.removeListener(listener);
  }

  static async migrateLegacyKeys(): Promise<void> {
    try {
      if (!browser.storage?.sync) return;
      const legacy = ((await browser.storage.sync.get('owt_netflix_config')) as Record<string, unknown>)[
        'owt_netflix_config'
      ] as ExtensionSettings['netflix'] | undefined;
      if (!legacy) return;
      const current = await this.readRaw();
      if (!current.netflix) {
        await browser.storage.local.set({
          [STORAGE_KEYS.SETTINGS]: { ...current, netflix: legacy },
        });
      }
      await browser.storage.sync.remove('owt_netflix_config');
    } catch {
      // migration is best-effort; missing sync access must not break boot
    }
  }

  // ── Secret write conveniences ──────────────────────────────────

  static async saveGeminiApiKey(key: string): Promise<void> {
    await this.setSecret('geminiApiKey', key);
  }

  static async clearGeminiApiKey(): Promise<void> {
    await this.setSecret('geminiApiKey', '');
  }

  static async saveDeeplApiKey(key: string): Promise<void> {
    await this.setSecret('deeplApiKey', key);
  }

  static async clearDeeplApiKey(): Promise<void> {
    await this.setSecret('deeplApiKey', '');
  }

  static async saveLocalHttpApiKey(key: string): Promise<void> {
    await this.setSecret('localHttpApiKey', key);
  }

  static async clearLocalHttpApiKey(): Promise<void> {
    await this.setSecret('localHttpApiKey', '');
  }

  static async saveCustomHttpApiKey(key: string): Promise<void> {
    await this.setSecret('customHttpApiKey', key);
  }

  static async clearCustomHttpApiKey(): Promise<void> {
    await this.setSecret('customHttpApiKey', '');
  }

  // ── internals ──────────────────────────────────────────────────

  private static async setSecret(key: keyof SecretSettings, value: string): Promise<void> {
    const current = await this.readRaw();
    await browser.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: {
        ...current,
        [key]: value.trim(),
      },
    });
  }

  private static async readRaw(): Promise<StoredSettings> {
    try {
      const result = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
      return (result[STORAGE_KEYS.SETTINGS] as StoredSettings | undefined) ?? DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  private static pickSecrets(raw: StoredSettings): SecretSettings {
    return {
      geminiApiKey: typeof raw.geminiApiKey === 'string' ? raw.geminiApiKey : '',
      deeplApiKey: typeof raw.deeplApiKey === 'string' ? raw.deeplApiKey : '',
      localHttpApiKey: typeof raw.localHttpApiKey === 'string' ? raw.localHttpApiKey : '',
      customHttpApiKey: typeof raw.customHttpApiKey === 'string' ? raw.customHttpApiKey : '',
    };
  }

  private static sanitizePublicPatch(patch: Record<string, unknown>): Partial<ExtensionSettings> {
    const clean = { ...patch };
    for (const key of SECRET_KEYS) delete clean[key];
    delete clean.geminiApiKeyMasked;
    delete clean.hasGeminiApiKey;
    delete clean.deeplApiKeyMasked;
    delete clean.hasDeeplApiKey;
    delete clean.localHttpApiKeyMasked;
    delete clean.hasLocalHttpApiKey;
    delete clean.customHttpApiKeyMasked;
    delete clean.hasCustomHttpApiKey;
    return clean as Partial<ExtensionSettings>;
  }

  private static toPublic(raw: StoredSettings | undefined): ExtensionSettings {
    const s: StoredSettings = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
    const geminiKey = typeof s.geminiApiKey === 'string' ? s.geminiApiKey : '';
    const deeplKey = typeof s.deeplApiKey === 'string' ? s.deeplApiKey : '';
    const localHttpKey = typeof s.localHttpApiKey === 'string' ? s.localHttpApiKey : '';
    const customHttpKey = typeof s.customHttpApiKey === 'string' ? s.customHttpApiKey : '';

    const {
      geminiApiKey: _geminiApiKey,
      deeplApiKey: _deeplApiKey,
      localHttpApiKey: _localHttpApiKey,
      customHttpApiKey: _customHttpApiKey,
      ...publicFields
    } = s;

    return {
      ...DEFAULT_SETTINGS,
      ...publicFields,
      hasGeminiApiKey: geminiKey.trim().length > 0,
      geminiApiKeyMasked: this.maskApiKey(geminiKey),
      hasDeeplApiKey: deeplKey.trim().length > 0,
      deeplApiKeyMasked: this.maskApiKey(deeplKey),
      hasLocalHttpApiKey: localHttpKey.trim().length > 0,
      localHttpApiKeyMasked: this.maskApiKey(localHttpKey),
      hasCustomHttpApiKey: customHttpKey.trim().length > 0,
      customHttpApiKeyMasked: this.maskApiKey(customHttpKey),
    } as ExtensionSettings;
  }
}

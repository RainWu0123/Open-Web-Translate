/**
 * Settings — the single settings module.
 *
 * Deep module owning the extension's entire settings surface:
 * one schema (ExtensionSettings, incl. the nested NetflixConfig), one
 * storage area (storage.local, key owt_settings), one set of defaults
 * (DEFAULT_SETTINGS), and one change seam (watch).
 *
 * Interface: get() · set(patch) · watch(fn). Every context (background,
 * content script, popup, options) talks to storage directly through this
 * module — no parallel schema, transport, or defaults are allowed to grow
 * beside it.
 */
import { browser } from 'wxt/browser';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../../../shared/constants';
import type { ExtensionSettings } from '../../../core/contracts/messages';

export class SettingsStorage {
  static maskApiKey(key?: string): string {
    if (!key || key.trim().length === 0) return '';
    const trimmed = key.trim();
    if (trimmed.length <= 8) return '••••••••';
    return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
  }

  /** Read settings with defaults merged and API keys decorated. */
  static async get(): Promise<ExtensionSettings> {
    return this.decorate(await this.readRaw());
  }

  /**
   * Merge-patch write. Only the touched fields change; the decorated key
   * flags are recomputed. Returns the decorated result.
   */
  static async set(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    const current = await this.get();
    const updated: ExtensionSettings = { ...current, ...patch };
    await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
    return this.decorate(updated);
  }

  /**
   * Subscribe to settings changes (same key, storage.local). Returns an
   * unsubscribe function.
   */
  static watch(callback: (newSettings: ExtensionSettings) => void): () => void {
    const listener = (changes: Record<string, { newValue?: unknown }>) => {
      if (changes[STORAGE_KEYS.SETTINGS]) {
        callback(this.decorate(changes[STORAGE_KEYS.SETTINGS].newValue as Partial<ExtensionSettings> | undefined));
      }
    };
    browser.storage.local.onChanged.addListener(listener);
    return () => browser.storage.local.onChanged.removeListener(listener);
  }

  /**
   * One-time migration of the legacy parallel config system: Netflix
   * settings used to live in storage.sync under 'owt_netflix_config' with
   * their own transport. Folds them into settings.netflix and removes the
   * sync key. Safe to call on every background startup.
   */
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

  // ── API-key conveniences (domain rules live here, not in callers) ──

  static async saveGeminiApiKey(key: string): Promise<void> {
    await this.set({ geminiApiKey: key.trim() });
  }

  static async clearGeminiApiKey(): Promise<void> {
    await this.set({ geminiApiKey: '' });
  }

  static async saveDeeplApiKey(key: string): Promise<void> {
    await this.set({ deeplApiKey: key.trim() });
  }

  static async clearDeeplApiKey(): Promise<void> {
    await this.set({ deeplApiKey: '' });
  }

  // ── internals ─────────────────────────────────────────────────────

  private static async readRaw(): Promise<Partial<ExtensionSettings>> {
    try {
      const result = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
      return (result[STORAGE_KEYS.SETTINGS] as Partial<ExtensionSettings> | undefined) ?? DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  private static decorate(raw: Partial<ExtensionSettings> | undefined): ExtensionSettings {
    const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
    const geminiKey = s.geminiApiKey ?? '';
    const deeplKey = s.deeplApiKey ?? '';
    return {
      ...s,
      hasGeminiApiKey: geminiKey.trim().length > 0,
      geminiApiKeyMasked: this.maskApiKey(geminiKey),
      hasDeeplApiKey: deeplKey.trim().length > 0,
      deeplApiKeyMasked: this.maskApiKey(deeplKey),
    };
  }
}

/**
 * Settings Storage
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

  static async getSettings(): Promise<ExtensionSettings> {
    const result = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
    const settings = (result[STORAGE_KEYS.SETTINGS] as ExtensionSettings | undefined) ?? DEFAULT_SETTINGS;
    const rawGeminiKey = settings.geminiApiKey ?? '';
    const rawDeeplKey = settings.deeplApiKey ?? '';

    return {
      ...DEFAULT_SETTINGS,
      ...settings,
      hasGeminiApiKey: rawGeminiKey.trim().length > 0,
      geminiApiKeyMasked: this.maskApiKey(rawGeminiKey),
      hasDeeplApiKey: rawDeeplKey.trim().length > 0,
      deeplApiKeyMasked: this.maskApiKey(rawDeeplKey),
    };
  }

  static async hasGeminiApiKey(): Promise<boolean> {
    const settings = await this.getSettings();
    return Boolean(settings.hasGeminiApiKey);
  }

  static async hasDeeplApiKey(): Promise<boolean> {
    const settings = await this.getSettings();
    return Boolean(settings.hasDeeplApiKey);
  }

  static async saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
    const current = await this.getSettings();
    const updated: ExtensionSettings = { ...current, ...settings };
    await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
  }

  static async saveGeminiApiKey(key: string): Promise<void> {
    await this.saveSettings({ geminiApiKey: key.trim() });
  }

  static async clearGeminiApiKey(): Promise<void> {
    const current = await this.getSettings();
    const { geminiApiKey, geminiApiKeyMasked, hasGeminiApiKey, ...rest } = current;
    const updated: ExtensionSettings = { ...rest, geminiApiKey: '' };
    await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
  }

  static async saveDeeplApiKey(key: string): Promise<void> {
    await this.saveSettings({ deeplApiKey: key.trim() });
  }

  static async clearDeeplApiKey(): Promise<void> {
    const current = await this.getSettings();
    const { deeplApiKey, deeplApiKeyMasked, hasDeeplApiKey, ...rest } = current;
    const updated: ExtensionSettings = { ...rest, deeplApiKey: '' };
    await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
  }

  static onChange(callback: (newSettings: ExtensionSettings) => void): void {
    browser.storage.local.onChanged.addListener((changes) => {
      if (changes[STORAGE_KEYS.SETTINGS]) {
        const raw = changes[STORAGE_KEYS.SETTINGS].newValue as ExtensionSettings | undefined;
        const s = raw ?? DEFAULT_SETTINGS;
        const rawGeminiKey = s.geminiApiKey ?? '';
        const rawDeeplKey = s.deeplApiKey ?? '';
        const decorated: ExtensionSettings = {
          ...DEFAULT_SETTINGS,
          ...s,
          hasGeminiApiKey: rawGeminiKey.trim().length > 0,
          geminiApiKeyMasked: SettingsStorage.maskApiKey(rawGeminiKey),
          hasDeeplApiKey: rawDeeplKey.trim().length > 0,
          deeplApiKeyMasked: SettingsStorage.maskApiKey(rawDeeplKey),
        };
        callback(decorated);
      }
    });
  }
}

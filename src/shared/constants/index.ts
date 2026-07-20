/**
 * Application Constants
 */
import type { ExtensionSettings } from '@/core/contracts/messages';

export const DB_NAME = 'open-web-translate';
export const DB_VERSION = 2;

export const STORAGE_KEYS = {
  SETTINGS: 'owt_settings',
} as const;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  targetLanguage: 'zh-Hant',
  enabled: true,
  defaultTranslationMode: 'fast',
  activeProviderId: 'google-provider',
  geminiApiKey: '',
  geminiModel: 'gemini-3.5-flash',
  deeplApiKey: '',
  deeplApiIsPro: false,
  displayMode: 'bilingual',
  uiLanguage: 'zh-Hant',
  showFloatingButton: true,
  subtitleOriginalFontSize: 18,
  subtitleTranslatedFontSize: 22,
  subtitleOriginalColor: '#ffffff',
  subtitleTranslatedColor: '#818cf8',
};

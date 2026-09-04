/**
 * Application Constants
 */
import type { ExtensionSettings } from '@/core/contracts/messages';

export const DB_NAME = 'open-web-translate';
export const DB_VERSION = 2;

export const STORAGE_KEYS = {
  SETTINGS: 'owt_settings',
} as const;

export const DEFAULT_NETFLIX_CONFIG: NonNullable<ExtensionSettings['netflix']> = {
  enabled: true,
  primarySize: 18,
  secondarySize: 22,
  bottomPosition: 80,
  lineSpacing: 4,
  enableBitmapRescue: true,
  learningMode: true,
};

export const DEFAULT_SETTINGS: ExtensionSettings = {
  netflix: DEFAULT_NETFLIX_CONFIG,
  sourceLanguage: 'auto',
  targetLanguage: 'zh-Hant',
  enabled: true,
  defaultTranslationMode: 'fast',
  activeProviderId: 'google-provider',
  geminiApiKey: '',
  geminiModel: 'gemini-3.5-flash',
  aiTranslationInstructions: '',
  deeplApiKey: '',
  deeplApiIsPro: false,
  displayMode: 'bilingual',
  uiLanguage: 'zh-Hant',
  showFloatingButton: false,
  subtitleOriginalFontSize: 18,
  subtitleTranslatedFontSize: 22,
  subtitleOriginalColor: '#ffffff',
  subtitleTranslatedColor: '#818cf8',
};

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
  learningMode: false,
};

export const DEFAULT_SETTINGS: ExtensionSettings = {
  theme: 'system',
  netflix: DEFAULT_NETFLIX_CONFIG,
  sourceLanguage: 'auto',
  targetLanguage: 'zh-Hant',
  enabled: true,
  defaultTranslationMode: 'fast',
  activeProviderId: 'google-provider',
  remoteProviderDisclosureVersion: 1,
  geminiModel: 'gemini-3.5-flash',
  openRouterModel: 'openrouter/auto',
  nvidiaNimEndpoint: 'https://integrate.api.nvidia.com/v1',
  nvidiaNimModel: 'meta/llama-3.1-8b-instruct',
  aiTranslationInstructions: '',
  deeplApiIsPro: false,
  displayMode: 'bilingual',
  uiLanguage: 'auto',
  showFloatingButton: false,
  subtitleOriginalFontSize: 18,
  subtitleTranslatedFontSize: 22,
  subtitleOriginalColor: '#ffffff',
  subtitleTranslatedColor: '#d4d4d4',
  smartBlurSubtitles: false,
};

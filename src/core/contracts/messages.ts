/**
 * Typed Message Protocol
 * Uses discriminated unions for type-safe message passing between
 * content scripts, popup, options, and the background service worker.
 */
import type { LanguageCode } from './common';
import type { VocabularyItem } from '@/infrastructure/storage/indexeddb/schemas';

// ─── Limits & Error Constants ─────────────────────────────────────

export const PAYLOAD_LIMITS = {
  MAX_TARGETS: 30,
  MAX_CHARS_PER_SEGMENT: 1000,
  MAX_TOTAL_CHARS: 12000,
} as const;

export enum MessageErrorCode {
  EXCEEDED_LIMITS = 'EXCEEDED_LIMITS',
  NO_TARGETS_FOUND = 'NO_TARGETS_FOUND',
  TRANSLATION_FAILED = 'TRANSLATION_FAILED',
  ACTIVE_TAB_NOT_FOUND = 'ACTIVE_TAB_NOT_FOUND',
  CONTENT_SCRIPT_UNAVAILABLE = 'CONTENT_SCRIPT_UNAVAILABLE',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface ErrorPayload {
  code: MessageErrorCode | string;
  message: string;
  details?: unknown;
}

// ─── Settings ────────────────────────────────────────────────────

/** Extension settings persisted in browser storage */
export interface ExtensionSettings {
  targetLanguage: string;
  enabled: boolean;
  defaultTranslationMode: 'fast' | 'quality';
  activeProviderId: string;
  geminiApiKey?: string;
  geminiApiKeyMasked?: string;
  hasGeminiApiKey?: boolean;
  geminiModel?: string;
  deeplApiKey?: string;
  deeplApiKeyMasked?: string;
  hasDeeplApiKey?: boolean;
  deeplApiIsPro?: boolean;
  displayMode?: 'bilingual' | 'translation-first' | 'immersive';
  uiLanguage?: string;
  showFloatingButton?: boolean;
  subtitleOriginalFontSize?: number;
  subtitleTranslatedFontSize?: number;
  subtitleOriginalColor?: string;
  subtitleTranslatedColor?: string;
  ollamaEndpoint?: string;
  ollamaModel?: string;
  ollamaTemperature?: number;
  localHttpEndpoint?: string;
  localHttpApiKey?: string;
  localHttpModel?: string;
  /** Netflix subtitle card settings; persisted inside the single settings store. */
  netflix?: NetflixConfig;
}

export interface NetflixConfig {
  enabled: boolean;
  primarySize: number;
  secondarySize: number;
  bottomPosition: number;
  lineSpacing: number;
  enableBitmapRescue: boolean;
  learningMode: boolean;
}

export interface NetflixStateInfo {
  isActive: boolean;
  primaryStatus: string;
  secondaryStatus: string;
  modeLabel: string;
  modeClass: string;
  discoveredTracksCount: number;
  activePreview?: {
    primary: string;
    secondary: string;
  } | null;
  /** Internal adapter state machine value, surfaced for diagnostics. */
  adapterState?: string;
  selectedTrackId?: string;
  secondaryCuesCount?: number;
}

// ─── Messages (Content/Popup/Options → Background/Tab) ────────────

export interface TranslateRequestMessage {
  type: 'TRANSLATE_REQUEST';
  segments: Array<{ id: string; text: string }>;
  sourceLanguage: string;
  targetLanguage: string;
  forceProvider?: string;
}

export interface GetSettingsMessage {
  type: 'GET_SETTINGS';
}

export interface UpdateSettingsMessage {
  type: 'UPDATE_SETTINGS';
  settings: Partial<ExtensionSettings>;
}

export interface TranslateActiveTabMessage {
  type: 'TRANSLATE_ACTIVE_TAB';
}

export interface RestoreActiveTabMessage {
  type: 'RESTORE_ACTIVE_TAB';
}

export interface ExecutePageTranslationMessage {
  type: 'EXECUTE_PAGE_TRANSLATION';
}

export interface RestorePageTranslationMessage {
  type: 'RESTORE_PAGE_TRANSLATION';
}

export interface SaveVocabItemMessage {
  type: 'SAVE_VOCAB_ITEM';
  word: string;
  translation: string;
  context?: string;
  url?: string;
}

export interface GetVocabItemsMessage {
  type: 'GET_VOCAB_ITEMS';
}

export interface DeleteVocabItemMessage {
  type: 'DELETE_VOCAB_ITEM';
  id: string;
}

export interface ClearVocabItemsMessage {
  type: 'CLEAR_VOCAB_ITEMS';
}

export interface GetNetflixStateMessage {
  type: 'GET_NETFLIX_STATE';
}

/** All messages that can be sent in the messaging system */
export type BackgroundMessage =
  | TranslateRequestMessage
  | GetSettingsMessage
  | UpdateSettingsMessage
  | TranslateActiveTabMessage
  | RestoreActiveTabMessage
  | ExecutePageTranslationMessage
  | RestorePageTranslationMessage
  | SaveVocabItemMessage
  | GetVocabItemsMessage
  | DeleteVocabItemMessage
  | ClearVocabItemsMessage
  | GetNetflixStateMessage;

// ─── Responses (Background / Content → Caller) ────────────────────

export interface TranslateResponsePayload {
  segments: Array<{ id: string; translatedText: string }>;
}

export interface TranslateActiveTabResponsePayload {
  success: boolean;
  translatedCount?: number;
  error?: ErrorPayload;
}

export interface RestoreActiveTabResponsePayload {
  success: boolean;
  restoredCount?: number;
  error?: ErrorPayload;
}

export interface ExecutePageTranslationResponsePayload {
  success: boolean;
  translatedCount?: number;
  error?: ErrorPayload;
}

export interface RestorePageTranslationResponsePayload {
  success: boolean;
  restoredCount?: number;
  error?: ErrorPayload;
}

/** Response mapping: message type → response payload */
export type ResponseMap = {
  TRANSLATE_REQUEST: TranslateResponsePayload;
  GET_SETTINGS: ExtensionSettings;
  UPDATE_SETTINGS: boolean;
  TRANSLATE_ACTIVE_TAB: TranslateActiveTabResponsePayload;
  RESTORE_ACTIVE_TAB: RestoreActiveTabResponsePayload;
  EXECUTE_PAGE_TRANSLATION: ExecutePageTranslationResponsePayload;
  RESTORE_PAGE_TRANSLATION: RestorePageTranslationResponsePayload;
  SAVE_VOCAB_ITEM: { success: boolean };
  GET_VOCAB_ITEMS: VocabularyItem[];
  DELETE_VOCAB_ITEM: boolean;
  CLEAR_VOCAB_ITEMS: boolean;
  GET_NETFLIX_STATE: NetflixStateInfo;
};

// ─── Broadcast Events (Background → All) ────────────────────────

export interface SettingsChangedEvent {
  type: 'SETTINGS_CHANGED';
  settings: ExtensionSettings;
}

export type BroadcastEvent = SettingsChangedEvent;

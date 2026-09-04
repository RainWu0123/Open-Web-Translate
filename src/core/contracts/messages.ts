/**
 * Typed Message Protocol
 * Uses discriminated unions for type-safe message passing between
 * content scripts, popup, options, and the background service worker.
 */
import type { LanguageCode } from './common';
import type { VocabularyItem } from '@/infrastructure/storage/indexeddb/schemas';

// ─── Limits & Error Constants ─────────────────────────────────────

export const PAYLOAD_LIMITS = {
  MAX_TARGETS: 50,
  MAX_CHARS_PER_SEGMENT: 3000,
  MAX_TOTAL_CHARS: 25000,
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
  sourceLanguage: string;
  targetLanguage: string;
  enabled: boolean;
  defaultTranslationMode: 'fast' | 'quality';
  activeProviderId: string;
  geminiApiKey?: string;
  geminiApiKeyMasked?: string;
  hasGeminiApiKey?: boolean;
  geminiModel?: string;
  /** User-authored style/terminology guidance appended to prompt-aware AI providers. */
  aiTranslationInstructions?: string;
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
  /** 'auto' prefers a native track matching the target language; 'manual' is a user pick (incl. AI-only). */
  selectionMode?: 'auto' | 'manual';
  /** Downloadable tracks for the popup selector. */
  tracks?: Array<{ id: string; label: string; isCC: boolean }>;
  secondaryCuesCount?: number;
  learningMode?: boolean;
  dualTrack?: boolean;
}

// ─── Messages (Content/Popup/Options → Background/Tab) ────────────

export interface TranslateRequestMessage {
  type: 'TRANSLATE_REQUEST';
  segments: Array<{ id: string; text: string }>;
  sourceLanguage: string;
  targetLanguage: string;
  forceProvider?: string;
  context?: {
    previous?: Array<{ source: string; translation: string }>;
  };
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

export interface SetNetflixSelectionMessage {
  type: 'SET_NETFLIX_SELECTION';
  source: 'auto' | 'ai' | 'track';
  trackId?: string;
}

export interface SetNetflixActiveMessage {
  type: 'SET_NETFLIX_ACTIVE';
  active: boolean;
}

export interface YoutubeTrackInfo {
  id: string;
  label: string;
  languageCode: string;
  kind?: string;
  isDefault?: boolean;
}

export interface YoutubeStateInfo {
  isActive: boolean;
  tracks?: YoutubeTrackInfo[];
  selectedTrackId?: string | null;
}

export interface GetYoutubeStateMessage {
  type: 'GET_YOUTUBE_STATE';
}

export interface SetYoutubeActiveMessage {
  type: 'SET_YOUTUBE_ACTIVE';
  active: boolean;
}

export interface SetYoutubeTrackMessage {
  type: 'SET_YOUTUBE_TRACK';
  trackId: string;
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
  | GetNetflixStateMessage
  | SetNetflixSelectionMessage
  | SetNetflixActiveMessage
  | GetYoutubeStateMessage
  | SetYoutubeActiveMessage
  | SetYoutubeTrackMessage;

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
  GET_NETFLIX_STATE: NetflixStateInfo | null;
  SET_NETFLIX_SELECTION: boolean;
  SET_NETFLIX_ACTIVE: boolean;
  GET_YOUTUBE_STATE: YoutubeStateInfo | null;
  SET_YOUTUBE_ACTIVE: boolean;
  SET_YOUTUBE_TRACK: boolean;
};

// ─── Broadcast Events (Background → All) ────────────────────────

export interface SettingsChangedEvent {
  type: 'SETTINGS_CHANGED';
  settings: ExtensionSettings;
}

export type BroadcastEvent = SettingsChangedEvent;

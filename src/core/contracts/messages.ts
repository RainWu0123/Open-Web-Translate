/**
 * Typed Message Protocol
 * Uses discriminated unions for type-safe message passing between
 * content scripts, popup, options, and the background service worker.
 */
import type { LanguageCode } from './common';
import type { VocabularyItem } from '@/infrastructure/storage/indexeddb/schemas';
import type {
  WordAnalysisResult,
  GrammarExplanation,
  LearningCard,
  SrsGrade,
} from '@/core/domain/learning-types';

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
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  ABORTED = 'ABORTED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface ErrorPayload {
  code: MessageErrorCode | string;
  message: string;
  details?: unknown;
  providerId?: string;
  retryable?: boolean;
}

// ─── Settings ────────────────────────────────────────────────────

/** Extension settings persisted in browser storage */
export interface ExtensionSettings {
  theme?: 'light' | 'dark' | 'system';
  sourceLanguage: string;
  targetLanguage: string;
  enabled: boolean;
  defaultTranslationMode: 'fast' | 'quality';
  activeProviderId: string;
  /**
   * Version of the first-run remote data-transfer notice acknowledged by the user.
   * A value of 0 is used only for brand-new installs before acknowledgement.
   * Undefined is treated as legacy/pre-notice state for backwards compatibility.
   */
  remoteProviderDisclosureVersion?: number;
  geminiApiKeyMasked?: string;
  hasGeminiApiKey?: boolean;
  geminiModel?: string;
  /** User-authored style/terminology guidance appended to prompt-aware AI providers. */
  aiTranslationInstructions?: string;
  deeplApiKeyMasked?: string;
  hasDeeplApiKey?: boolean;
  deeplApiIsPro?: boolean;
  displayMode?: 'bilingual' | 'translation-first' | 'immersive';
  uiLanguage?: 'auto' | 'zh-Hant' | 'zh-Hans' | 'en' | 'ja';
  showFloatingButton?: boolean;
  subtitleOriginalFontSize?: number;
  subtitleTranslatedFontSize?: number;
  subtitleOriginalColor?: string;
  subtitleTranslatedColor?: string;
  ollamaEndpoint?: string;
  ollamaModel?: string;
  ollamaTemperature?: number;
  localHttpEndpoint?: string;
  localHttpApiKeyMasked?: string;
  hasLocalHttpApiKey?: boolean;
  localHttpModel?: string;
  customHttpEndpoint?: string;
  customHttpApiKeyMasked?: string;
  hasCustomHttpApiKey?: boolean;
  customHttpModel?: string;
  openRouterApiKeyMasked?: string;
  hasOpenRouterApiKey?: boolean;
  openRouterModel?: string;
  nvidiaNimEndpoint?: string;
  nvidiaNimApiKeyMasked?: string;
  hasNvidiaNimApiKey?: boolean;
  nvidiaNimModel?: string;
  smartBlurSubtitles?: boolean;
  /** Netflix subtitle card settings; persisted inside the single settings store. */
  netflix?: NetflixConfig;
}

export interface SecretSettings {
  geminiApiKey?: string;
  deeplApiKey?: string;
  localHttpApiKey?: string;
  customHttpApiKey?: string;
  openRouterApiKey?: string;
  nvidiaNimApiKey?: string;
}

export type InternalExtensionSettings = ExtensionSettings & SecretSettings;
export type ApiKeyProvider =
  | 'gemini'
  | 'deepl'
  | 'local-http'
  | 'custom-http'
  | 'openrouter'
  | 'nvidia-nim';

export interface NetflixConfig {
  enabled: boolean;
  primarySize: number;
  secondarySize: number;
  bottomPosition: number;
  lineSpacing: number;
  enableBitmapRescue: boolean;
  learningMode: boolean;
  autoPause?: boolean;
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
  translationMode?: 'native' | 'prefetch' | 'loading' | 'realtime';
  prefetchedCount?: number;
  dualTrack?: boolean;
}

// ─── Messages (Content/Popup/Options → Background/Tab) ────────────

export interface TranslateRequestMessage {
  type: 'TRANSLATE_REQUEST';
  bypassCache?: boolean;
  segments: Array<{ id: string; text: string }>;
  sourceLanguage: string;
  targetLanguage: string;
  forceProvider?: string;
  context?: {
    title?: string;
    previousText?: string;
    nextText?: string;
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

export interface SetApiKeyMessage {
  type: 'SET_API_KEY';
  provider: ApiKeyProvider;
  apiKey: string;
}

export interface ClearApiKeyMessage {
  type: 'CLEAR_API_KEY';
  provider: ApiKeyProvider;
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
  translation?: string;
  meaning?: string;
  lemma?: string;
  pos?: string;
  phonetic?: string;
  context?: string;
  contextSentence?: string;
  contextTranslation?: string;
  mediaTimestampMs?: number;
  mediaTitle?: string;
  url?: string;
  sourceUrl?: string;
  sourceLang?: string;
  targetLang?: string;
  tags?: string[];
}

export interface AnalyzeWordMessage {
  type: 'ANALYZE_WORD';
  word: string;
  sentence: string;
  sourceLang: string;
  targetLang: string;
}

export interface ExplainGrammarMessage {
  type: 'EXPLAIN_GRAMMAR';
  sentence: string;
  focusWord?: string;
  sourceLang: string;
  targetLang: string;
}

export interface RecordSrsReviewMessage {
  type: 'RECORD_SRS_REVIEW';
  id: string;
  grade: SrsGrade;
}

export interface GetDueCardsMessage {
  type: 'GET_DUE_CARDS';
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
  | SetApiKeyMessage
  | ClearApiKeyMessage
  | TranslateActiveTabMessage
  | RestoreActiveTabMessage
  | ExecutePageTranslationMessage
  | RestorePageTranslationMessage
  | SaveVocabItemMessage
  | GetVocabItemsMessage
  | DeleteVocabItemMessage
  | ClearVocabItemsMessage
  | AnalyzeWordMessage
  | ExplainGrammarMessage
  | RecordSrsReviewMessage
  | GetDueCardsMessage
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
  SET_API_KEY: boolean;
  CLEAR_API_KEY: boolean;
  TRANSLATE_ACTIVE_TAB: TranslateActiveTabResponsePayload;
  RESTORE_ACTIVE_TAB: RestoreActiveTabResponsePayload;
  EXECUTE_PAGE_TRANSLATION: ExecutePageTranslationResponsePayload;
  RESTORE_PAGE_TRANSLATION: RestorePageTranslationResponsePayload;
  SAVE_VOCAB_ITEM: { success: boolean };
  GET_VOCAB_ITEMS: LearningCard[];
  DELETE_VOCAB_ITEM: boolean;
  CLEAR_VOCAB_ITEMS: boolean;
  ANALYZE_WORD: WordAnalysisResult;
  EXPLAIN_GRAMMAR: GrammarExplanation;
  RECORD_SRS_REVIEW: LearningCard;
  GET_DUE_CARDS: LearningCard[];
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

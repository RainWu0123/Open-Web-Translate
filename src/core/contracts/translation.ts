import type { ProviderId, LanguageCode, SegmentId } from './common';
import type { ResolvedGlossary } from './glossary';

/** Translation processing mode */
export type TranslationMode = "fast" | "quality";

/** A segment to be translated */
export interface TranslationSegment {
  id: SegmentId;
  text: string;
}

/** A translated segment */
export interface TranslatedSegment {
  id: SegmentId;
  text: string;
}

/** Additional context for translation */
export interface TranslationContext {
  url?: string;
  title?: string;
  previousText?: string;
  nextText?: string;
}

/** Token or character usage statistics */
export interface TokenOrCharacterUsage {
  tokens?: number;
  characters?: number;
  costEstimate?: number;
}

/** Non-fatal translation warning */
export interface TranslationWarning {
  code: string;
  message: string;
}

/** Request object for provider translation */
export interface TranslationRequest {
  segments: TranslationSegment[];
  sourceLanguage: LanguageCode | "auto";
  targetLanguage: LanguageCode;
  glossary?: ResolvedGlossary;
  context?: TranslationContext;
  signal?: AbortSignal;
  mode: TranslationMode;
}

/** Result object from provider translation */
export interface TranslationResult {
  providerId: ProviderId;
  segments: TranslatedSegment[];
  usage?: TokenOrCharacterUsage;
  warnings: TranslationWarning[];
  cacheable: boolean;
}

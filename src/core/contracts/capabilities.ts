import type { LanguageCode } from './common';

/**
 * Defines the capabilities of a translation provider.
 */
export interface ProviderCapabilities {
  /**
   * Whether the provider supports streaming results.
   */
  readonly streaming: boolean;
  
  /**
   * Whether the provider supports custom glossaries.
   */
  readonly glossary: boolean;
  
  /**
   * Whether the provider can use additional context for translation.
   */
  readonly context: boolean;
  
  /**
   * The maximum number of segments the provider can translate in a single request.
   */
  readonly maxSegments: number;
  
  /**
   * List of supported languages. If undefined, all languages are considered supported.
   */
  readonly supportedLanguages?: LanguageCode[];
}

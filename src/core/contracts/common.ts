/**
 * A unique identifier for a translation provider.
 */
export type ProviderId = string & { readonly __brand: unique symbol };

/**
 * A unique identifier for a site adapter.
 */
export type SiteAdapterId = string & { readonly __brand: unique symbol };

/**
 * ISO 639-1 or ISO 639-3 language code.
 */
export type LanguageCode = string & { readonly __brand: unique symbol };

/**
 * Unique identifier for a segment.
 */
export type SegmentId = string & { readonly __brand: unique symbol };

import type { SiteAdapterId, SegmentId } from './common';

/** Extracted context from a page */
export interface ExtractedPage {
  lang: string;
  content: string;
}

/** A specific target for translation on the page */
export interface TranslationTarget {
  id: SegmentId;
  node: Node;
  text: string;
}

/** Constraints for rendering translations */
export interface RenderingConstraints {
  maxHeight?: string;
  maxWidth?: string;
  allowedTags?: string[];
  theme?: 'light' | 'dark' | 'auto';
}

/** Adapter for site-specific logic */
export interface SiteAdapter {
  readonly id: SiteAdapterId;
  readonly priority: number;
  matches(url: URL, document: Document): boolean;
  extractPage(document: Document): ExtractedPage | null;
  getTranslationTargets(document: Document): TranslationTarget[];
  getRenderingConstraints?(document: Document): RenderingConstraints;
}

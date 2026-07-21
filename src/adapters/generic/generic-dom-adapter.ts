/**
 * General Web Page DOM Translation Adapter
 *
 * Default SiteAdapter implementation for translating generic web pages.
 * Handles extraction of translatable HTML content blocks and selected text,
 * and renders bilingual / inline translated blocks using isolated Shadow DOM.
 */
import type {
  SiteAdapter,
  ExtractedPage,
  TranslationTarget,
  RenderingConstraints,
} from '@/core/contracts/site-adapter';
import type { SiteAdapterId, SegmentId } from '@/core/contracts/common';
import {
  extractTranslatableTargets,
  extractFromSelection,
  type ExtractedTarget,
} from '@/features/page-translation/extractor/dom-extractor';
import {
  renderBilingualBlock,
  renderInlineHost,
  removeAllBilingualBlocks,
  type DisplayMode,
} from '@/features/page-translation/renderer/shadow-renderer';
import { createLogger } from '@/shared/logger';

const logger = createLogger('GenericDomAdapter');

export interface TranslationExecutionOptions {
  targetLanguage: string;
  displayMode?: DisplayMode;
  translateFn: (
    segments: Array<{ id: string; text: string }>,
  ) => Promise<Array<{ id: string; translatedText: string }>>;
}

export class GenericDomAdapter implements SiteAdapter {
  readonly id = 'generic-dom-adapter' as SiteAdapterId;
  readonly priority = 0; // Default fallback adapter

  /**
   * Matches any standard web document
   */
  matches(_url: URL, _document: Document): boolean {
    return true;
  }

  /**
   * Extract basic page content summary
   */
  extractPage(doc: Document = document): ExtractedPage | null {
    const lang = doc.documentElement.lang || 'auto';
    const title = doc.title || '';
    const mainBody = doc.body ? doc.body.textContent || '' : '';
    return {
      lang,
      content: `${title}\n${mainBody.slice(0, 1000)}`,
    };
  }

  /**
   * Returns array of translatable DOM node targets on the page
   */
  getTranslationTargets(doc: Document = document): TranslationTarget[] {
    const res = extractTranslatableTargets(doc);
    if (!res.success) return [];

    return res.targets.map((t) => ({
      id: t.id as SegmentId,
      node: t.element,
      text: t.text,
    }));
  }

  /**
   * Default rendering constraints for web pages
   */
  getRenderingConstraints(_document: Document = document): RenderingConstraints {
    return {
      theme: 'auto',
      allowedTags: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'div', 'blockquote', 'span'],
    };
  }

  /**
   * Translates extracted HTML content blocks on the page and renders bilingual Shadow DOM blocks.
   */
  async translatePage(
    doc: Document = document,
    options: TranslationExecutionOptions,
  ): Promise<{ success: boolean; translatedCount: number; targets?: ExtractedTarget[] }> {
    logger.info('Executing page DOM translation via GenericDomAdapter');

    const extractResult = extractTranslatableTargets(doc);
    if (!extractResult.success) {
      logger.warn('No translatable targets found by GenericDomAdapter');
      return { success: false, translatedCount: 0 };
    }

    const { targets } = extractResult;
    removeAllBilingualBlocks(doc);

    const segments = targets.map((t) => ({ id: t.id, text: t.text }));
    const translatedSegments = await options.translateFn(segments);
    const translationMap = new Map(translatedSegments.map((s) => [s.id, s.translatedText]));

    targets.forEach((target) => {
      const translatedText = translationMap.get(target.id) || '[翻譯不可用]';
      renderBilingualBlock(
        target.element,
        target.id,
        target.text,
        translatedText,
        options.displayMode || 'bilingual',
        target.tagMap,
      );
    });

    logger.info(`Successfully translated ${targets.length} HTML content blocks via Shadow DOM`);
    return {
      success: true,
      translatedCount: targets.length,
      targets,
    };
  }

  /**
   * Translates active user selection (or specified Range) and renders inline Shadow DOM host.
   */
  async translateSelection(
    selectionOrRange: Selection | Range,
    doc: Document = document,
    options: TranslationExecutionOptions,
  ): Promise<{ success: boolean; translatedText?: string; host?: HTMLElement }> {
    logger.info('Executing selection DOM translation via GenericDomAdapter');

    const extractResult = extractFromSelection(selectionOrRange, doc);
    if (!extractResult.success || extractResult.targets.length === 0) {
      logger.warn('Selection extraction failed', extractResult.success === false ? extractResult.error : null);
      return { success: false };
    }

    const target = extractResult.targets[0];
    const translatedSegments = await options.translateFn([{ id: target.id, text: target.text }]);
    const translatedText = translatedSegments[0]?.translatedText || '[翻譯不可用]';

    const host = target.isInline
      ? renderInlineHost(
          target.element,
          target.id,
          target.text,
          translatedText,
          options.displayMode || 'bilingual',
          target.tagMap,
        )
      : renderBilingualBlock(
          target.element,
          target.id,
          target.text,
          translatedText,
          options.displayMode || 'bilingual',
          target.tagMap,
        );

    logger.info('Selection translation rendered in Shadow DOM successfully');
    return {
      success: true,
      translatedText,
      host,
    };
  }

  /**
   * Restores page DOM state by removing all injected OWT Shadow DOM blocks.
   */
  restorePage(doc: Document = document): number {
    const count = removeAllBilingualBlocks(doc);
    logger.info(`GenericDomAdapter restored ${count} Shadow DOM translation blocks`);
    return count;
  }
}

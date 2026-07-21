import {
  PAYLOAD_LIMITS,
  MessageErrorCode,
  type ErrorPayload,
} from '@/core/contracts/messages';
import {
  encodeInlineTags,
  type TagInfo,
} from './tag-preservation';

export interface ExtractedTarget {
  id: string;
  element: Element;
  text: string;
  tagMap?: Map<number, TagInfo>;
  isInline?: boolean;
}

export type ExtractionResult =
  | { success: true; targets: ExtractedTarget[] }
  | { success: false; error: ErrorPayload };

/**
 * Deterministic hash function for creating stable SegmentIds
 */
function fnv32a(str: string): string {
  let hval = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hval ^= str.charCodeAt(i);
    hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
  }
  return (hval >>> 0).toString(36);
}

/**
 * Generates a stable deterministic SegmentId for a given element, index, and text content.
 */
export function generateSegmentId(el: Element, index: number, text: string): string {
  const tag = el.tagName ? el.tagName.toLowerCase() : 'node';
  const hash = fnv32a(`${tag}:${text.slice(0, 100)}`);
  return `seg-${index}-${tag}-${hash}`;
}

/**
 * Determines whether an element is visible in the DOM.
 */
export function isElementVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;

  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  // JSDOM environment does not perform layout calculation, so offsetParent and getClientRects are empty.
  const isJSDOM =
    typeof navigator !== 'undefined' &&
    navigator.userAgent &&
    navigator.userAgent.toLowerCase().includes('jsdom');

  if (!isJSDOM) {
    if (el.offsetParent === null && style.position !== 'fixed') {
      return false;
    }
    const rects = el.getClientRects();
    if (rects.length === 0) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if element or any ancestor matches excluded tags or OWT UI selectors.
 */
export function isExcludedElement(el: Element): boolean {
  const excludedSelector =
    'script, style, nav, header, footer, aside, form, button, input, textarea, code, pre, .owt-bilingual-host, .owt-inline-host, #owt-badge-host';

  if (el.closest && el.closest(excludedSelector)) {
    return true;
  }

  let parent: Element | null = el;
  while (parent) {
    if (
      parent.classList?.contains('owt-bilingual-host') ||
      parent.classList?.contains('owt-inline-host') ||
      parent.id?.includes('owt') ||
      parent.className?.toString().includes('owt')
    ) {
      return true;
    }
    parent = parent.parentElement;
  }

  return false;
}

const BLOCK_CANDIDATE_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, td, div, blockquote, article';

/**
 * Returns true if an element contains child block candidate elements.
 * Used to avoid selecting parent container elements when their children will be extracted.
 */
function hasChildBlockCandidates(el: Element): boolean {
  const childBlocks = el.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, article, section, div');
  return childBlocks.length > 0;
}

/**
 * Core extraction function for block elements from candidate list
 */
function extractFromCandidateList(candidates: Element[]): ExtractionResult {
  const validTargets: ExtractedTarget[] = [];
  let totalChars = 0;

  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];

    if (isExcludedElement(el)) continue;
    if (!isElementVisible(el)) continue;
    if (hasChildBlockCandidates(el)) continue;

    const { textWithPlaceholders, tagMap } = encodeInlineTags(el);
    const text = textWithPlaceholders.trim();
    if (!text) continue;

    if (text.length > PAYLOAD_LIMITS.MAX_CHARS_PER_SEGMENT) {
      continue;
    }

    if (totalChars + text.length > PAYLOAD_LIMITS.MAX_TOTAL_CHARS) {
      break;
    }

    const segId = generateSegmentId(el, validTargets.length, text);
    validTargets.push({
      id: segId,
      element: el,
      text,
      tagMap: tagMap.size > 0 ? tagMap : undefined,
    });

    totalChars += text.length;

    if (validTargets.length >= PAYLOAD_LIMITS.MAX_TARGETS) {
      break;
    }
  }

  if (validTargets.length === 0) {
    return {
      success: false,
      error: {
        code: MessageErrorCode.NO_TARGETS_FOUND,
        message: 'No translatable elements found on current page',
      },
    };
  }

  return {
    success: true,
    targets: validTargets,
  };
}

/**
 * Extracts visible non-empty translatable block elements from document.
 * Prioritizes semantic article content roots (main article, article, main) over arbitrary page containers.
 */
export function extractTranslatableTargets(doc: Document = document): ExtractionResult {
  const articleRoot =
    doc.querySelector('main article') ||
    doc.querySelector('article') ||
    doc.querySelector('main') ||
    doc.body;

  const candidateElements = Array.from(
    (articleRoot || doc).querySelectorAll(BLOCK_CANDIDATE_SELECTOR),
  );
  return extractFromCandidateList(candidateElements);
}

/**
 * Extracts translatable targets from a user selection range (Selection or Range)
 */
export function extractFromSelection(
  selectionOrRange: Selection | Range,
  _doc: Document = document,
): ExtractionResult {
  let range: Range | null = null;
  if ('getRangeAt' in selectionOrRange) {
    if (selectionOrRange.rangeCount > 0) {
      range = selectionOrRange.getRangeAt(0);
    }
  } else {
    range = selectionOrRange;
  }

  if (!range || range.collapsed) {
    return {
      success: false,
      error: {
        code: MessageErrorCode.NO_TARGETS_FOUND,
        message: 'No active text selection',
      },
    };
  }

  const selectedText = range.toString().trim();
  if (!selectedText) {
    return {
      success: false,
      error: {
        code: MessageErrorCode.NO_TARGETS_FOUND,
        message: 'Selected text is empty',
      },
    };
  }

  const container = range.commonAncestorContainer;
  const rootEl =
    container.nodeType === Node.ELEMENT_NODE
      ? (container as Element)
      : container.parentElement;

  if (!rootEl || isExcludedElement(rootEl)) {
    return {
      success: false,
      error: {
        code: MessageErrorCode.NO_TARGETS_FOUND,
        message: 'Selection container element invalid or excluded',
      },
    };
  }

  const { textWithPlaceholders, tagMap } = encodeInlineTags(rootEl);
  const textToUse =
    tagMap.size > 0 && textWithPlaceholders.includes(selectedText)
      ? textWithPlaceholders
      : selectedText;

  const segId = generateSegmentId(rootEl, 0, selectedText);
  return {
    success: true,
    targets: [
      {
        id: segId,
        element: rootEl,
        text: textToUse,
        tagMap: tagMap.size > 0 ? tagMap : undefined,
        isInline: true,
      },
    ],
  };
}

/**
 * Extracts main article block elements (p, h1-h6, li, td, div, blockquote) from semantic article containers
 */
export function extractArticleBlocks(doc: Document = document): ExtractionResult {
  const articles = Array.from(
    doc.querySelectorAll('article, [role="article"], .article, main, [role="main"], section'),
  );
  let candidates: Element[] = [];

  if (articles.length > 0) {
    articles.forEach((art) => {
      candidates.push(...Array.from(art.querySelectorAll(BLOCK_CANDIDATE_SELECTOR)));
    });
  }

  if (candidates.length === 0) {
    candidates = Array.from(doc.querySelectorAll(BLOCK_CANDIDATE_SELECTOR));
  }

  return extractFromCandidateList(candidates);
}

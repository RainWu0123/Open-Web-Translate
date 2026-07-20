import {
  PAYLOAD_LIMITS,
  MessageErrorCode,
  type ErrorPayload,
} from '@/core/contracts/messages';

export interface ExtractedTarget {
  id: string;
  element: Element;
  text: string;
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
  const tag = el.tagName.toLowerCase();
  const hash = fnv32a(`${tag}:${text.slice(0, 100)}`);
  return `seg-${index}-${tag}-${hash}`;
}

/**
 * Determines whether an element is visible in the DOM.
 */
function isElementVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;

  // Exclude hidden elements (offsetParent === null or getComputedStyle display:none / visibility:hidden)
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  // Position fixed elements have offsetParent === null but may be visible
  if (el.offsetParent === null && style.position !== 'fixed') {
    return false;
  }

  // Check client rects to ensure non-zero size
  const rects = el.getClientRects();
  if (rects.length === 0) {
    return false;
  }

  return true;
}

/**
 * Checks if element or any ancestor matches excluded tags or OWT UI selectors.
 */
function isExcludedElement(el: Element): boolean {
  const excludedSelector =
    'script, style, nav, header, footer, aside, form, button, input, textarea, code, pre, .owt-bilingual-host, #owt-badge-host';

  if (el.closest(excludedSelector)) {
    return true;
  }

  // Additional check for OWT Shadow DOM host or OWT UI classes
  let parent: Element | null = el;
  while (parent) {
    if (
      parent.classList?.contains('owt-bilingual-host') ||
      parent.id?.includes('owt') ||
      parent.className?.toString().includes('owt')
    ) {
      return true;
    }
    parent = parent.parentElement;
  }

  return false;
}

/**
 * Extracts visible non-empty translatable targets (p, h1, h2, h3) from document
 * and validates payload limits.
 */
export function extractTranslatableTargets(doc: Document = document): ExtractionResult {
  const candidateElements = Array.from(doc.querySelectorAll('p, h1, h2, h3'));

  const validTargets: ExtractedTarget[] = [];
  let totalChars = 0;

  for (let i = 0; i < candidateElements.length; i++) {
    const el = candidateElements[i];

    if (isExcludedElement(el)) continue;
    if (!isElementVisible(el)) continue;

    const text = (el.textContent || '').trim();
    if (!text) continue;

    // Skip segments exceeding max chars per segment
    if (text.length > PAYLOAD_LIMITS.MAX_CHARS_PER_SEGMENT) {
      continue;
    }

    // Stop adding if total chars would exceed max limit
    if (totalChars + text.length > PAYLOAD_LIMITS.MAX_TOTAL_CHARS) {
      break;
    }

    const segId = generateSegmentId(el, validTargets.length, text);
    validTargets.push({
      id: segId,
      element: el,
      text,
    });

    totalChars += text.length;

    // Stop if we reach max targets limit (30)
    if (validTargets.length >= PAYLOAD_LIMITS.MAX_TARGETS) {
      break;
    }
  }

  // Check zero targets
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

import { QuotaExceededError } from '../../src/core/domain/errors/translation-errors';
import type { TranslateRequestMessage, TranslateResponsePayload } from '../../src/core/contracts/messages';

export interface TranslationOptions {
  minParagraphLength?: number;
  maxParagraphLength?: number;
  maxTotalCharacters?: number;
  providerFail?: boolean;
}

export interface SegmentMap {
  id: string;
  element: Element;
  text: string;
}

export class DOMTranslatorEngine {
  private minLength: number;
  private maxLength: number;
  private maxTotalChars: number;

  constructor(options: TranslationOptions = {}) {
    this.minLength = options.minParagraphLength ?? 15;
    this.maxLength = options.maxParagraphLength ?? 5000;
    this.maxTotalChars = options.maxTotalCharacters ?? 10000;
  }

  /**
   * Check if an element or any of its ancestors should be excluded from translation.
   */
  isExcluded(element: Element): boolean {
    const excludedTags = new Set([
      'NAV', 'FOOTER', 'CODE', 'PRE', 'SCRIPT', 'STYLE',
      'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'
    ]);

    let curr: Element | null = element;
    while (curr && curr !== document.body && curr !== document.documentElement) {
      if (excludedTags.has(curr.tagName)) {
        return true;
      }
      if (curr.hasAttribute('hidden') || curr.getAttribute('aria-hidden') === 'true') {
        return true;
      }
      if (curr.hasAttribute('data-owt-ignore') || curr.id === 'owt-badge-host' || curr.classList.contains('owt-bilingual-host')) {
        return true;
      }
      const style = curr.getAttribute('style') || '';
      if (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style)) {
        return true;
      }
      if (typeof window !== 'undefined' && window.getComputedStyle) {
        try {
          const comp = window.getComputedStyle(curr);
          if (comp.display === 'none' || comp.visibility === 'hidden') {
            return true;
          }
        } catch (_) {
          // Fallback if getComputedStyle fails or in basic JS environments
        }
      }
      curr = curr.parentElement;
    }
    return false;
  }

  /**
   * Check if element is a valid target element (p, h1, h2, h3) and not excluded.
   */
  isValidTarget(element: Element): boolean {
    const validTags = new Set(['P', 'H1', 'H2', 'H3']);
    if (!validTags.has(element.tagName)) {
      return false;
    }
    if (element.getAttribute('data-owt-translated') === 'true') {
      return false;
    }
    return !this.isExcluded(element);
  }

  /**
   * Select target elements from document root and generate stable segment mappings.
   */
  selectTargets(root: Document | Element = document): SegmentMap[] {
    const candidates = Array.from(root.querySelectorAll('p, h1, h2, h3'));
    const segments: SegmentMap[] = [];

    let totalChars = 0;

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (!this.isValidTarget(el)) continue;

      const text = el.textContent?.trim() || '';
      if (text.length <= this.minLength) {
        continue;
      }
      if (text.length > this.maxLength) {
        continue;
      }

      totalChars += text.length;

      // Assign stable segment ID if not already assigned
      let segmentId = el.getAttribute('data-owt-segment-id');
      if (!segmentId) {
        segmentId = `seg-${i + 1}-${text.substring(0, 8).replace(/\s+/g, '_')}`;
        el.setAttribute('data-owt-segment-id', segmentId);
      }

      segments.push({
        id: segmentId,
        element: el,
        text,
      });
    }

    if (totalChars > this.maxTotalChars) {
      throw new QuotaExceededError(
        `Total character count (${totalChars}) exceeds configured limit (${this.maxTotalChars})`
      );
    }

    return segments;
  }

  /**
   * Build typed message request for background service worker.
   */
  buildTranslationRequest(segments: SegmentMap[], targetLang = 'en'): TranslateRequestMessage {
    return {
      type: 'TRANSLATE_REQUEST',
      segments: segments.map((s) => ({ id: s.id, text: s.text })),
      sourceLanguage: 'auto',
      targetLanguage: targetLang,
    };
  }

  /**
   * Apply translation response payload to DOM nodes.
   */
  applyTranslations(segments: SegmentMap[], response: TranslateResponsePayload): void {
    const resMap = new Map(response.segments.map((s) => [s.id, s.translatedText]));

    for (const seg of segments) {
      if (seg.element.getAttribute('data-owt-translated') === 'true') {
        continue; // Idempotency check
      }

      const translatedText = resMap.get(seg.id) || '[Translation Unavailable]';
      this.injectBilingualBlock(seg.element, seg.text, translatedText);
      seg.element.setAttribute('data-owt-translated', 'true');
    }
  }

  /**
   * Inject Shadow DOM bilingual block.
   */
  injectBilingualBlock(originalEl: Element, originalText: string, translatedText: string): void {
    const host = document.createElement('div');
    host.className = 'owt-bilingual-host';
    host.setAttribute('data-owt-ignore', 'true');
    originalEl.insertAdjacentElement('afterend', host);

    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      .owt-block { margin: 10px 0; padding: 10px; border-left: 3px solid #667eea; background: rgba(102, 126, 234, 0.05); }
      .owt-original { font-size: 14px; color: #333; }
      .owt-translated { font-size: 14px; color: #667eea; margin-top: 4px; }
    `;
    shadow.appendChild(style);

    const block = document.createElement('div');
    block.className = 'owt-block';

    const orig = document.createElement('div');
    orig.className = 'owt-original';
    orig.textContent = originalText;

    const trans = document.createElement('div');
    trans.className = 'owt-translated';
    trans.textContent = translatedText;

    block.appendChild(orig);
    block.appendChild(trans);
    shadow.appendChild(block);
  }

  /**
   * Completely restore page by removing all injected OWT Shadow DOM hosts and attributes.
   */
  restore(root: Document | Element = document): void {
    const hosts = root.querySelectorAll('.owt-bilingual-host, #owt-badge-host');
    hosts.forEach((host) => host.remove());

    const translatedEls = root.querySelectorAll('[data-owt-translated]');
    translatedEls.forEach((el) => {
      el.removeAttribute('data-owt-translated');
      el.removeAttribute('data-owt-segment-id');
    });
  }
}

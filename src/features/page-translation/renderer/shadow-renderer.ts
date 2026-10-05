/**
 * Renders inline translation results using Shadow DOM isolation and multi-mode layouts.
 * Supports:
 * - BlockHost: `<div class="owt-bilingual-host">` for block elements
 * - InlineHost: `<span class="owt-inline-host">` for selection / inline phrase translation
 *
 * Visual Modes for Block Host:
 * - bilingual (default): Untouched original text + translation block below
 * - translation-first: Original text muted via OWT CSS class + translation block below
 * - immersive: Original text hidden via OWT CSS class + translation block with accessible toggle button
 *
 * Guarantees idempotency and complete cleanup on restore without modifying site inline styles.
 */

import { restoreInlineTagsToHTML, type TagInfo } from '../extractor/tag-preservation';

export type DisplayMode = 'bilingual' | 'translation-first' | 'immersive';

function usesContainedTranslationHost(originalEl: Element): boolean {
  const tag = originalEl.tagName.toLowerCase();
  return tag === 'td' || tag === 'th' || tag === 'li';
}

function findContainedHost(originalEl: Element, className: string): HTMLElement | null {
  return (Array.from(originalEl.children).find((child) =>
    child.classList.contains(className),
  ) as HTMLElement | undefined) ?? null;
}

/** Ensure global OWT document styles are injected for source element visual modes */
function ensureGlobalOWTStyles(doc: Document = document): void {
  if (doc.getElementById('owt-global-renderer-styles')) return;

  const styleNode = doc.createElement('style');
  styleNode.id = 'owt-global-renderer-styles';
  styleNode.textContent = `
    .owt-source-muted {
      opacity: 0.55 !important;
      font-style: italic !important;
    }
    .owt-source-hidden {
      display: none !important;
    }
  `;
  (doc.head || doc.documentElement).appendChild(styleNode);
}

/**
 * Renders bilingual block host (<div class="owt-bilingual-host">) using open Shadow DOM.
 */
export function renderBilingualBlock(
  originalEl: Element,
  segmentId: string,
  _originalText: string,
  translatedText: string,
  displayMode: DisplayMode = 'bilingual',
  tagMap?: Map<number, TagInfo>,
): HTMLElement {
  const doc = originalEl.ownerDocument || document;
  ensureGlobalOWTStyles(doc);

  const containedHost = usesContainedTranslationHost(originalEl);

  originalEl.classList.remove('owt-source-muted', 'owt-source-hidden');
  if (!containedHost && displayMode === 'translation-first') {
    originalEl.classList.add('owt-source-muted');
  } else if (!containedHost && displayMode === 'immersive') {
    originalEl.classList.add('owt-source-hidden');
  }

  let host: HTMLElement | null = containedHost
    ? findContainedHost(originalEl, 'owt-bilingual-host')
    : null;
  if (!containedHost) {
    const nextSib = originalEl.nextElementSibling;
    if (nextSib && nextSib.classList.contains('owt-bilingual-host')) host = nextSib as HTMLElement;
  }

  if (!host) {
    host = doc.createElement('div');
    host.className = 'owt-bilingual-host';

    try {
      const computed = window.getComputedStyle(originalEl);
      const parentDisplay = originalEl.parentElement
        ? window.getComputedStyle(originalEl.parentElement).display
        : '';

      const isLayoutSensitive =
        parentDisplay.includes('flex') ||
        parentDisplay.includes('grid') ||
        computed.display === 'inline' ||
        computed.display === 'inline-flex';

      if (isLayoutSensitive) {
        host.style.display = 'contents';
      }
    } catch {
      // ignore
    }

    if (containedHost) {
      originalEl.appendChild(host);
    } else if (originalEl.insertAdjacentElement) {
      originalEl.insertAdjacentElement('afterend', host);
    } else {
      originalEl.appendChild(host);
    }
  }

  host.setAttribute('data-owt-seg-id', segmentId);

  // Attach or reuse open shadow root
  let shadow: ShadowRoot;
  if (host.shadowRoot) {
    shadow = host.shadowRoot;
    shadow.innerHTML = '';
  } else {
    shadow = host.attachShadow({ mode: 'open' });
  }

  const style = doc.createElement('style');
  style.textContent = `
    /* \`all: initial\` must come first: it would otherwise reset display/color.
       Text colour is inherited from the page, so the translation is readable
       on both light and dark sites; chrome (rule, fill, border) is a
       translucent grey that works on either. */
    :host {
      all: initial;
      display: block;
      color: inherit;
    }
    .owt-block {
      margin: 2px 0 10px 0;
      padding: 8px 14px;
      border-left: 2px solid rgba(128, 128, 128, 0.7);
      background: rgba(128, 128, 128, 0.08);
      border-radius: 0 2px 2px 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
    }
    .owt-translated {
      font-weight: 600;
      color: inherit;
      font-size: 14px;
    }
    .owt-toggle-btn {
      display: inline-block;
      margin-top: 6px;
      background: transparent;
      border: 1px solid rgba(128, 128, 128, 0.6);
      color: inherit;
      opacity: 0.75;
      padding: 2px 8px;
      border-radius: 2px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s, opacity 0.2s;
    }
    .owt-toggle-btn:hover {
      background: rgba(128, 128, 128, 0.18);
      opacity: 1;
    }
    .owt-toggle-btn:focus-visible {
      background: rgba(128, 128, 128, 0.18);
      opacity: 1;
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
  `;
  shadow.appendChild(style);

  const block = doc.createElement('div');
  block.className = 'owt-block';

  const trans = doc.createElement('div');
  trans.className = 'owt-translated';

  const restoredHTML = restoreInlineTagsToHTML(translatedText, tagMap);
  if (tagMap && tagMap.size > 0) {
    trans.innerHTML = restoredHTML;
  } else {
    trans.textContent = translatedText;
  }
  block.appendChild(trans);

  // In immersive mode, add accessible button to toggle original text
  if (displayMode === 'immersive' && !containedHost) {
    const toggleBtn = doc.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'owt-toggle-btn';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.textContent = '顯示原文';

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCurrentlyHidden = originalEl.classList.contains('owt-source-hidden');
      if (isCurrentlyHidden) {
        originalEl.classList.remove('owt-source-hidden');
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.textContent = '隱藏原文';
      } else {
        originalEl.classList.add('owt-source-hidden');
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.textContent = '顯示原文';
      }
    });

    block.appendChild(toggleBtn);
  }

  shadow.appendChild(block);
  return host;
}

/**
 * Renders inline translation host (<span class="owt-inline-host">) for selection/inline ranges using open Shadow DOM.
 */
export function renderInlineHost(
  originalEl: Element,
  segmentId: string,
  _originalText: string,
  translatedText: string,
  _displayMode: DisplayMode = 'bilingual',
  tagMap?: Map<number, TagInfo>,
  range?: Range,
): HTMLElement {
  const doc = originalEl.ownerDocument || document;
  ensureGlobalOWTStyles(doc);

  let host: HTMLElement | null = (Array.from(
    doc.querySelectorAll('.owt-inline-host'),
  ).find((candidate) => candidate.getAttribute('data-owt-seg-id') === segmentId) as HTMLElement | undefined) ?? null;

  if (!host) {
    host = doc.createElement('span');
    host.className = 'owt-inline-host';
    if (range) {
      try {
        const insertionRange = range.cloneRange();
        insertionRange.collapse(false);
        insertionRange.insertNode(host);
      } catch {
        if (originalEl.insertAdjacentElement) originalEl.insertAdjacentElement('afterend', host);
        else originalEl.appendChild(host);
      }
    } else if (originalEl.insertAdjacentElement) {
      originalEl.insertAdjacentElement('afterend', host);
    } else {
      originalEl.appendChild(host);
    }
  }

  host.setAttribute('data-owt-seg-id', segmentId);

  let shadow: ShadowRoot;
  if (host.shadowRoot) {
    shadow = host.shadowRoot;
    shadow.innerHTML = '';
  } else {
    shadow = host.attachShadow({ mode: 'open' });
  }

  const style = doc.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      display: inline-block;
      color: inherit;
      font-size: inherit;
    }
    .owt-inline-badge {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      background: rgba(128, 128, 128, 0.12);
      color: inherit;
      border: 1px solid rgba(128, 128, 128, 0.5);
      border-radius: 2px;
      font-size: 0.9em;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
  `;
  shadow.appendChild(style);

  const span = doc.createElement('span');
  span.className = 'owt-inline-badge';

  const restoredHTML = restoreInlineTagsToHTML(translatedText, tagMap);
  if (tagMap && tagMap.size > 0) {
    span.innerHTML = ` (${restoredHTML})`;
  } else {
    span.textContent = ` (${translatedText})`;
  }

  shadow.appendChild(span);
  return host;
}

/**
 * Removes all inserted OWT Shadow DOM elements and OWT classes from the document.
 * Returns the count of removed elements.
 */
export function removeAllBilingualBlocks(doc: Document = document): number {
  const hosts = Array.from(doc.querySelectorAll('.owt-bilingual-host, .owt-inline-host'));
  hosts.forEach((host) => host.remove());

  const mutedEls = Array.from(doc.querySelectorAll('.owt-source-muted'));
  mutedEls.forEach((el) => el.classList.remove('owt-source-muted'));

  const hiddenEls = Array.from(doc.querySelectorAll('.owt-source-hidden'));
  hiddenEls.forEach((el) => el.classList.remove('owt-source-hidden'));

  const globalStyle = doc.getElementById('owt-global-renderer-styles');
  if (globalStyle) {
    globalStyle.remove();
  }

  return hosts.length;
}

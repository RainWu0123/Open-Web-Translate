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

  // Apply source element classes based on display mode
  originalEl.classList.remove('owt-source-muted', 'owt-source-hidden');
  if (displayMode === 'translation-first') {
    originalEl.classList.add('owt-source-muted');
  } else if (displayMode === 'immersive') {
    originalEl.classList.add('owt-source-hidden');
  }

  // Check if adjacent host already exists for idempotency
  let host: HTMLElement | null = null;
  const nextSib = originalEl.nextElementSibling;
  if (nextSib && nextSib.classList.contains('owt-bilingual-host')) {
    host = nextSib as HTMLElement;
  }

  if (!host) {
    host = doc.createElement('div');
    host.className = 'owt-bilingual-host';
    if (originalEl.insertAdjacentElement) {
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
    :host {
      display: block;
      all: initial;
    }
    .owt-block {
      margin: 2px 0 10px 0;
      padding: 8px 14px;
      border-left: 3px solid #667eea;
      background: rgba(102, 126, 234, 0.06);
      border-radius: 0 6px 6px 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
    }
    .owt-translated {
      font-weight: 600;
      color: #3b82f6;
      font-size: 14px;
    }
    .owt-toggle-btn {
      display: inline-block;
      margin-top: 6px;
      background: transparent;
      border: 1px solid rgba(102, 126, 234, 0.3);
      color: #667eea;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    }
    .owt-toggle-btn:hover, .owt-toggle-btn:focus {
      background: rgba(102, 126, 234, 0.15);
      outline: none;
    }
    @media (prefers-color-scheme: dark) {
      .owt-translated { color: #818cf8; }
      .owt-block { background: rgba(129, 140, 248, 0.1); }
      .owt-toggle-btn { color: #818cf8; border-color: rgba(129, 140, 248, 0.3); }
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
  if (displayMode === 'immersive') {
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
): HTMLElement {
  const doc = originalEl.ownerDocument || document;
  ensureGlobalOWTStyles(doc);

  let host: HTMLElement | null = null;
  const nextSib = originalEl.nextElementSibling;
  if (nextSib && nextSib.classList.contains('owt-inline-host')) {
    host = nextSib as HTMLElement;
  }

  if (!host) {
    host = doc.createElement('span');
    host.className = 'owt-inline-host';
    if (originalEl.insertAdjacentElement) {
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
      display: inline-block;
      all: initial;
    }
    .owt-inline-badge {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      background: #eff6ff;
      color: #2563eb;
      border: 1px solid #bfdbfe;
      border-radius: 4px;
      font-size: 0.9em;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      .owt-inline-badge {
        background: rgba(129, 140, 248, 0.15);
        color: #818cf8;
        border-color: rgba(129, 140, 248, 0.3);
      }
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

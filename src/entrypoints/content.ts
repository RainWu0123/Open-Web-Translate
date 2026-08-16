/**
 * Content Script
 *
 * Injected into all HTTP/HTTPS pages.
 * Displays an interactive OWT floating badge (3-state: idle/translating/translated),
 * listens for translation/restore commands from background,
 * and clears translation state on SPA navigation.
 */
import { browser } from 'wxt/browser';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { extensionBridge } from '@/infrastructure/messaging/extension-bridge';
import { GenericDomAdapter } from '@/adapters/generic/generic-dom-adapter';
import { MessageErrorCode, ErrorPayload } from '@/core/contracts/messages';
import { YouTubeCaptionAdapter } from '@/adapters/youtube/youtube-caption-adapter';
import { NetflixCaptionAdapter } from '@/adapters/netflix/netflix-caption-adapter';
import { createLogger } from '@/shared/logger';
import '../assets/netflix.css';
import '../assets/youtube.css';

const logger = createLogger('ContentScript');
const genericDomAdapter = new GenericDomAdapter();
const youtubeAdapter = new YouTubeCaptionAdapter();
const netflixAdapter = new NetflixCaptionAdapter();

/**
 * Inject netflix-main.js into the page MAIN world.
 * Safe at document_start: uses documentElement if head is not ready.
 * Idempotent via data attribute.
 */
function injectNetflixMainWorldScript(): void {
  try {
    if (document.documentElement?.getAttribute('data-owt-netflix-main') === '1') {
      return;
    }
    document.documentElement?.setAttribute('data-owt-netflix-main', '1');

    const scriptUrl = browser.runtime.getURL('netflix-main.js' as any);
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = false;
    script.onload = () => {
      script.remove();
      logger.info('netflix-main.js loaded into MAIN world');
    };
    script.onerror = () => {
      document.documentElement?.removeAttribute('data-owt-netflix-main');
      logger.warn('netflix-main.js failed to load; will not retry automatically');
    };
    (document.head || document.documentElement).appendChild(script);
    logger.info('Injected netflix-main.js into MAIN world');
  } catch (err) {
    logger.warn('Failed to inject netflix-main.js:', err);
  }
}

// ─── Badge State Machine ─────────────────────────────────────────
type BadgeState = 'idle' | 'translating' | 'translated';
let badgeState: BadgeState = 'idle';
let badgeHost: HTMLElement | null = null;
let badgeButton: HTMLButtonElement | null = null;

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_start',
  async main() {
    logger.info('Content script loaded on', window.location.href);

    const isNetflix = window.location.hostname.includes('netflix.com');
    const isYouTube = window.location.hostname.includes('youtube.com');

    // Initialize site-specific adapters if applicable
    if (isYouTube) {
      youtubeAdapter.init();
    } else if (isNetflix) {
      injectNetflixMainWorldScript();
      netflixAdapter.init();
    }

    // 1. Register message handlers and start listening IMMEDIATELY
    messageRouter.registerHandler('EXECUTE_PAGE_TRANSLATION', async () => {
      logger.info('Received EXECUTE_PAGE_TRANSLATION');
      return await executePageTranslation();
    });

    messageRouter.registerHandler('RESTORE_PAGE_TRANSLATION', async () => {
      logger.info('Received RESTORE_PAGE_TRANSLATION');
      return await executePageRestore();
    });

    messageRouter.registerHandler('EXECUTE_SELECTION_TRANSLATION' as any, async () => {
      logger.info('Received EXECUTE_SELECTION_TRANSLATION');
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        return { success: false, error: { code: MessageErrorCode.UNKNOWN_ERROR, message: 'No active selection' } };
      }
      return await executeSelectionTranslation(selection);
    });

    messageRouter.registerHandler('GET_NETFLIX_STATE', async () => {
      return netflixAdapter.getStateInfo();
    });

    messageRouter.registerHandler('SET_NETFLIX_SELECTION', async (msg) => {
      netflixAdapter.setSubtitleSource(msg.source);
      return true;
    });

    messageRouter.listen();

    // 2. Setup SPA navigation listener to clear old translations on route change
    setupSpaNavigationListener();

    // 2b. Selection translate (劃詞翻譯) pill
    setupSelectionTranslate();

    // 3. Listen for settings changes to dynamically show/hide badge
    setupSettingsListener();

    // 4. Read settings and conditionally add badge (suppressed on Netflix)
    if (!isNetflix) {
      try {
        const settings = await SettingsStorage.get().catch(() => null);
        if (settings?.showFloatingButton !== false) {
          addFloatingBadge();
        }
      } catch {
        addFloatingBadge();
      }
    }
  },
});

function setupSpaNavigationListener(): void {
  let lastPath = window.location.pathname;

  const handleRouteCheck = () => {
    const currentPath = window.location.pathname;
    if (currentPath !== lastPath) {
      logger.info('SPA navigation detected from', lastPath, 'to', currentPath);
      lastPath = currentPath;
      if (badgeState === 'translated') {
        void executePageRestore();
      }
    }
  };

  window.addEventListener('popstate', handleRouteCheck);

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    handleRouteCheck();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    handleRouteCheck();
  };
}

function setupSettingsListener(): void {
  // The old listener watched storage.sync for a top-level showFloatingButton
  // key — settings live in storage.local under owt_settings, so it never
  // fired. The single Settings seam replaces it.
  try {
    SettingsStorage.watch((s) => {
      if (s.showFloatingButton === false) {
        removeFloatingBadge();
      } else if (!window.location.hostname.includes('netflix.com')) {
        addFloatingBadge();
      }
    });
  } catch (err) {
    logger.warn('Failed to setup settings listener:', err);
  }
}

function updateBadgeUI(state: BadgeState): void {
  badgeState = state;
  if (!badgeButton) return;

  badgeButton.classList.remove('owt-badge-idle', 'owt-badge-translating', 'owt-badge-translated');

  switch (state) {
    case 'idle':
      badgeButton.classList.add('owt-badge-idle');
      badgeButton.innerHTML = '<span>🌐</span>';
      badgeButton.title = 'Translate Page (Open Web Translate)';
      break;
    case 'translating':
      badgeButton.classList.add('owt-badge-translating');
      badgeButton.innerHTML = '<span class="owt-spinner">⏳</span>';
      badgeButton.title = 'Translating page...';
      break;
    case 'translated':
      badgeButton.classList.add('owt-badge-translated');
      badgeButton.innerHTML = '<span>✅</span>';
      badgeButton.title = 'Click to Restore Original Page';
      break;
  }
}

function addFloatingBadge(): void {
  if (badgeHost && document.contains(badgeHost)) return;

  try {
    badgeHost = document.createElement('div');
    badgeHost.id = 'owt-floating-badge-host';
    badgeHost.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      pointer-events: auto;
    `;

    const shadowRoot = badgeHost.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      .owt-badge {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4f46e5, #8b5cf6);
        color: #ffffff;
        border: 2px solid rgba(255, 255, 255, 0.35);
        box-shadow: 0 6px 18px rgba(79, 70, 229, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        font-size: 18px;
        font-weight: 700;
        font-family: system-ui, -apple-system, sans-serif;
        transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
        user-select: none;
        touch-action: none;
      }

      .owt-badge:hover {
        transform: scale(1.08);
        box-shadow: 0 8px 22px rgba(79, 70, 229, 0.6);
      }

      .owt-badge.dragging {
        cursor: grabbing;
        transform: scale(1.02);
        filter: brightness(1.1);
      }

      .owt-badge-translating {
        background: linear-gradient(135deg, #b45309, #f59e0b);
        border-color: rgba(255, 255, 255, 0.5);
      }

      .owt-badge-translated {
        background: linear-gradient(135deg, #047857, #10b981);
      }

      .owt-spinner {
        display: inline-block;
        animation: owt-spin 1s linear infinite;
      }

      @keyframes owt-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;

    badgeButton = document.createElement('button');
    badgeButton.className = 'owt-badge owt-badge-idle';
    badgeButton.type = 'button';
    updateBadgeUI(badgeState);

    makeBadgeDraggable(badgeHost, badgeButton);

    badgeButton.addEventListener('click', async (e) => {
      if (badgeDragMoved) return; // a drag just ended — not a click
      e.stopPropagation();
      if (badgeState === 'idle') {
        updateBadgeUI('translating');
        const res = await executePageTranslation();
        if (res.success) {
          updateBadgeUI('translated');
        } else {
          updateBadgeUI('idle');
        }
      } else if (badgeState === 'translated') {
        await executePageRestore();
        updateBadgeUI('idle');
      }
    });

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(badgeButton);

    (document.body || document.documentElement).appendChild(badgeHost);
    void restoreBadgePosition();
    logger.info('Interactive floating badge attached to DOM');
  } catch (err) {
    logger.warn('Failed to add floating badge:', err);
  }
}

let badgeDragMoved = false;

const BADGE_POS_KEY = 'owt_badge_pos';

function clampBadgeToViewport(): void {
  if (!badgeHost) return;
  const size = 46;
  const x = Math.min(Math.max(0, badgeHost.offsetLeft), window.innerWidth - size);
  const y = Math.min(Math.max(0, badgeHost.offsetTop), window.innerHeight - size);
  badgeHost.style.left = `${x}px`;
  badgeHost.style.top = `${y}px`;
  badgeHost.style.right = 'auto';
  badgeHost.style.bottom = 'auto';
}

async function restoreBadgePosition(): Promise<void> {
  try {
    const saved = await extensionBridge.getLocalStorage<{ x: number; y: number }>(BADGE_POS_KEY);
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      badgeHost!.style.left = `${saved.x}px`;
      badgeHost!.style.top = `${saved.y}px`;
      clampBadgeToViewport();
    }
  } catch {
    // default position stands
  }
}

/**
 * Drag with click-vs-drag discrimination: a press that moves < 5px is a
 * click (translate toggle); beyond that it drags, and the drop position is
 * remembered in storage.local.
 */
function makeBadgeDraggable(host: HTMLElement, button: HTMLButtonElement): void {
  let startX = 0;
  let startY = 0;
  let dragging = false;

  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    badgeDragMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    button.setPointerCapture(e.pointerId);
  });

  button.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!badgeDragMoved && Math.hypot(dx, dy) < 5) return;
    if (!badgeDragMoved) {
      badgeDragMoved = true;
      button.classList.add('dragging');
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    }
    const size = 46;
    const x = Math.min(Math.max(0, host.offsetLeft + dx), window.innerWidth - size);
    const y = Math.min(Math.max(0, host.offsetTop + dy), window.innerHeight - size);
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
    startX = e.clientX;
    startY = e.clientY;
  });

  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    button.classList.remove('dragging');
    button.releasePointerCapture?.(e.pointerId);
    if (badgeDragMoved) {
      void extensionBridge.setLocalStorage(BADGE_POS_KEY, { x: host.offsetLeft, y: host.offsetTop });
      // Allow the next press to be a clean click again.
      setTimeout(() => { badgeDragMoved = false; }, 0);
    }
  };

  button.addEventListener('pointerup', endDrag);
  button.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', () => {
    if (badgeDragMoved === false && badgeHost) {
      // Re-clamp only when the user has repositioned it (has left/top set).
      if (badgeHost.style.left) clampBadgeToViewport();
    }
  });
}

// ── Selection translate (劃詞翻譯) ───────────────────────────────────

let selectionPill: HTMLElement | null = null;
let selectionHideTimer: ReturnType<typeof setTimeout> | null = null;

function isInsideOwnUi(node: Node | null): boolean {
  if (!node) return false;
  const el = node instanceof HTMLElement ? node : node.parentElement;
  if (!el) return false;
  return Boolean(
    el.closest?.('#owt-floating-badge-host, #owt-netflix-overlay-host, #owt-dictionary-popover, #owt-netflix-selector-menu, #owt-selection-pill'),
  );
}

function hideSelectionPill(): void {
  selectionPill?.remove();
  selectionPill = null;
}

function showSelectionPill(rect: DOMRect): void {
  hideSelectionPill();

  const pill = document.createElement('button');
  pill.id = 'owt-selection-pill';
  pill.type = 'button';
  pill.title = '劃詞翻譯';
  pill.textContent = '譯';
  pill.style.cssText = `
    position: fixed;
    z-index: 2147483600;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.45);
    background: linear-gradient(135deg, #4f46e5, #8b5cf6);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.5);
    padding: 0;
    line-height: 1;
  `;

  const x = Math.min(Math.max(8, rect.left + rect.width / 2 - 15), window.innerWidth - 38);
  const y = rect.top > 40 ? rect.top - 36 : rect.bottom + 6;
  pill.style.left = `${x}px`;
  pill.style.top = `${y}px`;

  pill.addEventListener('pointerdown', (e) => e.stopPropagation());
  pill.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    const selection = window.getSelection();
    hideSelectionPill();
    if (!selection || selection.isCollapsed) return;
    await executeSelectionTranslation(selection);
  });

  document.body.appendChild(pill);
  selectionPill = pill;
}

function setupSelectionTranslate(): void {
  document.addEventListener('pointerup', () => {
    if (selectionHideTimer) clearTimeout(selectionHideTimer);
    selectionHideTimer = setTimeout(() => {
      const selection = window.getSelection();
      if (
        !selection ||
        selection.isCollapsed ||
        isInsideOwnUi(selection.anchorNode) ||
        isInsideOwnUi(selection.focusNode)
      ) {
        hideSelectionPill();
        return;
      }
      const text = selection.toString().trim();
      if (text.length < 2 || text.length > 5000) {
        hideSelectionPill();
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      showSelectionPill(rect);
    }, 250);
  });

  document.addEventListener('pointerdown', (e) => {
    if (!isInsideOwnUi(e.target as Node)) hideSelectionPill();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideSelectionPill();
  });

  document.addEventListener('scroll', () => hideSelectionPill(), { passive: true, capture: true });
}

function removeFloatingBadge(): void {
  if (badgeHost) {
    badgeHost.remove();
    badgeHost = null;
    badgeButton = null;
    logger.info('Floating badge removed from DOM');
  }
}

async function executePageTranslation(): Promise<{ success: boolean; translatedCount?: number; error?: ErrorPayload }> {
  try {
    const settings = await messageRouter.sendMessage({ type: 'GET_SETTINGS' }).catch(() => null);
    const targetLanguage = settings?.targetLanguage || 'zh-Hant';

    const result = await genericDomAdapter.translatePage(document, {
      targetLanguage,
      displayMode: settings?.displayMode || 'bilingual',
      translateFn: async (segments) => {
        const response = await messageRouter.sendMessage({
          type: 'TRANSLATE_REQUEST',
          segments,
          sourceLanguage: 'auto',
          targetLanguage,
        });
        return response.segments;
      },
    });
    return { success: result.success, translatedCount: result.translatedCount };
  } catch (err: any) {
    logger.error('Page translation failed:', err);
    return { success: false, error: { code: MessageErrorCode.TRANSLATION_FAILED, message: err?.message || 'Page translation failed' } };
  }
}

async function executePageRestore(): Promise<{ success: boolean; restoredCount?: number }> {
  try {
    const restoredCount = genericDomAdapter.restorePage();
    return { success: true, restoredCount };
  } catch (err: any) {
    logger.error('Page restore failed:', err);
    return { success: false };
  }
}

async function executeSelectionTranslation(
  selection: Selection,
): Promise<{ success: boolean; error?: ErrorPayload }> {
  try {
    const settings = await SettingsStorage.get().catch(() => null);
    const targetLanguage = settings?.targetLanguage || 'zh-Hant';

    await genericDomAdapter.translateSelection(selection, document, {
      targetLanguage,
      displayMode: settings?.displayMode || 'bilingual',
      translateFn: async (segments) => {
        const response = await messageRouter.sendMessage({
          type: 'TRANSLATE_REQUEST',
          segments,
          sourceLanguage: 'auto',
          targetLanguage,
        });
        return response.segments;
      },
    });
    return { success: true };
  } catch (err: any) {
    logger.error('Selection translation failed:', err);
    return { success: false, error: { code: MessageErrorCode.TRANSLATION_FAILED, message: err?.message || 'Selection translation failed' } };
  }
}

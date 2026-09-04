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
import { setupSelectionTranslate } from '@/features/selection-translation';
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

function injectYouTubeMainWorldScript(): void {
  try {
    if (document.documentElement?.getAttribute('data-owt-youtube-main') === '1') {
      return;
    }
    document.documentElement?.setAttribute('data-owt-youtube-main', '1');

    const scriptUrl = browser.runtime.getURL('youtube-main.js' as any);
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = false;
    script.onload = () => {
      script.remove();
      logger.info('youtube-main.js loaded into MAIN world');
    };
    script.onerror = () => {
      document.documentElement?.removeAttribute('data-owt-youtube-main');
      logger.warn('youtube-main.js failed to load; will not retry automatically');
    };
    (document.head || document.documentElement).appendChild(script);
    logger.info('Injected youtube-main.js into MAIN world');
  } catch (err) {
    logger.warn('Failed to inject youtube-main.js:', err);
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

    // One live instance per tab. Re-injection (extension reload without a
    // page refresh) would otherwise double every listener and spawn a second
    // floating badge on top of the first.
    const sessionWindow = window as unknown as { __owtContentActive?: boolean };
    if (sessionWindow.__owtContentActive) {
      logger.info('OWT content script already active in this tab; skipping re-injection');
      return;
    }
    sessionWindow.__owtContentActive = true;

    const isNetflix = window.location.hostname.includes('netflix.com');
    const isYouTube = window.location.hostname.includes('youtube.com');
    // The floating ball never belongs on video sites: subtitles are
    // controlled from the popup there.
    const isVideoSite = isNetflix || isYouTube;

    // Initialize site-specific adapters if applicable
    if (isYouTube) {
      injectYouTubeMainWorldScript();
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
      if (!isNetflix) return null;
      return netflixAdapter.getStateInfo();
    });

    messageRouter.registerHandler('SET_NETFLIX_SELECTION', async (msg) => {
      if (!isNetflix) return false;
      netflixAdapter.setSubtitleSource(msg.source, msg.trackId);
      return true;
    });

    messageRouter.registerHandler('SET_NETFLIX_ACTIVE', async (msg) => {
      if (!isNetflix) return false;
      netflixAdapter.setActive(msg.active);
      return true;
    });

    messageRouter.registerHandler('GET_YOUTUBE_STATE', async () => {
      if (!isYouTube) return null;
      return youtubeAdapter.getStateInfo();
    });

    messageRouter.registerHandler('SET_YOUTUBE_ACTIVE', async (msg) => {
      if (!isYouTube) return false;
      youtubeAdapter.setActive(msg.active);
      return true;
    });

    messageRouter.registerHandler('SET_YOUTUBE_TRACK', async (msg) => {
      if (!isYouTube) return false;
      youtubeAdapter.setTrack(msg.trackId);
      return true;
    });

    messageRouter.listen();

    // 2. Setup SPA navigation listener to clear old translations on route change
    setupSpaNavigationListener();

    // 2b. Selection translate (劃詞翻譯) pill
    setupSelectionTranslate(async (selection) => {
      await executeSelectionTranslation(selection);
    });

    // 3. Listen for settings changes to dynamically show/hide badge
    setupSettingsListener();

    // 4. Read settings and conditionally add badge (suppressed on Netflix)
    if (!isVideoSite) {
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
      } else if (
        !window.location.hostname.includes('netflix.com') &&
        !window.location.hostname.includes('youtube.com')
      ) {
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
      badgeButton.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
      badgeButton.title = 'Translate Page (Open Web Translate)';
      badgeButton.setAttribute('aria-label', 'Translate page');
      break;
    case 'translating':
      badgeButton.classList.add('owt-badge-translating');
      badgeButton.innerHTML = '<span class="owt-spinner-ring" aria-hidden="true"></span>';
      badgeButton.title = 'Translating page...';
      badgeButton.setAttribute('aria-label', 'Translating page');
      break;
    case 'translated':
      badgeButton.classList.add('owt-badge-translated');
      badgeButton.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>';
      badgeButton.title = 'Click to Restore Original Page';
      badgeButton.setAttribute('aria-label', 'Restore original page');
      break;
  }
}

function addFloatingBadge(): void {
  if (badgeHost && document.contains(badgeHost)) return;

  try {
    // Sweep away any badge left by a re-injected script copy; the newest
    // instance owns the badge surface.
    document.querySelectorAll('#owt-floating-badge-host').forEach((el) => el.remove());

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
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #0d9488;
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.28);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.22),
          0 2px 6px rgba(0, 0, 0, 0.28),
          0 6px 16px rgba(13, 148, 136, 0.38);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        padding: 0;
        transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease, background 0.18s ease;
        user-select: none;
        touch-action: none;
        -webkit-tap-highlight-color: transparent;
      }

      .owt-badge svg,
      .owt-badge span {
        width: 20px;
        height: 20px;
        display: block;
        pointer-events: none;
      }

      .owt-badge:hover {
        transform: scale(1.07);
        filter: brightness(1.07);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.22),
          0 3px 8px rgba(0, 0, 0, 0.3),
          0 8px 20px rgba(13, 148, 136, 0.5);
      }

      .owt-badge.dragging {
        cursor: grabbing;
        transform: scale(0.94);
        transition: none;
      }

      .owt-badge-translating {
        background: #b45309;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.22),
          0 2px 6px rgba(0, 0, 0, 0.28),
          0 6px 16px rgba(180, 83, 9, 0.38);
      }

      .owt-badge-translated {
        background: #059669;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.22),
          0 2px 6px rgba(0, 0, 0, 0.28),
          0 6px 16px rgba(5, 150, 105, 0.38);
      }

      .owt-spinner-ring {
        border-radius: 50%;
        border: 2.5px solid rgba(255, 255, 255, 0.32);
        border-top-color: #ffffff;
        animation: owt-spin 0.8s linear infinite;
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
      if (badgeSuppressClick) {
        badgeSuppressClick = false; // a drag just ended — not a click
        return;
      }
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
    watchBadgeViewport();
    logger.info('Interactive floating badge attached to DOM');
  } catch (err) {
    logger.warn('Failed to add floating badge:', err);
  }
}

let badgeDragMoved = false;
let badgeSuppressClick = false;

const BADGE_POS_KEY = 'owt_badge_pos';

function clampBadgeToViewport(): void {
  if (!badgeHost) return;
  const size = 44;
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

  const size = 44;

  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    badgeDragMoved = false;
    badgeSuppressClick = false;
    startX = e.clientX;
    startY = e.clientY;
    try {
      button.setPointerCapture(e.pointerId);
    } catch {
      // capture is best-effort; drag still works while the pointer stays down
    }
  });

  button.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!badgeDragMoved && Math.hypot(dx, dy) < 5) return;
    if (!badgeDragMoved) {
      badgeDragMoved = true;
      // Read the anchored position before clearing right/bottom; reading
      // after the inset reset would resolve the auto-position and make the
      // badge jump on the first move.
      const startLeft = host.offsetLeft;
      const startTop = host.offsetTop;
      button.classList.add('dragging');
      host.style.right = 'auto';
      host.style.bottom = 'auto';
      host.style.left = `${startLeft}px`;
      host.style.top = `${startTop}px`;
    }
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
    try {
      button.releasePointerCapture?.(e.pointerId);
    } catch {
      // pointer may already be released
    }
    if (badgeDragMoved) {
      // Suppress the click that always follows pointerup. A flag is
      // deterministic; a 0ms timer can fire before the click dispatches and
      // turn the end of a drag into an accidental translate toggle.
      badgeSuppressClick = true;
      badgeDragMoved = false;
      void extensionBridge.setLocalStorage(BADGE_POS_KEY, { x: host.offsetLeft, y: host.offsetTop });
    }
  };

  button.addEventListener('pointerup', endDrag);
  button.addEventListener('pointercancel', endDrag);
  button.addEventListener('lostpointercapture', endDrag);
}

let badgeResizeHandler: (() => void) | null = null;

function watchBadgeViewport(): void {
  if (badgeResizeHandler) window.removeEventListener('resize', badgeResizeHandler);
  badgeResizeHandler = () => {
    // Re-clamp only when the user has repositioned it (has left/top set).
    if (badgeHost && badgeHost.style.left) clampBadgeToViewport();
  };
  window.addEventListener('resize', badgeResizeHandler);
}



function removeFloatingBadge(): void {
  // Remove our host and any stray host left by a re-injected script copy.
  document.querySelectorAll('#owt-floating-badge-host').forEach((el) => el.remove());
  if (badgeHost) {
    badgeHost = null;
    badgeButton = null;
    if (badgeResizeHandler) {
      window.removeEventListener('resize', badgeResizeHandler);
      badgeResizeHandler = null;
    }
    logger.info('Floating badge removed from DOM');
  }
}

async function executePageTranslation(): Promise<{ success: boolean; translatedCount?: number; error?: ErrorPayload }> {
  try {
    const settings = await SettingsStorage.get();
    const targetLanguage = settings.targetLanguage || 'zh-Hant';
    const sourceLanguage = settings.sourceLanguage || 'auto';

    const result = await genericDomAdapter.translatePage(document, {
      targetLanguage,
      displayMode: (settings as any).displayMode || 'bilingual',
      translateFn: async (segments) => {
        const response = await messageRouter.sendMessage({
          type: 'TRANSLATE_REQUEST',
          segments,
          sourceLanguage,
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
    const sourceLanguage = settings?.sourceLanguage || 'auto';

    await genericDomAdapter.translateSelection(selection, document, {
      targetLanguage,
      displayMode: settings?.displayMode || 'bilingual',
      translateFn: async (segments) => {
        const response = await messageRouter.sendMessage({
          type: 'TRANSLATE_REQUEST',
          segments,
          sourceLanguage,
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

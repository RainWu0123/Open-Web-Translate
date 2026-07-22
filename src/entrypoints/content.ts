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

    messageRouter.registerHandler('GET_NETFLIX_STATE' as any, async () => {
      return netflixAdapter.getStateInfo();
    });

    messageRouter.registerHandler('UPDATE_NETFLIX_CONFIG' as any, async (msg: any) => {
      if (msg?.payload) {
        netflixAdapter.updateConfig(msg.payload);
      }
      return true;
    });

    messageRouter.listen();

    // 2. Setup SPA navigation listener to clear old translations on route change
    setupSpaNavigationListener();

    // 3. Listen for settings changes to dynamically show/hide badge
    setupSettingsListener();

    // 4. Read settings and conditionally add badge (suppressed on Netflix)
    if (!isNetflix) {
      try {
        const settings = await messageRouter.sendMessage({ type: 'GET_SETTINGS' }).catch(() => null);
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
  try {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.showFloatingButton) {
        const newValue = changes.showFloatingButton.newValue;
        if (newValue === false) {
          removeFloatingBadge();
        } else {
          if (!window.location.hostname.includes('netflix.com')) {
            addFloatingBadge();
          }
        }
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
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #1e293b;
        color: #ffffff;
        border: 2px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 20px;
        transition: transform 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
        user-select: none;
      }

      .owt-badge:hover {
        transform: scale(1.1);
        border-color: #38bdf8;
      }

      .owt-badge-translating {
        background: #0f172a;
        border-color: #f59e0b;
      }

      .owt-badge-translated {
        background: #065f46;
        border-color: #10b981;
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

    badgeButton.addEventListener('click', async (e) => {
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
    logger.info('Interactive floating badge attached to DOM');
  } catch (err) {
    logger.warn('Failed to add floating badge:', err);
  }
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
    const settings = await messageRouter.sendMessage({ type: 'GET_SETTINGS' }).catch(() => null);
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

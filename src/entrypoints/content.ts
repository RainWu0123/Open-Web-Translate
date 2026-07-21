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
import {
  extractTranslatableTargets,
  renderBilingualBlock,
  removeAllBilingualBlocks,
} from '@/features/page-translation';
import { MessageErrorCode } from '@/core/contracts/messages';
import { YouTubeCaptionAdapter } from '@/adapters/youtube/youtube-caption-adapter';
import { NetflixCaptionAdapter } from '@/adapters/netflix/netflix-caption-adapter';
import { createLogger } from '@/shared/logger';
import '../assets/netflix.css';

const logger = createLogger('ContentScript');
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

    // Initialize adapters
    if (window.location.hostname.includes('youtube.com')) {
      youtubeAdapter.init();
    } else if (window.location.hostname.includes('netflix.com')) {
      // Primary path: inject MAIN-world Cadmium probe (required on Firefox MV2
      // where world:'MAIN' content scripts may not auto-load). Do NOT patch
      // page fetch/XHR from the isolated world — that hits Xray/CSP issues.
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

    messageRouter.listen();

    // 2. Setup SPA navigation listener to clear old translations on route change
    setupSpaNavigationListener();

    // 3. Listen for settings changes to dynamically show/hide badge
    setupSettingsListener();

    // 4. Read settings and conditionally add badge
    try {
      const settings = await messageRouter.sendMessage({ type: 'GET_SETTINGS' }).catch(() => null);
      if (settings?.showFloatingButton !== false) {
        addFloatingBadge();
      }
    } catch {
      addFloatingBadge();
    }
  },
});

// ─── Shared Page Translation Service ─────────────────────────────
// Used by Badge click, Popup relay, and Context Menu relay.
// Single source of truth — no duplication.

async function executePageTranslation(): Promise<any> {
  try {
    updateBadgeState('translating');

    const settings = await messageRouter.sendMessage({ type: 'GET_SETTINGS' }).catch((e) => {
      logger.warn('Failed to fetch settings, fallback to zh-Hant', e);
      return null;
    });
    const targetLang = settings?.targetLanguage || 'zh-Hant';
    const displayMode = settings?.displayMode || 'bilingual';
    const origSize = settings?.subtitleOriginalFontSize || 18;
    const transSize = settings?.subtitleTranslatedFontSize || 22;
    const origColor = settings?.subtitleOriginalColor || '#ffffff';
    const transColor = settings?.subtitleTranslatedColor || '#818cf8';

    const isVideoSite =
      window.location.hostname.includes('youtube.com') || window.location.hostname.includes('netflix.com');

    if (window.location.hostname.includes('youtube.com')) {
      youtubeAdapter.start(targetLang, displayMode, origSize, transSize, origColor, transColor);
    } else if (window.location.hostname.includes('netflix.com')) {
      netflixAdapter.start(targetLang, displayMode, origSize, transSize, origColor, transColor);
    }

    // Extract targets for page DOM elements
    const extractResult = extractTranslatableTargets(document);
    if (!extractResult.success) {
      logger.warn('Extraction returned error or no targets', extractResult.error);
      updateBadgeState(isVideoSite ? 'translated' : 'idle');
      return {
        success: isVideoSite, // Subtitles active on video sites
        error: isVideoSite ? undefined : extractResult.error,
      };
    }

    const { targets } = extractResult;

    // Clear existing bilingual blocks before rendering new ones (idempotent)
    removeAllBilingualBlocks(document);

    // Send translate request to background (Provider via Background)
    const translationResult = await messageRouter.sendMessage({
      type: 'TRANSLATE_REQUEST',
      segments: targets.map((t) => ({ id: t.id, text: t.text })),
      sourceLanguage: 'auto',
      targetLanguage: targetLang,
    });

    if (!translationResult || !translationResult.segments) {
      updateBadgeState('idle');
      return {
        success: false,
        error: {
          code: MessageErrorCode.TRANSLATION_FAILED,
          message: 'Background service failed to return translated segments',
        },
      };
    }

    // Render bilingual blocks with configured displayMode
    targets.forEach((target, idx) => {
      const seg = translationResult.segments[idx];
      const translatedText = seg ? seg.translatedText : '[翻譯不可用]';
      renderBilingualBlock(target.element, target.id, target.text, translatedText, displayMode);
    });

    logger.info(`Successfully translated ${targets.length} segments`);
    updateBadgeState('translated');
    return {
      success: true,
      translatedCount: targets.length,
    };
  } catch (err: any) {
    logger.error('Failed during page translation', err);
    updateBadgeState('idle');
    return {
      success: false,
      error: {
        code: MessageErrorCode.UNKNOWN_ERROR,
        message: err?.message || 'Content script failed to execute translation',
      },
    };
  }
}

async function executePageRestore(): Promise<any> {
  try {
    const count = removeAllBilingualBlocks(document);
    
    if (window.location.hostname.includes('youtube.com')) {
      youtubeAdapter.stop();
    } else if (window.location.hostname.includes('netflix.com')) {
      netflixAdapter.stop();
    }
    
    logger.info(`Restored ${count} elements`);
    updateBadgeState('idle');
    return {
      success: true,
      restoredCount: count,
    };
  } catch (err: any) {
    logger.error('Failed during page restore', err);
    updateBadgeState('idle');
    return {
      success: false,
      error: {
        code: MessageErrorCode.UNKNOWN_ERROR,
        message: err?.message || 'Content script failed to restore page',
      },
    };
  }
}

// ─── Shadow DOM Interactive Badge ────────────────────────────────

function addFloatingBadge(): void {
  if (document.getElementById('owt-badge-host')) return;

  // Do not show floating badge on video player pages where dedicated player control button is used
  if (
    window.location.hostname.includes('youtube.com') ||
    window.location.hostname.includes('netflix.com')
  ) {
    return;
  }

  const host = document.createElement('div');
  host.id = 'owt-badge-host';
  const target = document.body || document.documentElement;
  if (!target) return;
  target.appendChild(host);
  badgeHost = host;

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .owt-badge {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      padding: 8px 18px;
      border-radius: 24px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      box-shadow: 0 4px 14px rgba(102, 126, 234, 0.4);
      z-index: 2147483647;
      user-select: none;
      opacity: 0.92;
      transition: all 0.2s ease;
      cursor: pointer;
      border: none;
      outline: none;
      display: flex;
      align-items: center;
      gap: 6px;
      line-height: 1;
    }
    .owt-badge:hover {
      opacity: 1;
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(102, 126, 234, 0.6);
    }
    .owt-badge:focus-visible {
      outline: 2px solid #ffffff;
      outline-offset: 2px;
    }
    .owt-badge:active {
      transform: translateY(0);
    }
    .owt-badge[aria-busy="true"] {
      cursor: wait;
      opacity: 0.7;
    }
    .owt-badge.translated {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);
    }
    .owt-badge.translated:hover {
      box-shadow: 0 6px 18px rgba(16, 185, 129, 0.6);
    }
    @keyframes owt-spin {
      to { transform: rotate(360deg); }
    }
    .owt-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: owt-spin 0.6s linear infinite;
    }
  `;
  shadow.appendChild(style);

  const button = document.createElement('button');
  button.className = 'owt-badge';
  button.setAttribute('aria-label', '翻譯此頁面');
  button.setAttribute('aria-busy', 'false');
  button.textContent = 'OWT';

  button.addEventListener('click', handleBadgeClick);
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleBadgeClick();
    }
  });

  shadow.appendChild(button);
  badgeButton = button;
}

function removeFloatingBadge(): void {
  const host = document.getElementById('owt-badge-host');
  if (host) {
    host.remove();
  }
  badgeHost = null;
  badgeButton = null;
}

async function handleBadgeClick(): Promise<void> {
  if (badgeState === 'translating') return; // Prevent double-click

  if (badgeState === 'idle') {
    await executePageTranslation();
  } else if (badgeState === 'translated') {
    await executePageRestore();
  }
}

function updateBadgeState(newState: BadgeState): void {
  badgeState = newState;
  if (!badgeButton) return;

  switch (newState) {
    case 'idle':
      badgeButton.innerHTML = 'OWT';
      badgeButton.setAttribute('aria-label', '翻譯此頁面');
      badgeButton.setAttribute('aria-busy', 'false');
      badgeButton.classList.remove('translated');
      break;

    case 'translating':
      badgeButton.innerHTML = '<span class="owt-spinner"></span> 翻譯中';
      badgeButton.setAttribute('aria-label', '翻譯進行中');
      badgeButton.setAttribute('aria-busy', 'true');
      badgeButton.classList.remove('translated');
      break;

    case 'translated':
      badgeButton.innerHTML = '✓ 還原';
      badgeButton.setAttribute('aria-label', '還原頁面原文');
      badgeButton.setAttribute('aria-busy', 'false');
      badgeButton.classList.add('translated');
      break;
  }
}

// ─── Settings Listener (reactive badge show/hide) ────────────────

function setupSettingsListener(): void {
  browser.storage.onChanged.addListener((changes) => {
    if (changes['owt_settings']) {
      const newSettings = changes['owt_settings'].newValue as any;
      if (newSettings) {
        const showBadge = newSettings.showFloatingButton !== false;
        const badgeExists = !!document.getElementById('owt-badge-host');

        if (showBadge && !badgeExists) {
          addFloatingBadge();
        } else if (!showBadge && badgeExists) {
          // Only remove badge UI; do NOT auto-restore translations
          removeFloatingBadge();
        }
      }
    }
  });
}

// ─── SPA Navigation Listener ──────────────────────────────────────

function setupSpaNavigationListener(): void {
  let lastUrl = window.location.href;

  const handleUrlChange = () => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      logger.info('URL changed, restoring original page state', { oldUrl: lastUrl, newUrl: currentUrl });
      lastUrl = currentUrl;
      removeAllBilingualBlocks(document);
      
      if (window.location.hostname.includes('youtube.com')) {
        youtubeAdapter.stop();
      } else if (window.location.hostname.includes('netflix.com')) {
        netflixAdapter.stop();
      }
      
      // Reset badge state on navigation
      updateBadgeState('idle');
    }
  };

  window.addEventListener('popstate', handleUrlChange);
  window.addEventListener('hashchange', handleUrlChange);
}

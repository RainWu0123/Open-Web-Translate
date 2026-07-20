import { browser } from 'wxt/browser';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { createLogger } from '@/shared/logger';

const logger = createLogger('YouTubeCaptionAdapter');

interface RequestState {
  fingerprint: string;
  abortController: AbortController;
}

/**
 * YouTube continuously replaces its caption nodes. The adapter observes the
 * stable player root, keeps the native text as the source of truth, and marks
 * each rendered segment so a replacement can be detected and translated again.
 */
export class YouTubeCaptionAdapter {
  private isActive = false;
  private observer: MutationObserver | null = null;
  private observerTarget: Element | null = null;
  private controlsButton: HTMLElement | null = null;
  private lastMouseMoveTime = 0;
  private isProcessing = false;

  private targetLang = 'zh-Hant';
  private displayMode = 'bilingual';
  private subtitleOriginalFontSize = 18;
  private subtitleTranslatedFontSize = 22;
  private subtitleOriginalColor = '#ffffff';
  private subtitleTranslatedColor = '#818cf8';

  private routeGeneration = 0;
  private currentVideoId: string | null = null;
  private inlineTranslationCache = new Map<string, string>();
  private pendingRequests = new Map<string, RequestState>();
  private dragCleanups = new Map<HTMLElement, () => void>();

  public init() {
    if (typeof window === 'undefined' || !window.location?.hostname?.includes('youtube.com')) {
      return;
    }

    logger.info('Initializing YouTubeCaptionAdapter on youtube.com');
    this.setupNavigationListeners();
    this.setupSettingsListener();
    this.setupMouseMoveInjectionListener();
    this.injectControlsButton();

    if (document.readyState === 'loading') {
      document.addEventListener(
        'DOMContentLoaded',
        () => this.injectControlsButton(),
        { once: true },
      );
    }
  }

  private setupMouseMoveInjectionListener() {
    window.addEventListener(
      'mousemove',
      () => {
        const now = Date.now();
        if (now - this.lastMouseMoveTime < 400) return;
        this.lastMouseMoveTime = now;
        if (!document.querySelector('.owt-yt-toggle-btn')) this.injectControlsButton();
      },
      { passive: true },
    );
  }

  private setupSettingsListener() {
    try {
      browser.storage.onChanged.addListener((changes) => {
        const newSettings = changes['owt_settings']?.newValue as any;
        if (!newSettings) return;

        this.subtitleOriginalFontSize = newSettings.subtitleOriginalFontSize || 18;
        this.subtitleTranslatedFontSize = newSettings.subtitleTranslatedFontSize || 22;
        this.subtitleOriginalColor = newSettings.subtitleOriginalColor || '#ffffff';
        this.subtitleTranslatedColor = newSettings.subtitleTranslatedColor || '#818cf8';
        this.targetLang = newSettings.targetLanguage || 'zh-Hant';
        this.displayMode = newSettings.displayMode || 'bilingual';

        if (this.isActive) {
          this.restoreNativeSegments();
          this.processCaptions();
        }
      });
    } catch {
      // Storage listeners are not available in unit-test or restricted contexts.
    }
  }

  private setupNavigationListeners() {
    let lastUrl = window.location.href;
    const handleNavigation = () => {
      const currentUrl = window.location.href;
      if (currentUrl === lastUrl) return;

      lastUrl = currentUrl;
      const newVideoId = new URLSearchParams(window.location.search).get('v');
      if (newVideoId !== this.currentVideoId) {
        this.currentVideoId = newVideoId;
        this.routeGeneration += 1;
        this.abortPendingRequests();
        this.inlineTranslationCache.clear();
        this.restoreNativeSegments();
      }
      this.injectControlsButton();
    };

    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('hashchange', handleNavigation);
    window.addEventListener('yt-navigate-finish', handleNavigation);
    window.addEventListener('owt-youtube-url-change', handleNavigation);

    const win = window as typeof window & { __owtYouTubeHistoryPatched?: boolean };
    if (!win.__owtYouTubeHistoryPatched) {
      win.__owtYouTubeHistoryPatched = true;
      try {
        for (const method of ['pushState', 'replaceState'] as const) {
          const original = window.history[method];
          window.history[method] = function (this: History, ...args) {
            const result = original.apply(this, args);
            window.dispatchEvent(new Event('owt-youtube-url-change'));
            return result;
          } as typeof original;
        }
      } catch {
        // Some embedded test environments expose a read-only history object.
      }
    }
  }

  private async handleToggleClick() {
    if (this.isActive) {
      this.stop();
      return;
    }

    try {
      const settings = await messageRouter.sendMessage({ type: 'GET_SETTINGS' }).catch(() => null);
      await this.start(
        settings?.targetLanguage || 'zh-Hant',
        settings?.displayMode || 'bilingual',
        settings?.subtitleOriginalFontSize || 18,
        settings?.subtitleTranslatedFontSize || 22,
        settings?.subtitleOriginalColor || '#ffffff',
        settings?.subtitleTranslatedColor || '#818cf8',
      );
    } catch {
      await this.start('zh-Hant', 'bilingual', 18, 22, '#ffffff', '#818cf8');
    }
  }

  private injectControlsButton() {
    if (typeof document === 'undefined') return;

    const subtitlesButton = document.querySelector('.ytp-subtitles-button');
    const settingsButton = document.querySelector('.ytp-settings-button');
    const rightControls =
      subtitlesButton?.parentElement ||
      settingsButton?.parentElement ||
      document.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    let button = rightControls.querySelector('.owt-yt-toggle-btn') as HTMLButtonElement | null;
    if (button && document.body.contains(button)) {
      this.controlsButton = button;
      this.updateControlsButtonState();
      return;
    }

    button = document.createElement('button');
    button.className = 'ytp-button owt-yt-toggle-btn';
    button.setAttribute('aria-label', 'OWT \u96D9\u8A9E\u5B57\u5E55');
    button.setAttribute('title', 'OWT \u96D9\u8A9E\u5B57\u5E55');
    button.style.cssText =
      'display:inline-flex!important;width:48px!important;height:100%!important;' +
      'align-items:center!important;justify-content:center!important;position:relative!important;' +
      'vertical-align:top!important;border:none!important;background:transparent!important;' +
      'cursor:pointer!important;padding:0!important;opacity:.9!important;z-index:60!important;';
    button.innerHTML = `
      <svg height="100%" viewBox="0 0 36 36" width="100%" style="padding:6px;box-sizing:border-box;display:block;width:100%;height:100%;" aria-hidden="true">
        <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02 1.42 1.42 5.09-5.02 3.12 3.12 1.65-2.03zM21.5 10l-4.5 12h2.15l1.2-3.2h4.7l1.2 3.2h2.15L23.9 10h-2.4zm-.4 6.8l1.6-4.27 1.6 4.27h-3.2z" fill="rgba(255, 255, 255, 0.85)"></path>
      </svg>
    `;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.handleToggleClick();
    });

    if (subtitlesButton?.nextSibling) {
      subtitlesButton.parentNode?.insertBefore(button, subtitlesButton.nextSibling);
    } else if (settingsButton) {
      settingsButton.parentNode?.insertBefore(button, settingsButton);
    } else {
      rightControls.appendChild(button);
    }

    this.controlsButton = button;
    this.updateControlsButtonState();
    logger.info('Injected OWT button into YouTube controls');
  }

  private updateControlsButtonState() {
    if (!this.controlsButton) return;
    const svg = this.controlsButton.querySelector('svg');
    if (!svg) return;

    const color = this.isActive ? '#818cf8' : 'rgba(255, 255, 255, 0.85)';
    svg.style.fill = color;
    svg.style.color = color;
    const path = svg.querySelector('path');
    if (path) path.setAttribute('fill', color);
    svg.style.filter = this.isActive
      ? 'drop-shadow(0 0 6px rgba(129,140,248,.9))'
      : 'none';
  }

  async start(
    targetLang: string,
    displayMode: string,
    origSize = 18,
    transSize = 22,
    origColor = '#ffffff',
    transColor = '#818cf8',
  ) {
    this.targetLang = targetLang;
    this.displayMode = displayMode;
    this.subtitleOriginalFontSize = origSize;
    this.subtitleTranslatedFontSize = transSize;
    this.subtitleOriginalColor = origColor;
    this.subtitleTranslatedColor = transColor;
    this.currentVideoId = new URLSearchParams(window.location.search).get('v');

    this.isActive = true;
    this.updateControlsButtonState();
    this.injectControlsButton();
    this.startObserver();
    logger.info('YouTubeCaptionAdapter started', { targetLang, displayMode });
  }

  stop() {
    this.isActive = false;
    this.observer?.disconnect();
    this.observer = null;
    this.observerTarget = null;
    this.inlineTranslationCache.clear();
    this.abortPendingRequests();
    this.restoreNativeSegments();
    this.cleanupDragHandlers();
    this.isProcessing = false;
    this.updateControlsButtonState();
    logger.info('YouTubeCaptionAdapter stopped');
  }

  private restoreNativeSegments() {
    document.querySelectorAll<HTMLElement>('[data-owt-original]').forEach((segment) => {
      const original = segment.getAttribute('data-owt-original');
      if (original) segment.textContent = original;
      segment.style.opacity = '';
      segment.style.display = '';
      segment.style.flexDirection = '';
      segment.style.alignItems = '';
      segment.style.justifyContent = '';
      segment.style.textAlign = '';
      segment.style.width = '';
      segment.style.maxWidth = '';
      segment.style.margin = '';
      segment.removeAttribute('data-owt-original');
      segment.removeAttribute('data-owt-fingerprint');
      segment.removeAttribute('data-owt-pending');
      segment.removeAttribute('data-owt-rendered');
    });

    document
      .querySelectorAll<HTMLElement>(
        '.ytp-caption-window-bottom, .caption-window, .ytp-caption-window-container',
      )
      .forEach((windowElement) => {
        windowElement.style.left = '';
        windowElement.style.top = '';
        windowElement.style.bottom = '';
        windowElement.style.transform = '';
        windowElement.style.width = '';
        windowElement.style.maxWidth = '';
        windowElement.style.textAlign = '';
        windowElement.style.margin = '';
        windowElement.style.cursor = '';
        windowElement.removeAttribute('data-owt-drag-initialized');
        windowElement.removeAttribute('data-owt-user-dragged');
      });
  }

  private startObserver() {
    this.observer?.disconnect();

    // The caption container itself is disposable. The player root is stable
    // across caption changes and survives YouTube's SPA navigation.
    const targetNode =
      document.querySelector('.html5-video-player') ||
      document.querySelector('#movie_player') ||
      document.body ||
      document.documentElement;
    if (!targetNode) {
      logger.warn('No YouTube player container found for caption observation');
      return;
    }

    this.observerTarget = targetNode;
    this.observer = new MutationObserver(() => {
      if (this.isActive) this.processCaptions();
    });
    this.observer.observe(targetNode, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.processCaptions();
  }

  private processCaptions() {
    if (!this.isActive || this.isProcessing) return;
    this.isProcessing = true;

    try {
      const segments = document.querySelectorAll<HTMLElement>(
        '.ytp-caption-segment, .caption-visual-line',
      );
      for (const segment of segments) {
        // YouTube can keep an element while replacing its children. A rendered
        // marker lets us distinguish that new native text from OWT's own spans.
        if (
          segment.getAttribute('data-owt-rendered') === 'true' &&
          !segment.querySelector('[data-owt-subtitle-line]')
        ) {
          segment.removeAttribute('data-owt-original');
          segment.removeAttribute('data-owt-fingerprint');
          segment.removeAttribute('data-owt-rendered');
        }

        let originalText = segment.getAttribute('data-owt-original');
        if (!originalText) {
          originalText = (segment.textContent || '').trim();
          if (!originalText) continue;
          segment.setAttribute('data-owt-original', originalText);
        }

        const fingerprint = [
          this.currentVideoId,
          originalText,
          this.targetLang,
          this.displayMode,
          this.subtitleOriginalFontSize,
          this.subtitleTranslatedFontSize,
          this.subtitleOriginalColor,
          this.subtitleTranslatedColor,
        ].join('|');

        const cached = this.inlineTranslationCache.get(fingerprint);
        if (cached) {
          if (segment.getAttribute('data-owt-fingerprint') !== fingerprint) {
            segment.setAttribute('data-owt-fingerprint', fingerprint);
            segment.removeAttribute('data-owt-pending');
            this.renderInlineSegment(segment, originalText, cached);
          }
          continue;
        }

        if (
          segment.getAttribute('data-owt-fingerprint') === fingerprint ||
          this.pendingRequests.has(fingerprint)
        ) {
          continue;
        }

        segment.setAttribute('data-owt-fingerprint', fingerprint);
        segment.setAttribute('data-owt-pending', 'true');
        // Keep native text visible while translation is in flight.
        segment.style.opacity = '1';
        void this.fetchInlineTranslation(segment, originalText, fingerprint, this.routeGeneration);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async fetchInlineTranslation(
    segment: HTMLElement,
    originalText: string,
    fingerprint: string,
    generation: number,
  ) {
    const abortController = new AbortController();
    this.pendingRequests.set(fingerprint, { fingerprint, abortController });

    try {
      const response = await messageRouter.sendMessage({
        type: 'TRANSLATE_REQUEST',
        segments: [{ id: 'yt-caption', text: originalText }],
        sourceLanguage: 'auto',
        targetLanguage: this.targetLang,
      });

      if (
        !this.isActive ||
        this.routeGeneration !== generation ||
        abortController.signal.aborted
      ) {
        return;
      }

      // Never render into a detached or already-updated caption node.
      if (
        !segment.isConnected ||
        segment.getAttribute('data-owt-original') !== originalText
      ) {
        this.processCaptions();
        return;
      }

      const translatedText =
        response?.segments?.find((item) => item.id === 'yt-caption')?.translatedText ||
        response?.segments?.[0]?.translatedText;
      if (!translatedText) {
        segment.style.opacity = '1';
        segment.removeAttribute('data-owt-pending');
        return;
      }

      this.inlineTranslationCache.set(fingerprint, translatedText);
      segment.removeAttribute('data-owt-pending');
      this.renderInlineSegment(segment, originalText, translatedText);
    } catch (error) {
      if (this.routeGeneration === generation && !abortController.signal.aborted) {
        segment.style.opacity = '1';
        segment.removeAttribute('data-owt-pending');
        logger.error('Subtitle inline translation failed', error);
      }
    } finally {
      this.pendingRequests.delete(fingerprint);
    }
  }

  private enableDrag(windowElement: HTMLElement) {
    if (this.dragCleanups.has(windowElement)) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'A' || target.tagName === 'BUTTON') return;

      isDragging = true;
      windowElement.setAttribute('data-owt-user-dragged', 'true');
      startX = event.clientX;
      startY = event.clientY;
      const rect = windowElement.getBoundingClientRect();
      const parentRect =
        windowElement.parentElement?.getBoundingClientRect() ||
        document.body.getBoundingClientRect();
      initialLeft = rect.left - parentRect.left;
      initialTop = rect.top - parentRect.top;
      windowElement.style.setProperty('transform', 'none', 'important');
      windowElement.style.setProperty('left', `${initialLeft}px`, 'important');
      windowElement.style.setProperty('top', `${initialTop}px`, 'important');
      windowElement.style.setProperty('bottom', 'auto', 'important');
      windowElement.style.cursor = 'grabbing';
      event.preventDefault();
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!isDragging) return;
      windowElement.style.setProperty(
        'left',
        `${initialLeft + event.clientX - startX}px`,
        'important',
      );
      windowElement.style.setProperty(
        'top',
        `${initialTop + event.clientY - startY}px`,
        'important',
      );
    };
    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      windowElement.style.cursor = 'grab';
    };

    windowElement.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseup', onMouseUp);
    this.dragCleanups.set(windowElement, () => {
      windowElement.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    });
  }

  private cleanupDragHandlers() {
    for (const cleanup of this.dragCleanups.values()) cleanup();
    this.dragCleanups.clear();
  }

  private renderInlineSegment(
    segment: HTMLElement,
    originalText: string,
    translatedText: string,
  ) {
    if (!this.isActive || !segment.isConnected) return;

    const windowElement = segment.closest(
      '.ytp-caption-window-bottom, .caption-window, .ytp-caption-window-container',
    ) as HTMLElement | null;
    if (windowElement) {
      if (!windowElement.hasAttribute('data-owt-drag-initialized')) {
        windowElement.setAttribute('data-owt-drag-initialized', 'true');
        windowElement.style.cursor = 'grab';
        this.enableDrag(windowElement);
      }

      if (!windowElement.hasAttribute('data-owt-user-dragged')) {
        windowElement.style.setProperty('top', 'auto', 'important');
        windowElement.style.setProperty('bottom', '80px', 'important');
        windowElement.style.setProperty('left', '50%', 'important');
        windowElement.style.setProperty('transform', 'translateX(-50%)', 'important');
        windowElement.style.setProperty('width', 'fit-content', 'important');
        windowElement.style.setProperty('max-width', '90%', 'important');
        windowElement.style.setProperty('text-align', 'center', 'important');
        windowElement.style.setProperty('margin', '0 auto', 'important');
      }
    }

    this.observer?.disconnect();
    segment.innerHTML = '';
    segment.style.display = 'inline-flex';
    segment.style.flexDirection = 'column';
    segment.style.alignItems = 'center';
    segment.style.justifyContent = 'center';
    segment.style.textAlign = 'center';
    segment.style.width = 'fit-content';
    segment.style.maxWidth = '100%';
    segment.style.margin = '0 auto';
    segment.style.opacity = '1';
    segment.setAttribute('data-owt-rendered', 'true');

    const createLine = (
      text: string,
      color: string,
      bold: boolean,
      fontSize: string,
      kind: 'original' | 'translated',
    ) => {
      const line = document.createElement('span');
      line.setAttribute('data-owt-subtitle-line', kind);
      line.style.display = 'inline-block';
      line.style.width = 'fit-content';
      line.style.maxWidth = '100%';
      line.style.color = color || '#ffffff';
      line.style.fontWeight = bold ? '700' : '500';
      line.style.fontSize = fontSize;
      line.style.lineHeight = '1.35';
      line.style.background = 'rgba(8,8,8,.85)';
      line.style.padding = '5px 12px';
      line.style.borderRadius = '6px';
      line.style.margin = '3px auto';
      line.style.textAlign = 'center';
      line.style.textShadow = '0 2px 4px rgba(0,0,0,.95), 0 0 6px rgba(0,0,0,.85)';
      line.textContent = text;
      return line;
    };

    const originalFontSize = `${this.subtitleOriginalFontSize}px`;
    const translatedFontSize = `${this.subtitleTranslatedFontSize}px`;
    if (this.displayMode === 'immersive') {
      segment.appendChild(
        createLine(translatedText, this.subtitleTranslatedColor, true, translatedFontSize, 'translated'),
      );
    } else if (this.displayMode === 'translation-first') {
      segment.appendChild(
        createLine(translatedText, this.subtitleTranslatedColor, true, translatedFontSize, 'translated'),
      );
      segment.appendChild(
        createLine(originalText, this.subtitleOriginalColor, false, originalFontSize, 'original'),
      );
    } else {
      segment.appendChild(
        createLine(originalText, this.subtitleOriginalColor, false, originalFontSize, 'original'),
      );
      segment.appendChild(
        createLine(translatedText, this.subtitleTranslatedColor, true, translatedFontSize, 'translated'),
      );
    }

    this.observer?.observe(this.observerTarget || document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  private abortPendingRequests() {
    for (const state of this.pendingRequests.values()) state.abortController.abort();
    this.pendingRequests.clear();
  }
}









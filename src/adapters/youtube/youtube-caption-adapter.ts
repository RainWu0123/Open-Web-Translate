import { messageRouter } from '@/infrastructure/messaging/message-router';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { createLogger } from '@/shared/logger';

const logger = createLogger('YouTubeCaptionAdapter');

interface RequestState {
  fingerprint: string;
  abortController: AbortController;
}

export class YouTubeCaptionAdapter {
  private isActive = false;
  private observer: MutationObserver | null = null;
  private observerTarget: Element | null = null;
  private controlsButton: HTMLElement | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMouseMoveTime = 0;

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

  constructor() {
    // Constructor kept lightweight
  }

  public init() {
    if (typeof window !== 'undefined' && window.location?.hostname?.includes('youtube.com')) {
      logger.info('Initializing YouTubeCaptionAdapter on youtube.com');
      this.setupNavigationListeners();
      this.setupSettingsListener();
      this.setupMouseMoveInjectionListener();

      this.injectControlsButton();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          this.injectControlsButton();
        }, { once: true });
      }
    }
  }

  /**
   * Listens to mouse movements on YouTube.
   * When controls reappear on hover, ensures OWT button is always injected.
   */
  private setupMouseMoveInjectionListener() {
    if (typeof window === 'undefined') return;

    window.addEventListener(
      'mousemove',
      () => {
        const now = Date.now();
        // Throttle check to at most once per 400ms
        if (now - this.lastMouseMoveTime < 400) return;
        this.lastMouseMoveTime = now;

        if (window.location.hostname.includes('youtube.com')) {
          const btn = document.querySelector('.owt-yt-toggle-btn');
          if (!btn) {
            this.injectControlsButton();
          }
        }
      },
      { passive: true }
    );
  }

  private setupSettingsListener() {
    try {
      SettingsStorage.onChange((newSettings) => {
        if (newSettings) {
          this.subtitleOriginalFontSize = newSettings.subtitleOriginalFontSize || 18;
          this.subtitleTranslatedFontSize = newSettings.subtitleTranslatedFontSize || 22;
          this.subtitleOriginalColor = newSettings.subtitleOriginalColor || '#ffffff';
          this.subtitleTranslatedColor = newSettings.subtitleTranslatedColor || '#818cf8';
          this.targetLang = newSettings.targetLanguage || 'zh-Hant';
          this.displayMode = newSettings.displayMode || 'bilingual';
          if (this.isActive) {
            this.processCaptions();
          }
        }
      });
    } catch {
      // Ignore if storage listener unavailable
    }
  }

  private setupNavigationListeners() {
    let lastUrl = window.location.href;
    const handleNavigation = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        const newVideoId = new URLSearchParams(window.location.search).get('v');
        if (newVideoId !== this.currentVideoId) {
          this.currentVideoId = newVideoId;
          this.routeGeneration++;
          this.abortPendingRequests();
          this.restoreNativeSegments();
        }
        this.injectControlsButton();
      }
    };

    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('hashchange', handleNavigation);
    window.addEventListener('yt-navigate-finish', handleNavigation);
  }

  private async handleToggleClick() {
    if (this.isActive) {
      this.stop();
    } else {
      try {
        const settings = await messageRouter.sendMessage({ type: 'GET_SETTINGS' }).catch(() => null);
        const targetLang = settings?.targetLanguage || 'zh-Hant';
        const displayMode = settings?.displayMode || 'bilingual';
        const origSize = settings?.subtitleOriginalFontSize || 18;
        const transSize = settings?.subtitleTranslatedFontSize || 22;
        const origColor = settings?.subtitleOriginalColor || '#ffffff';
        const transColor = settings?.subtitleTranslatedColor || '#818cf8';
        await this.start(targetLang, displayMode, origSize, transSize, origColor, transColor);
      } catch (e) {
        await this.start('zh-Hant', 'bilingual', 18, 22, '#ffffff', '#818cf8');
      }
    }
  }

  private maxConcurrentRequests = 3;
  private activeRequestCount = 0;
  private requestQueue: Array<() => void> = [];

  private async acquireSlot(): Promise<void> {
    if (this.activeRequestCount < this.maxConcurrentRequests) {
      this.activeRequestCount++;
      return;
    }
    return new Promise((resolve) => {
      this.requestQueue.push(() => {
        this.activeRequestCount++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.activeRequestCount--;
    const next = this.requestQueue.shift();
    if (next) next();
  }

  private injectControlsButton() {
    if (typeof document === 'undefined') return;

    const subtitlesBtn = document.querySelector('.ytp-subtitles-button');
    const settingsBtn = document.querySelector('.ytp-settings-button');
    const rightControls =
      subtitlesBtn?.parentElement ||
      settingsBtn?.parentElement ||
      document.querySelector('.ytp-right-controls');

    if (!rightControls) return;

    let btn = rightControls.querySelector('.owt-yt-toggle-btn') as HTMLButtonElement | null;
    if (btn && document.body.contains(btn)) {
      this.controlsButton = btn;
      this.updateControlsButtonState();
      return;
    }

    btn = document.createElement('button');
    btn.className = 'ytp-button owt-yt-toggle-btn';
    btn.setAttribute('aria-label', 'OWT 雙語字幕');
    btn.setAttribute('title', 'OWT 雙語字幕 (點擊開啟/關閉)');

    btn.innerHTML = `
      <svg height="100%" viewBox="0 0 36 36" width="100%" style="padding: 6px; box-sizing: border-box; display: block; width: 100%; height: 100%;">
        <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02 1.42 1.42 5.09-5.02 3.12 3.12 1.65-2.03zM21.5 10l-4.5 12h2.15l1.2-3.2h4.7l1.2 3.2h2.15L23.9 10h-2.4zm-0.4 6.8l1.6-4.27 1.6 4.27h-3.2z" fill="rgba(255, 255, 255, 0.85)"/>
      </svg>
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleToggleClick();
    });

    if (subtitlesBtn && subtitlesBtn.nextSibling) {
      subtitlesBtn.parentNode?.insertBefore(btn, subtitlesBtn.nextSibling);
    } else if (settingsBtn) {
      settingsBtn.parentNode?.insertBefore(btn, settingsBtn);
    } else {
      rightControls.appendChild(btn);
    }

    this.controlsButton = btn;
    this.updateControlsButtonState();
    logger.info('Injected OWT button into YouTube controls');
  }

  private updateControlsButtonState() {
    if (!this.controlsButton) return;
    if (this.isActive) {
      this.controlsButton.classList.add('owt-active');
    } else {
      this.controlsButton.classList.remove('owt-active');
    }

    const svg = this.controlsButton.querySelector('svg');
    if (svg) {
      const color = this.isActive ? '#818cf8' : 'rgba(255, 255, 255, 0.85)';
      svg.style.fill = color;
      svg.style.color = color;
      const path = svg.querySelector('path');
      if (path) path.setAttribute('fill', color);
      svg.style.filter = this.isActive ? 'drop-shadow(0 0 6px rgba(129, 140, 248, 0.9))' : 'none';
    }
  }

  async start(targetLang: string, displayMode: string, origSize = 18, transSize = 22, origColor = '#ffffff', transColor = '#818cf8') {
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
    logger.info('YouTubeCaptionAdapter started', { targetLang, displayMode, origSize, transSize, origColor, transColor });
  }

  stop() {
    this.isActive = false;

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      this.observerTarget = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.requestQueue = [];
    this.activeRequestCount = 0;
    this.inlineTranslationCache.clear();
    this.abortPendingRequests();
    this.restoreNativeSegments();
    this.updateControlsButtonState();
    logger.info('YouTubeCaptionAdapter stopped');
  }

  private restoreNativeSegments() {
    const segments = document.querySelectorAll('[data-owt-original]');
    segments.forEach((seg) => {
      const original = seg.getAttribute('data-owt-original');
      if (original) {
        seg.textContent = original;
      }
      (seg as HTMLElement).style.opacity = '';
      seg.removeAttribute('data-owt-original');
      seg.removeAttribute('data-owt-fingerprint');
    });

    const windows = document.querySelectorAll('.ytp-caption-window-bottom, .caption-window, .ytp-caption-window-container');
    windows.forEach((win) => {
      const el = win as HTMLElement;
      el.style.left = '';
      el.style.top = '';
      el.style.bottom = '';
      el.style.transform = '';
      el.style.width = '';
      el.style.textAlign = '';
      el.style.cursor = '';
      el.removeAttribute('data-owt-drag-initialized');
      el.removeAttribute('data-owt-user-dragged');
    });
  }

  private startObserver() {
    if (this.observer) this.observer.disconnect();

    const targetNode =
      document.querySelector('.ytp-caption-window-container') ||
      document.querySelector('#ytp-caption-window-container') ||
      document.querySelector('#movie_player .captions-text') ||
      document.querySelector('#movie_player') ||
      (window.location.hostname.includes('youtube.com') ? document.body : null);

    if (!targetNode) {
      logger.warn('No YouTube player container found for caption observation');
      return;
    }

    this.observerTarget = targetNode;

    this.observer = new MutationObserver(() => {
      if (this.isActive) this.processCaptions();
    });
    this.observer.observe(targetNode, { childList: true, subtree: true, characterData: true });

    this.processCaptions();
  }

  private processCaptions(): void {
    if (!this.isActive) return;

    const segments = document.querySelectorAll('.ytp-caption-segment, .caption-visual-line');
    if (segments.length === 0) return;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i] as HTMLElement;

      let originalText = seg.getAttribute('data-owt-original');
      if (!originalText) {
        originalText = (seg.textContent || '').trim();
        if (!originalText) continue;
        seg.setAttribute('data-owt-original', originalText);
      }

      const fingerprint = `${this.currentVideoId}|${originalText}|${this.targetLang}|${this.displayMode}|${this.subtitleOriginalFontSize}|${this.subtitleTranslatedFontSize}|${this.subtitleOriginalColor}|${this.subtitleTranslatedColor}`;
      
      const cached = this.inlineTranslationCache.get(fingerprint);
      if (cached) {
        if (seg.getAttribute('data-owt-fingerprint') !== fingerprint) {
          seg.setAttribute('data-owt-fingerprint', fingerprint);
          seg.style.opacity = '1';
          this.renderInlineSegment(seg, originalText, cached);
        }
        continue;
      }

      if (seg.getAttribute('data-owt-fingerprint') === fingerprint) {
        continue;
      }

      if (this.pendingRequests.has(fingerprint)) {
        seg.setAttribute('data-owt-fingerprint', fingerprint);
        seg.style.opacity = '0';
        continue;
      }

      seg.setAttribute('data-owt-fingerprint', fingerprint);
      seg.style.opacity = '0';
      this.fetchInlineTranslation(seg, originalText, fingerprint, this.routeGeneration);
    }
  }

  private getElementsWithFingerprint(fingerprint: string): HTMLElement[] {
    const all = document.querySelectorAll('[data-owt-fingerprint]');
    const results: HTMLElement[] = [];
    all.forEach((el) => {
      if (el.getAttribute('data-owt-fingerprint') === fingerprint) {
        results.push(el as HTMLElement);
      }
    });
    return results;
  }

  private async fetchInlineTranslation(seg: HTMLElement, originalText: string, fingerprint: string, generation: number) {
    await this.acquireSlot();
    const abortController = new AbortController();
    this.pendingRequests.set(fingerprint, { fingerprint, abortController });

    try {
      const response = await messageRouter.sendMessage({
        type: 'TRANSLATE_REQUEST',
        segments: [{ id: 'yt-caption', text: originalText }],
        sourceLanguage: 'auto',
        targetLanguage: this.targetLang,
      });

      if (!this.isActive || this.routeGeneration !== generation || abortController.signal.aborted) {
        return;
      }

      const translatedText = response?.segments?.[0]?.translatedText || '';
      if (!translatedText) {
        const targets = this.getElementsWithFingerprint(fingerprint);
        if (targets.length > 0) {
          targets.forEach((t) => {
            t.style.opacity = '1';
            this.renderInlineSegment(t, originalText, '⚠️ 翻譯失敗: 無法取得翻譯結果');
          });
        } else if (document.body.contains(seg)) {
          seg.style.opacity = '1';
          this.renderInlineSegment(seg, originalText, '⚠️ 翻譯失敗: 無法取得翻譯結果');
        }
        return;
      }

      this.inlineTranslationCache.set(fingerprint, translatedText);

      const targets = this.getElementsWithFingerprint(fingerprint);
      if (targets.length > 0) {
        targets.forEach((t) => {
          t.style.opacity = '1';
          this.renderInlineSegment(t, originalText, translatedText);
        });
      } else if (document.body.contains(seg)) {
        seg.style.opacity = '1';
        this.renderInlineSegment(seg, originalText, translatedText);
      }
    } catch (err: any) {
      if (this.routeGeneration !== generation || abortController.signal.aborted) return;
      
      const targets = this.getElementsWithFingerprint(fingerprint);
      if (targets.length > 0) {
        targets.forEach((t) => {
          t.style.opacity = '1';
          this.renderInlineSegment(t, originalText, `⚠️ 翻譯失敗: ${err?.message || 'API 請求失敗'}`);
        });
      } else if (document.body.contains(seg)) {
        seg.style.opacity = '1';
        this.renderInlineSegment(seg, originalText, `⚠️ 翻譯失敗: ${err?.message || 'API 請求失敗'}`);
      }
      logger.error('Subtitle inline translation failed', err);
    } finally {
      this.pendingRequests.delete(fingerprint);
      this.releaseSlot();
    }
  }

  private enableDrag(win: HTMLElement) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'A' || (e.target as HTMLElement).tagName === 'BUTTON') return;
      isDragging = true;
      win.setAttribute('data-owt-user-dragged', 'true');
      startX = e.clientX;
      startY = e.clientY;
      const rect = win.getBoundingClientRect();
      const parentRect = win.parentElement?.getBoundingClientRect() || document.body.getBoundingClientRect();
      initialLeft = rect.left - parentRect.left;
      initialTop = rect.top - parentRect.top;

      win.style.setProperty('transform', 'none', 'important');
      win.style.setProperty('left', `${initialLeft}px`, 'important');
      win.style.setProperty('top', `${initialTop}px`, 'important');
      win.style.setProperty('bottom', 'auto', 'important');
      win.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      win.style.setProperty('left', `${initialLeft + dx}px`, 'important');
      win.style.setProperty('top', `${initialTop + dy}px`, 'important');
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        win.style.cursor = 'grab';
      }
    };

    win.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseup', onMouseUp);
  }

  private renderInlineSegment(seg: HTMLElement, originalText: string, translatedText: string) {
    const win = seg.closest('.ytp-caption-window-bottom, .caption-window, .ytp-caption-window-container') as HTMLElement | null;
    if (win) {
      if (!win.hasAttribute('data-owt-drag-initialized')) {
        win.setAttribute('data-owt-drag-initialized', 'true');
        win.style.cursor = 'grab';
        this.enableDrag(win);
      }

      if (!win.hasAttribute('data-owt-user-dragged')) {
        win.style.setProperty('top', 'auto', 'important');
        win.style.setProperty('bottom', '80px', 'important');
        win.style.setProperty('left', '50%', 'important');
        win.style.setProperty('transform', 'translateX(-50%)', 'important');
        win.style.setProperty('width', 'fit-content', 'important');
        win.style.setProperty('max-width', '90%', 'important');
        win.style.setProperty('text-align', 'center', 'important');
        win.style.setProperty('margin', '0 auto', 'important');
      }
    }

    if (this.observer && this.observerTarget) {
      this.observer.disconnect();
    }

    seg.innerHTML = '';
    seg.style.display = 'inline-flex';
    seg.style.flexDirection = 'column';
    seg.style.alignItems = 'center';
    seg.style.justifyContent = 'center';
    seg.style.textAlign = 'center';
    seg.style.width = 'fit-content';
    seg.style.maxWidth = '100%';
    seg.style.margin = '0 auto';

    const origFontSize = `${this.subtitleOriginalFontSize}px`;
    const transFontSize = `${this.subtitleTranslatedFontSize}px`;
    const origColor = this.subtitleOriginalColor || '#ffffff';
    const transColor = this.subtitleTranslatedColor || '#818cf8';

    const createSpan = (text: string, color: string, isBold = false, fontSize = '20px') => {
      const span = document.createElement('span');
      span.style.display = 'inline-block';
      span.style.width = 'fit-content';
      span.style.color = color;
      span.style.fontWeight = isBold ? '700' : '500';
      span.style.fontSize = fontSize;
      span.style.lineHeight = '1.35';
      span.style.background = 'rgba(8, 8, 8, 0.85)';
      span.style.padding = '5px 12px';
      span.style.borderRadius = '6px';
      span.style.margin = '3px auto';
      span.style.textAlign = 'center';
      span.style.textShadow = '0 2px 4px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)';
      span.textContent = text;
      return span;
    };

    if (this.displayMode === 'immersive') {
      seg.appendChild(createSpan(translatedText, transColor, true, transFontSize));
    } else if (this.displayMode === 'translation-first') {
      seg.appendChild(createSpan(translatedText, transColor, true, transFontSize));
      seg.appendChild(createSpan(originalText, origColor, false, origFontSize));
    } else {
      // bilingual (default)
      seg.appendChild(createSpan(originalText, origColor, false, origFontSize));
      seg.appendChild(createSpan(translatedText, transColor, true, transFontSize));
    }

    if (this.observer && this.observerTarget) {
      this.observer.observe(this.observerTarget, { childList: true, subtree: true });
    }
  }

  private abortPendingRequests() {
    for (const [_, state] of this.pendingRequests.entries()) {
      state.abortController.abort();
    }
    this.pendingRequests.clear();
  }
}

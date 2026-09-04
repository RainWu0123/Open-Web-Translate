import { messageRouter } from '@/infrastructure/messaging/message-router';
import { createLogger } from '@/shared/logger';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import { CaptionAdapterBase } from '@/adapters/caption-adapter-base';
import { composeBilingualLines, type BilingualDisplayMode } from '@/shared/subtitles/bilingual-lines';

import { YT_BRIDGE, postToMain, subscribeToYouTubeBridge, type YouTubeTrack } from './youtube-bridge';

const logger = createLogger('YouTubeCaptionAdapter');

interface RequestState {
  fingerprint: string;
  abortController: AbortController;
}

export class YouTubeCaptionAdapter extends CaptionAdapterBase {
  private observer: MutationObserver | null = null;
  private observerTarget: Element | null = null;

  private pendingRequests = new Map<string, RequestState>();
  /** Rolling source=>translation window so AI lines stay coherent. */
  private recentAiContext: Array<{ source: string; translation: string }> = [];

  private discoveredTracks: YouTubeTrack[] = [];
  private selectedTrackId: string | null = null;
  private unsubscribeBridge: (() => void) | null = null;

  constructor() {
    super();
  }

  public init() {
    if (typeof window !== 'undefined' && window.location?.hostname?.includes('youtube.com')) {
      logger.info('Initializing YouTubeCaptionAdapter on youtube.com');
      this.setupNavigationListeners();
      this.loadInitialSettings();
      this.setupSettingsListener();
      this.setupBridgeListener();
      this.requestTracks();
    }
  }

  private setupBridgeListener() {
    if (this.unsubscribeBridge || typeof window === 'undefined') return;

    this.unsubscribeBridge = subscribeToYouTubeBridge((data) => {
      if (data.type === YT_BRIDGE.messageType.TRACKS_UPDATED) {
        if (Array.isArray(data.tracks)) {
          this.discoveredTracks = data.tracks;
          logger.info('Discovered YouTube tracks:', this.discoveredTracks);
          if (this.isActive) {
            this.ensureCorrectTrackSelected();
          }
        }
        if (data.selectedTrackId !== undefined) {
          this.selectedTrackId = data.selectedTrackId;
        }
      }
    });
  }

  private ensureCorrectTrackSelected() {
    if (!this.discoveredTracks || this.discoveredTracks.length === 0) return;

    if (this.sourceLang && this.sourceLang !== 'auto') {
      const hasMatch = this.discoveredTracks.some(
        (t) => t.languageCode === this.sourceLang || t.languageCode?.startsWith(this.sourceLang),
      );
      if (hasMatch && this.selectedTrackId !== this.sourceLang) {
        logger.info(`Switching YouTube track to configured sourceLang: ${this.sourceLang}`);
        this.setTrack(this.sourceLang);
        return;
      }
    }

    // Auto mode: prioritize original track
    // If current selectedTrackId matches the target language prefix (e.g. 'zh' for zh-Hant)
    // but tracks outside the target language exist, auto-switch to original track!
    const targetPrefix = this.targetLang?.split('-')[0]?.toLowerCase();
    if (targetPrefix) {
      const isCurrentTarget = this.selectedTrackId?.toLowerCase().startsWith(targetPrefix);
      const hasNonTarget = this.discoveredTracks.some(
        (t) => !t.languageCode?.toLowerCase().startsWith(targetPrefix),
      );
      if (isCurrentTarget && hasNonTarget) {
        logger.info(`Current track is in target language (${targetPrefix}), auto-switching to original track`);
        this.setTrack('auto');
      }
    }
  }

  public requestTracks(): void {
    if (typeof window !== 'undefined') {
      postToMain(YT_BRIDGE.messageType.REQUEST_TRACKS);
    }
  }

  public setTrack(languageCode: string): void {
    this.selectedTrackId = languageCode;
    if (typeof window !== 'undefined') {
      postToMain(YT_BRIDGE.messageType.SET_TRACK, {
        languageCode,
        targetLanguage: this.targetLang,
      });
    }
    this.inlineTranslationCache.clear();
    this.restoreNativeSegments();
  }

  /** Popup entry point: current bilingual-subtitle state. */
  public getStateInfo(): {
    isActive: boolean;
    tracks: YouTubeTrack[];
    selectedTrackId: string | null;
  } {
    return {
      isActive: this.isActive,
      tracks: this.discoveredTracks,
      selectedTrackId: this.selectedTrackId,
    };
  }

  /** Popup entry point: turn the bilingual subtitle engine on/off. */
  public setActive(active: boolean): void {
    if (active === this.isActive) return;
    if (active) {
      void this.start();
    } else {
      this.stop();
    }
  }

  private setupNavigationListeners() {
    const handleNavigation = this.createNavigationHandler(() =>
      new URLSearchParams(window.location.search).get('v'),
    );

    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('hashchange', handleNavigation);
    window.addEventListener('yt-navigate-finish', handleNavigation);
  }

  protected onVideoChanged(): void {
    this.abortPendingRequests();
    this.restoreNativeSegments();
    this.recentAiContext = [];
    this.requestTracks();
  }

  protected onSharedSettingsApplied(settings: any): void {
    if (settings?.sourceLanguage && settings.sourceLanguage !== 'auto') {
      this.setTrack(settings.sourceLanguage);
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



  async start(
    targetLang?: string,
    displayMode?: string,
    origSize: number = DEFAULT_SETTINGS.subtitleOriginalFontSize ?? 18,
    transSize: number = DEFAULT_SETTINGS.subtitleTranslatedFontSize ?? 22,
    origColor: string = DEFAULT_SETTINGS.subtitleOriginalColor ?? '#ffffff',
    transColor: string = DEFAULT_SETTINGS.subtitleTranslatedColor ?? '#818cf8',
  ) {
    if (targetLang) this.targetLang = targetLang;
    if (displayMode) this.displayMode = displayMode;
    this.subtitleOriginalFontSize = origSize;
    this.subtitleTranslatedFontSize = transSize;
    this.subtitleOriginalColor = origColor;
    this.subtitleTranslatedColor = transColor;
    this.currentVideoId = new URLSearchParams(window.location.search).get('v');

    this.isActive = true;
    this.ensureNativeSubtitlesEnabled();
    this.setTrack(this.sourceLang || 'auto');
    this.startObserver();
    logger.info('YouTubeCaptionAdapter started', { targetLang, displayMode, origSize, transSize, origColor, transColor });
  }

  private ensureNativeSubtitlesEnabled(): void {
    try {
      if (typeof document === 'undefined') return;
      const ccButton = document.querySelector<HTMLButtonElement>('.ytp-subtitles-button');
      if (ccButton && ccButton.getAttribute('aria-pressed') === 'false') {
        logger.info('Auto-enabling YouTube native captions via .ytp-subtitles-button');
        ccButton.click();
      }
    } catch (err) {
      logger.debug('Failed to auto-enable native YouTube captions', err);
    }
  }

  stop() {
    this.isActive = false;

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      this.observerTarget = null;
    }
    this.clearDebounceTimer();

    this.requestQueue = [];
    this.activeRequestCount = 0;
    this.inlineTranslationCache.clear();
    this.abortPendingRequests();
    this.restoreNativeSegments();
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

  public processCaptions(): void {
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
        sourceLanguage: this.sourceLang,
        targetLanguage: this.targetLang,
        context: { previous: [...this.recentAiContext] },
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
      this.recentAiContext.push({ source: originalText, translation: translatedText });
      if (this.recentAiContext.length > 8) this.recentAiContext.shift();

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

    const lines = composeBilingualLines(
      originalText,
      translatedText,
      (this.displayMode as BilingualDisplayMode) || 'bilingual',
      {
        originalFontSize: `${this.subtitleOriginalFontSize}px`,
        translatedFontSize: `${this.subtitleTranslatedFontSize}px`,
        originalColor: this.subtitleOriginalColor || '#ffffff',
        translatedColor: this.subtitleTranslatedColor || '#818cf8',
      },
    );

    for (const line of lines) {
      seg.appendChild(createSpan(line.text, line.color, line.bold, line.fontSize));
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

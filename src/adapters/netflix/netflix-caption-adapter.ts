import { messageRouter } from '@/infrastructure/messaging/message-router';
import { parseNetflixTtml, type SubtitleCue } from '@/shared/subtitles/ttml-parser';
import { createLogger } from '@/shared/logger';
import { SubtitleOverlayRenderer } from '@/shared/ui/subtitle-overlay-renderer';
import type { NetflixConfig, NetflixStateInfo } from '@/core/contracts/messages';
import { CaptionAdapterBase } from '@/adapters/caption-adapter-base';
import { NetflixTrackManager, type DiscoveredTrack } from './netflix-track-manager';
import { NetflixSyncEngine } from './netflix-sync-engine';

const logger = createLogger('NetflixCaptionAdapter');

/**
 * Netflix renders timed text inside a player-owned subtree that is frequently
 * replaced while the player is loading or navigating. We therefore keep the
 * native caption DOM read-only and render OWT's bilingual caption in a top-level
 * fixed layer. This prevents Netflix from deleting the translated line during
 * its next caption update.
 */
export class NetflixCaptionAdapter extends CaptionAdapterBase {
  private observer: MutationObserver | null = null;
  private controlsButton: HTMLElement | null = null;
  private selectorMenu: HTMLElement | null = null;

  private discoveredTracks: DiscoveredTrack[] = [];
  private selectedTrackId = 'ai-translate';
  private secondaryCues: SubtitleCue[] = [];

  private pendingTranslationFingerprints = new Set<string>();
  private lastProcessedText = '';
  private overlayPositionListenersAttached = false;

  private trackManager = new NetflixTrackManager();
  private syncEngine = new NetflixSyncEngine();
  private overlayRenderer = new SubtitleOverlayRenderer('owt-netflix-overlay-host');

  public getTrackManager(): NetflixTrackManager {
    return this.trackManager;
  }

  public getSyncEngine(): NetflixSyncEngine {
    return this.syncEngine;
  }

  public getOverlayRenderer(): SubtitleOverlayRenderer {
    return this.overlayRenderer;
  }

  public getStateInfo(): NetflixStateInfo {
    return {
      isActive: this.isActive,
      primaryStatus: this.isActive ? 'active' : 'idle',
      secondaryStatus: this.selectedTrackId === 'ai-translate' ? 'ai' : 'track',
      modeLabel: this.displayMode,
      modeClass: this.selectedTrackId === 'ai-translate' ? 'ai-mode' : 'dual-native',
      adapterState: this.trackManager.getAdapterState(),
      discoveredTracksCount: this.discoveredTracks.length,
      selectedTrackId: this.selectedTrackId,
      secondaryCuesCount: this.secondaryCues.length,
    };
  }

  /**
   * Apply NetflixConfig pushed from the popup options card.
   * Maps the card's slider values onto the overlay renderer settings and
   * re-renders the current caption so changes are visible immediately.
   */
  public updateConfig(config: Partial<NetflixConfig>): void {
    if (config.primarySize !== undefined) this.subtitleOriginalFontSize = config.primarySize;
    if (config.secondarySize !== undefined) this.subtitleTranslatedFontSize = config.secondarySize;
    if (config.enabled === false && this.isActive) {
      this.stop();
      return;
    }
    if (this.isActive) {
      this.lastProcessedText = '';
      this.processCaptions();
    }
  }

  public applyNativeSubtitleMask(enable: boolean) {
    const styleId = 'owt-hide-native-netflix-subtitles';
    let styleEl = document.getElementById(styleId);
    if (enable) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `.player-timedtext, .player-timed-text-image-container, [data-uia="player-timedtext"], [data-uia="watch-video--timed-text"] { visibility: hidden !important; display: none !important; opacity: 0 !important; }`;
        (document.head || document.documentElement).appendChild(styleEl);
      }
    } else {
      if (styleEl) styleEl.remove();
    }
  }

  public async hydrateTrack(track: DiscoveredTrack) {
    if (!track?.url) return { ok: false, reason: 'track-not-found' };
    try {
      const xml = await this.fetchTtmlXml(track.url);
      this.secondaryCues = parseNetflixTtml(xml);
      return { ok: true, source: 'manifest', cues: this.secondaryCues };
    } catch (err) {
      return { ok: false, reason: 'timeout' };
    }
  }

  public init() {
    if (typeof window === 'undefined' || !window.location?.hostname?.includes('netflix.com')) {
      return;
    }

    logger.info('Initializing NetflixCaptionAdapter on netflix.com');
    this.setupNavigationListeners();
    this.loadInitialSettings();
    this.setupSettingsListener();
    this.wireControlsButtonReinjection();
    this.setupMainWorldMessageListener();
    this.setupOverlayPositionListeners();

    this.injectControlsButton();
    if (document.readyState === 'loading') {
      document.addEventListener(
        'DOMContentLoaded',
        () => this.injectControlsButton(),
        { once: true },
      );
    }
  }

  private setupMainWorldMessageListener() {
    const handleTracksPayload = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const data = payload as { type?: string; tracks?: unknown };
      if (
        (data.type === 'OWT_NETFLIX_TRACKS_DISCOVERED' ||
         data.type === 'OWT_NETFLIX_TRACKS_UPDATED' ||
         data.type === 'OWT_NETFLIX_MANIFEST_TRACKS') &&
        Array.isArray(data.tracks)
      ) {
        this.discoveredTracks = data.tracks as DiscoveredTrack[];
        this.trackManager.setDiscoveredTracks(this.discoveredTracks);
        this.updateSelectorMenuOptions();
      }
    };

    // Primary channel: postMessage from the MAIN-world script.
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      handleTracksPayload(event.data);
    });

    // Fallback channel: CustomEvent carrying a JSON-stringified payload.
    // Firefox has thrown DataCloneError on postMessage payloads crossing the
    // page/content boundary in some versions; the MAIN-world script mirrors
    // every TRACKS_UPDATED dispatch on this channel, so failing postMessage
    // alone must not lose the tracks.
    document.addEventListener('owt:tracks-updated', (event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail !== 'string') return;
      try {
        handleTracksPayload(JSON.parse(detail));
      } catch {
        logger.warn('Received malformed owt:tracks-updated payload');
      }
    });
  }

  /**
   * Fetch a TTML/WebVTT track document through the MAIN-world bridge.
   *
   * The subtitle CDN (nflxvideo.net) is cross-origin from netflix.com: page
   * credentials are required and Chrome MV3 content scripts cannot fetch
   * cross-origin directly, so the page-context script performs the download.
   */
  private fetchTtmlViaMainWorld(url: string, timeoutMs = 12000): Promise<string> {
    return new Promise((resolve, reject) => {
      const requestId = `ttml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        clearTimeout(failTimer);
      };

      const onMessage = (event: MessageEvent) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || typeof data !== 'object' || data.type !== 'OWT_NETFLIX_TTML_RESULT' || data.requestId !== requestId) {
          return;
        }
        cleanup();
        if (data.ok && typeof data.xml === 'string' && data.xml.length > 0) {
          resolve(data.xml);
        } else {
          reject(new Error(`HTTP ${data.status || 'network error'}`));
        }
      };

      const failTimer = setTimeout(() => {
        cleanup();
        reject(new Error('MAIN-world bridge timeout'));
      }, timeoutMs);

      window.addEventListener('message', onMessage);
      try {
        window.postMessage(
          { source: 'owt-netflix-content', type: 'OWT_NETFLIX_FETCH_TTML', requestId, url },
          location.origin,
        );
      } catch (err) {
        // Firefox throws DataCloneError synchronously on some payloads;
        // reject immediately so the direct-fetch fallback kicks in instead
        // of hanging until the bridge timeout.
        cleanup();
        reject(err instanceof Error ? err : new Error('postMessage failed'));
      }
    });
  }

  public async fetchTtmlXml(url: string): Promise<string> {
    try {
      return await this.fetchTtmlViaMainWorld(url);
    } catch (bridgeErr) {
      // Fallback: direct fetch works on Firefox MV2 (content scripts honour
      // host permissions) and for same-origin URLs when the bridge is absent.
      logger.warn('MAIN-world TTML fetch failed, falling back to direct fetch', bridgeErr);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    }
  }

  private wireControlsButtonReinjection() {
    this.setupMouseMoveInjectionListener(1000, () => {
      if (!this.controlsButton || !document.body.contains(this.controlsButton)) {
        this.injectControlsButton();
      }
    });
  }

  private getNetflixVideoId(): string {
    const watchMatch = window.location.pathname.match(/\/watch\/(\d+)/);
    return watchMatch ? watchMatch[1] : window.location.href;
  }

  protected onVideoChanged(): void {
    this.lastProcessedText = '';
    this.discoveredTracks = [];
    this.secondaryCues = [];
    this.inlineTranslationCache.clear();
    this.pendingTranslationFingerprints.clear();
    this.clearOverlay();
  }

  protected onSharedSettingsApplied(): void {
    // Force re-render so style changes (size/colors) apply to the visible line.
    this.lastProcessedText = '';
  }

  private setupNavigationListeners() {
    const handleNavigation = this.createNavigationHandler(() => this.getNetflixVideoId());

    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('hashchange', handleNavigation);
    window.addEventListener('owt-netflix-url-change', handleNavigation);

    const win = window as typeof window & { __owtNetflixHistoryPatched?: boolean };
    if (!win.__owtNetflixHistoryPatched) {
      win.__owtNetflixHistoryPatched = true;
      for (const method of ['pushState', 'replaceState'] as const) {
        const original = window.history[method];
        window.history[method] = function (this: History, ...args) {
          const result = original.apply(this, args);
          window.dispatchEvent(new Event('owt-netflix-url-change'));
          return result;
        } as typeof original;
      }
    }
  }

  async start(
    targetLang?: string,
    displayMode?: string,
    origSize = 18,
    transSize = 22,
    origColor = '#ffffff',
    transColor = '#818cf8',
  ) {
    if (targetLang) this.targetLang = targetLang;
    if (displayMode) this.displayMode = displayMode;
    this.subtitleOriginalFontSize = origSize;
    this.subtitleTranslatedFontSize = transSize;
    this.subtitleOriginalColor = origColor;
    this.subtitleTranslatedColor = transColor;

    const videoId = this.getNetflixVideoId();
    if (videoId !== this.currentVideoId) {
      this.currentVideoId = videoId;
      this.routeGeneration += 1;
      this.lastProcessedText = '';
      this.inlineTranslationCache.clear();
    }

    this.isActive = true;
    document.body?.classList.add('owt-netflix-active');
    this.applyNativeSubtitleMask(true);
    
    const host = this.getOverlayHost();
    this.overlayRenderer.mount(host);

    this.updateControlsButtonState();
    this.injectControlsButton();
    this.startObserver();
    logger.info('NetflixCaptionAdapter started', { targetLang: this.targetLang, displayMode: this.displayMode });
  }

  stop() {
    this.isActive = false;

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.inlineTranslationCache.clear();
    this.pendingTranslationFingerprints.clear();
    this.lastProcessedText = '';
    this.applyNativeSubtitleMask(false);
    this.clearOverlay();
    this.hideSelectorMenu();
    document.body?.classList.remove('owt-netflix-active');
    this.updateControlsButtonState();
    logger.info('NetflixCaptionAdapter stopped');
  }

  private getOverlayHost(): HTMLElement {
    const fullscreenElement = document.fullscreenElement as HTMLElement | null;
    if (fullscreenElement && fullscreenElement.tagName !== 'VIDEO') {
      return fullscreenElement;
    }
    return (
      (document.querySelector('[data-uia="watch-video"]') as HTMLElement) ||
      (document.querySelector('.watch-video') as HTMLElement) ||
      document.body ||
      document.documentElement
    );
  }

  private setupOverlayPositionListeners() {
    if (this.overlayPositionListenersAttached || typeof window === 'undefined') return;
    this.overlayPositionListenersAttached = true;

    const reposition = () => {
      if (this.isActive) {
        const host = this.getOverlayHost();
        this.overlayRenderer.mount(host);
      }
    };

    window.addEventListener('resize', reposition, { passive: true });
    window.addEventListener('scroll', reposition, { passive: true });
    document.addEventListener('fullscreenchange', reposition);
    window.addEventListener('fullscreenchange', reposition);
    window.addEventListener('webkitfullscreenchange', reposition);
  }

  private getNativeSubtitleElements(): HTMLElement[] {
    const selectors = [
      '.player-timedtext',
      '[data-uia="player-timedtext"]',
      '[data-uia="watch-video--timed-text"]',
      '.player-timedtext-text-container',
      '[class*="timedtext"]',
    ];

    return Array.from(document.querySelectorAll<HTMLElement>(selectors.join(', '))).filter((element) => {
      if (element.id === 'owt-netflix-overlay-host' || element.closest('#owt-netflix-overlay-host')) return false;
      if (element.id === 'owt-netflix-selector-menu' || element.closest('#owt-netflix-selector-menu')) return false;
      if (element.closest('.player-controls, .right-controls')) return false;
      return true;
    });
  }

  private clearOverlay() {
    this.overlayRenderer.clear();
    this.restoreNativeSubtitles();
  }

  private restoreNativeSubtitles() {
    this.applyNativeSubtitleMask(false);
  }

  private startObserver() {
    this.observer?.disconnect();

    const targetNode =
      document.querySelector('.watch-video') ||
      document.querySelector('[data-uia="watch-video"]') ||
      document.body ||
      document.documentElement;

    if (!targetNode) return;

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

  private getNativeSubtitleTextFromDOM(): string {
    const lines: string[] = [];

    for (const element of this.getNativeSubtitleElements()) {
      const rawText = (element.innerText || element.textContent || '').trim();
      if (!rawText) continue;

      for (const line of rawText.split(/\r?\n/)) {
        const text = line.replace(/[ \t]+/g, ' ').trim();
        if (text && !lines.includes(text)) {
          lines.push(text);
        }
      }
    }

    return lines.join('\n');
  }

  public processCaptions(): void {
    if (!this.isActive) return;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const currentNativeText = this.getNativeSubtitleTextFromDOM();
    if (!currentNativeText) {
      if (this.lastProcessedText !== '') {
        this.lastProcessedText = '';
        this.clearOverlay();
      }
      return;
    }

    this.onNewSubtitleText(currentNativeText);
  }

  private onNewSubtitleText(text: string) {
    const cleanText = text
      .replace(/<[^>]*>/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n')
      .trim();
    if (!cleanText) {
      this.clearOverlay();
      this.lastProcessedText = '';
      return;
    }
    if (this.lastProcessedText === cleanText) return;

    this.lastProcessedText = cleanText;
    this.clearOverlay();

    if (this.selectedTrackId !== 'ai-translate' && this.secondaryCues.length > 0) {
      this.renderSecondaryCueForTime(cleanText);
    } else {
      void this.fetchAndRenderOverlay(cleanText, this.routeGeneration);
    }
  }

  private renderSecondaryCueForTime(primaryText: string) {
    const video = document.querySelector('video') as HTMLVideoElement | null;
    const currentMs = video ? Math.round(video.currentTime * 1000) : 0;
    const activeCue = this.secondaryCues.find(
      (cue) => currentMs >= cue.startMs && currentMs <= cue.endMs,
    );
    if (!activeCue?.text) return;
    this.renderOverlay(primaryText, activeCue.text);
  }

  private async fetchAndRenderOverlay(text: string, generation: number) {
    const fingerprint = [
      this.currentVideoId,
      text,
      this.targetLang,
      this.displayMode,
      this.subtitleOriginalFontSize,
      this.subtitleTranslatedFontSize,
      this.subtitleOriginalColor,
      this.subtitleTranslatedColor,
    ].join('|');

    const cached = this.inlineTranslationCache.get(fingerprint);
    if (cached) {
      this.renderOverlay(text, cached);
      return;
    }
    if (this.pendingTranslationFingerprints.has(fingerprint)) return;
    this.pendingTranslationFingerprints.add(fingerprint);

    try {
      const response = await messageRouter.sendMessage({
        type: 'TRANSLATE_REQUEST',
        segments: [{ id: 'nf-overlay', text }],
        sourceLanguage: 'auto',
        targetLanguage: this.targetLang,
      });

      if (!this.isActive || this.routeGeneration !== generation || this.lastProcessedText !== text) return;

      const translatedText = response?.segments?.[0]?.translatedText;
      if (!translatedText) {
        this.renderOverlay(text, '⚠️ 翻譯失敗: 無法取得翻譯結果');
        return;
      }

      this.inlineTranslationCache.set(fingerprint, translatedText);
      this.renderOverlay(text, translatedText);
    } catch (error: any) {
      logger.error('Overlay translation failed', error);
      if (this.isActive && this.routeGeneration === generation) {
        this.renderOverlay(text, `⚠️ 翻譯失敗: ${error?.message || 'API 請求失敗'}`);
      }
    } finally {
      this.pendingTranslationFingerprints.delete(fingerprint);
    }
  }

  private renderOverlay(originalText: string, translatedText: string, isError = false) {
    const host = this.getOverlayHost();
    this.overlayRenderer.mount(host);
    this.overlayRenderer.updateSettings({
      subtitleOriginalFontSize: this.subtitleOriginalFontSize,
      subtitleTranslatedFontSize: this.subtitleTranslatedFontSize,
      subtitleOriginalColor: this.subtitleOriginalColor,
      subtitleTranslatedColor: this.subtitleTranslatedColor,
      displayMode: this.displayMode as any,
    });

    if (isError) {
      this.overlayRenderer.render(originalText, translatedText, { isError: true });
    } else {
      this.overlayRenderer.render(originalText, translatedText);
      this.applyNativeSubtitleMask(true);
    }
  }

  public injectControlsButton() {
    let button = document.querySelector('.owt-netflix-toggle-btn') as HTMLButtonElement | null;
    if (button && document.body.contains(button)) {
      this.controlsButton = button;
      // The controls bar appears lazily; promote a floating fallback button
      // into the bar as soon as it exists.
      if (button.classList.contains('owt-netflix-floating')) {
        this.placeButtonIntoControls(button);
      }
      this.updateControlsButtonState();
      return;
    }

    button = document.createElement('button');
    button.className = 'owt-netflix-toggle-btn';
    button.setAttribute('aria-label', 'OWT 雙語字幕');
    button.setAttribute('title', 'OWT 雙語字幕與語言學習 Overlay');
    this.applyControlsBarStyle(button);
    button.innerHTML = `
      <span class="owt-btn-text" style="font-weight:700;font-size:12px;">OWT</span>
    `;

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handleToggleClick();
    });

    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleSelectorMenu();
    });

    this.placeButtonIntoControls(button);
    this.controlsButton = button;
    this.updateControlsButtonState();
  }

  /**
   * Places the toggle button inside the player controls bar when it exists.
   * Before the bar mounts (Netflix lazy-renders it), docks the button as a
   * floating ball at the bottom-right of the viewport instead — prepending
   * to document.body strands it at the page's top-left corner.
   */
  private placeButtonIntoControls(button: HTMLButtonElement): void {
    const audioSubBtn = document.querySelector('[data-uia="control-audio-subtitle"]');
    const audioSubWrapper = audioSubBtn?.closest('div') || audioSubBtn;
    const controlsBar =
      document.querySelector('[data-uia="controls-standard"]') ||
      document.querySelector('.player-controls .right-controls') ||
      document.querySelector('.player-controls');

    if (audioSubWrapper && audioSubWrapper.parentNode) {
      button.classList.remove('owt-netflix-floating');
      this.applyControlsBarStyle(button);
      audioSubWrapper.parentNode.insertBefore(button, audioSubWrapper);
      return;
    }

    if (controlsBar) {
      button.classList.remove('owt-netflix-floating');
      this.applyControlsBarStyle(button);
      controlsBar.prepend(button);
      return;
    }

    button.classList.add('owt-netflix-floating');
    this.applyFloatingStyle(button);
    document.body.appendChild(button);
  }

  private applyControlsBarStyle(button: HTMLButtonElement): void {
    button.style.background = 'transparent';
    button.style.border = 'none';
    button.style.color = 'white';
    button.style.cursor = 'pointer';
    button.style.width = '44px';
    button.style.height = '44px';
    button.style.padding = '0';
    button.style.margin = '0 6px 0 0';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.opacity = '0.85';
    button.style.transition = 'all 0.2s ease';
    button.style.zIndex = '9999';
    button.style.position = 'relative';
    button.style.borderRadius = '0';
    button.style.boxShadow = 'none';
    button.style.backdropFilter = '';
  }

  private applyFloatingStyle(button: HTMLButtonElement): void {
    button.style.position = 'fixed';
    button.style.bottom = '96px';
    button.style.right = '24px';
    button.style.width = '48px';
    button.style.height = '48px';
    button.style.margin = '0';
    button.style.borderRadius = '50%';
    button.style.border = '1px solid rgba(255, 255, 255, 0.25)';
    button.style.background = 'rgba(15, 15, 20, 0.85)';
    button.style.backdropFilter = 'blur(8px)';
    button.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.5)';
    button.style.opacity = '0.9';
    button.style.zIndex = '2147483000';
  }

  private toggleSelectorMenu() {
    if (this.selectorMenu?.style.display === 'block') {
      this.hideSelectorMenu();
    } else {
      this.showSelectorMenu();
    }
  }

  private showSelectorMenu() {
    let menu = document.getElementById('owt-netflix-selector-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'owt-netflix-selector-menu';
      menu.style.position = 'absolute';
      menu.style.bottom = '70px';
      menu.style.right = '10px';
      menu.style.backgroundColor = 'rgba(20, 20, 20, 0.95)';
      menu.style.border = '1px solid rgba(255, 255, 255, 0.2)';
      menu.style.borderRadius = '8px';
      menu.style.padding = '12px 16px';
      menu.style.color = 'white';
      menu.style.fontSize = '14px';
      menu.style.zIndex = '2147483647';
      menu.style.minWidth = '220px';
      menu.style.boxShadow = '0 8px 24px rgba(0,0,0,0.8)';
      menu.style.backdropFilter = 'blur(8px)';
      (document.querySelector('.player-controls') || document.body).appendChild(menu);
    }

    this.selectorMenu = menu;
    this.updateSelectorMenuOptions();
    menu.style.display = 'block';
  }

  private hideSelectorMenu() {
    if (this.selectorMenu) this.selectorMenu.style.display = 'none';
  }

  private updateSelectorMenuOptions() {
    if (!this.selectorMenu) return;

    this.selectorMenu.innerHTML = '';
    const heading = document.createElement('div');
    heading.style.fontWeight = '700';
    heading.style.marginBottom = '8px';
    heading.style.color = '#c084fc';
    heading.textContent = `🌐 OWT 副字幕選單 (${this.discoveredTracks.length} 軌可用)`;
    this.selectorMenu.appendChild(heading);

    const list = document.createElement('div');
    list.id = 'owt-track-list';
    list.style.maxHeight = '250px';
    list.style.overflowY = 'auto';
    this.selectorMenu.appendChild(list);

    const appendItem = (label: string, selected: boolean, onClick: () => void) => {
      const item = document.createElement('div');
      item.style.padding = '8px 10px';
      item.style.margin = '4px 0';
      item.style.borderRadius = '4px';
      item.style.cursor = 'pointer';
      item.style.backgroundColor = selected ? 'rgba(168, 85, 247, 0.3)' : 'transparent';
      item.style.color = selected ? '#c084fc' : 'white';
      item.textContent = label;
      item.addEventListener('click', onClick);
      list.appendChild(item);
    };

    appendItem('✨ 自動 AI / 機器翻譯 (Google / DeepL / Gemini)', this.selectedTrackId === 'ai-translate', () => {
      this.selectedTrackId = 'ai-translate';
      this.secondaryCues = [];
      this.lastProcessedText = '';
      this.updateSelectorMenuOptions();
      this.processCaptions();
    });

    if (this.discoveredTracks.length === 0) return;
    const divider = document.createElement('div');
    divider.style.height = '1px';
    divider.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
    divider.style.margin = '6px 0';
    list.appendChild(divider);

    for (const track of this.discoveredTracks) {
      appendItem(
        `🎬 原生副字幕：${track.label} ${track.isCC ? '(CC)' : ''}`,
        this.selectedTrackId === track.id,
        () => {
          this.selectedTrackId = track.id;
          void this.loadSecondaryTrack(track);
        },
      );
    }
  }

  private async loadSecondaryTrack(track: DiscoveredTrack) {
    try {
      const xml = await this.fetchTtmlXml(track.url);
      this.secondaryCues = parseNetflixTtml(xml);
      logger.info('Parsed secondary Netflix TTML cues', this.secondaryCues.length);
    } catch (error) {
      this.secondaryCues = [];
      logger.error('Failed to fetch secondary track TTML', error);
    }
    this.lastProcessedText = '';
    this.updateSelectorMenuOptions();
    this.processCaptions();
  }

  private updateControlsButtonState() {
    if (!this.controlsButton) return;
    this.controlsButton.style.color = this.isActive ? '#c084fc' : 'white';
    this.controlsButton.style.opacity = this.isActive ? '1' : '0.8';
    this.controlsButton.style.textShadow = this.isActive
      ? '0 0 8px rgba(168, 85, 247, 0.6)'
      : 'none';
  }

}

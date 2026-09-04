import { messageRouter } from '@/infrastructure/messaging/message-router';
import { parseNetflixTtml, type SubtitleCue } from '@/shared/subtitles/ttml-parser';
import { createLogger } from '@/shared/logger';
import { SubtitleOverlayRenderer } from '@/shared/ui/subtitle-overlay-renderer';
import type { NetflixConfig, NetflixStateInfo } from '@/core/contracts/messages';
import { CaptionAdapterBase } from '@/adapters/caption-adapter-base';
import { DomCueTimelineBuilder } from '@/adapters/dom-cue-timeline';
import { tokenizeText } from '@/core/session/subtitle-session-store';
import { BRIDGE, onBridgeMessage, bridgeRequest } from './netflix-bridge';
import { NetflixLearningMode } from './netflix-learning-mode';
import { NetflixDualTrackController } from './netflix-dual-track';
import { NetflixTrackManager, trackMatchesTargetLanguage, type DiscoveredTrack } from './netflix-track-manager';
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

  private discoveredTracks: DiscoveredTrack[] = [];
  private selectedTrackId = 'ai-translate';
  /** 'auto' = prefer a native track matching targetLang, else AI; 'manual' = user's explicit pick. */
  private selectionMode: 'auto' | 'manual' = 'auto';
  private lastReconciledTargetLang: string | null = null;
  private autoSelectionRunning = false;
  private nativeRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private secondaryCues: SubtitleCue[] = [];

  private pendingTranslationFingerprints = new Set<string>();
  /** Rolling source=>translation window so AI lines stay coherent. */
  private recentAiContext: Array<{ source: string; translation: string }> = [];

  // ── Learning mode (Language Reactor core) ──────────────────────────
  private domCueTimeline = new DomCueTimelineBuilder();
  private lastRenderedSentence: { original: string; translated: string } | null = null;

  private lastProcessedText = '';
  private clearGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly clearGraceMs = 2000;
  private overlayPositionListenersAttached = false;

  private trackManager = new NetflixTrackManager();
  private syncEngine = new NetflixSyncEngine();
  private overlayRenderer = new SubtitleOverlayRenderer('owt-netflix-overlay-host');
  private learningMode = new NetflixLearningMode({
    isActive: () => this.isActive,
    sourceLang: () => this.sourceLang,
    targetLang: () => this.targetLang,
    currentVideoId: () => this.currentVideoId || '',
    primaryTrackLang: () => (this.dualTrack.isActive() ? this.dualTrack.getPrimaryLang() : 'auto'),
    getTimeline: () => this.getSentenceTimeline(),
    setLineVisibility: (visible) => this.overlayRenderer.setLineVisibility(visible),
    currentSentence: () => this.lastRenderedSentence,
  });
  private dualTrack = new NetflixDualTrackController(
    {
      fetchTtml: (url) => this.fetchTtmlXml(url),
      parseTtml: (xml) => parseNetflixTtml(xml),
      isActive: () => this.isActive,
      routeGeneration: () => this.routeGeneration,
      renderCueLine: (primaryText, secondaryText) => this.renderOverlay(primaryText, secondaryText),
      machineTranslateCue: (text, generation) => this.fetchAndRenderOverlay(text, generation),
      clearLine: () => this.clearOverlay(),
      setCueText: (text) => { this.lastProcessedText = text; },
      getCueText: () => this.lastProcessedText,
      setSecondaryCues: (cues) => { this.secondaryCues = cues; },
      onDualLoaded: () => {
        if (this.isActive) this.processCaptions();
      },
      fallbackToSingle: (secondary) => this.loadSecondaryTrack(secondary, { manual: false }),
    },
    this.syncEngine,
    () => this.learningMode.notifyTimelineChanged(),
  );

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
      selectionMode: this.selectionMode,
      tracks: this.discoveredTracks
        .filter((t) => Boolean(t.url))
        .slice(0, 30)
        .map((t) => ({ id: String(t.id), label: t.label || String(t.language), isCC: Boolean(t.isCC) })),
      secondaryCuesCount: this.secondaryCues.length,
      learningMode: this.learningMode.isEnabled(),
      dualTrack: this.dualTrack.isActive(),
    };
  }

  /**
   * Popup entry point for the subtitle-source choice: 'auto' prefers a
   * native track in the target language, 'ai' forces machine translation.
   */
  public setSubtitleSource(source: 'auto' | 'ai' | 'track', trackId?: string): void {
    if (source === 'track' && trackId) {
      const track = this.discoveredTracks.find((t) => String(t.id) === String(trackId));
      if (track?.url) {
        void this.loadSecondaryTrack(track);
        return;
      }
    }
    if (source === 'ai') {
      this.selectionMode = 'manual';
      this.selectedTrackId = 'ai-translate';
      this.secondaryCues = [];
      this.dualTrack.reset();
    } else {
      this.selectionMode = 'auto';
    }
    this.lastProcessedText = '';
    this.reconcileTrackSelection();
    if (this.isActive) this.processCaptions();
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

  /**
   * Apply NetflixConfig pushed from the popup options card.
   * Maps the card's slider values onto the overlay renderer settings and
   * re-renders the current caption so changes are visible immediately.
   */
  public updateConfig(config: Partial<NetflixConfig>): void {
    if (config.primarySize !== undefined) this.subtitleOriginalFontSize = config.primarySize;
    if (config.secondarySize !== undefined) this.subtitleTranslatedFontSize = config.secondarySize;
    if (config.learningMode !== undefined && config.learningMode !== this.learningMode.isEnabled()) {
      this.learningMode.setEnabled(config.learningMode);
    }
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
    this.setupMainWorldMessageListener();
    this.setupOverlayPositionListeners();
  }

  private setupMainWorldMessageListener() {
    // The bridge module owns both channels (postMessage + CustomEvent
    // fallback) and revision dedup; the adapter only filters by type.
    onBridgeMessage((msg) => {
      if (
        msg.type === BRIDGE.messageType.TRACKS_UPDATED ||
        msg.type === BRIDGE.messageType.TRACKS_DISCOVERED ||
        msg.type === BRIDGE.messageType.MANIFEST_TRACKS
      ) {
        const tracks = msg.tracks as unknown as DiscoveredTrack[];
        if (!Array.isArray(tracks)) return;
        this.discoveredTracks = tracks;
        this.trackManager.setDiscoveredTracks(this.discoveredTracks);
        this.reconcileTrackSelection();
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
    return bridgeRequest<{ xml: string }>(BRIDGE.messageType.FETCH_TTML, { url }, timeoutMs).then(
      (result) => {
        if (typeof result.xml === 'string' && result.xml.length > 0) return result.xml;
        throw new Error('empty TTML payload');
      },
    );
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


  private getNetflixVideoId(): string {
    const watchMatch = window.location.pathname.match(/\/watch\/(\d+)/);
    return watchMatch ? watchMatch[1] : window.location.href;
  }

  protected onVideoChanged(): void {
    this.lastProcessedText = '';
    this.domCueTimeline.reset();
    this.discoveredTracks = [];
    this.secondaryCues = [];
    this.dualTrack.reset();
    this.inlineTranslationCache.clear();
    this.pendingTranslationFingerprints.clear();
    this.recentAiContext = [];
    this.clearNativeTrackRetry();
    this.clearOverlay();
  }

  protected onSharedSettingsApplied(settings: import('@/core/contracts/messages').ExtensionSettings): void {
    // Netflix card settings now live inside the single settings store; apply
    // them through the same path the old UPDATE_NETFLIX_CONFIG message used.
    if (settings.netflix) {
      this.updateConfig(settings.netflix);
    }
    // A target-language change re-runs the auto selection with the new
    // language (native track preference).
    if (settings.targetLanguage && settings.targetLanguage !== this.lastReconciledTargetLang) {
      this.trackManager.setTargetLanguage(settings.targetLanguage);
      this.lastReconciledTargetLang = settings.targetLanguage;
      this.reconcileTrackSelection();
    }
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

    this.startObserver();
    this.learningMode.attach();
    this.reconcileTrackSelection();
    logger.info('NetflixCaptionAdapter started', { targetLang: this.targetLang, displayMode: this.displayMode, selectionMode: this.selectionMode });
  }

  stop() {
    this.isActive = false;
    this.learningMode.detach();
    this.dualTrack.reset();

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
    this.recentAiContext = [];
    this.clearNativeTrackRetry();
    this.lastProcessedText = '';
    if (this.clearGraceTimer !== null) {
      clearTimeout(this.clearGraceTimer);
      this.clearGraceTimer = null;
    }
    this.applyNativeSubtitleMask(false);
    this.clearOverlay();
    document.body?.classList.remove('owt-netflix-active');
    logger.info('NetflixCaptionAdapter stopped');
  }

  private currentVideoMs(): number {
    const video = document.querySelector('video') as HTMLVideoElement | null;
    return video ? Math.round(video.currentTime * 1000) : 0;
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
    // Clear our layer only. Restoring the native-subtitle mask here made
    // Netflix's own line flash visible between cues before the bilingual
    // overlay re-rendered; the mask is only lifted in stop().
    this.overlayRenderer.clear();
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
    // Dual native mode is driven by the sync engine + video.currentTime,
    // not by DOM scraping.
    if (this.dualTrack.isActive()) return;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const currentNativeText = this.getNativeSubtitleTextFromDOM();
    if (!currentNativeText) {
      // Netflix blanks its caption node between cues; clearing immediately
      // makes the bilingual overlay strobe on every cue boundary. Hold the
      // last line for a grace period and cancel if the next cue arrives.
      if (this.lastProcessedText !== '' && this.clearGraceTimer === null) {
        this.clearGraceTimer = setTimeout(() => {
          this.clearGraceTimer = null;
          this.lastProcessedText = '';
          this.domCueTimeline.closeAll(this.currentVideoMs());
          this.clearOverlay();
        }, this.clearGraceMs);
      }
      return;
    }

    if (this.clearGraceTimer !== null) {
      clearTimeout(this.clearGraceTimer);
      this.clearGraceTimer = null;
    }

    this.onNewSubtitleText(currentNativeText);
  }

  private onNewSubtitleText(text: string) {
    if (this.dualTrack.isActive()) return;
    this.domCueTimeline.open(text, this.currentVideoMs());
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
        sourceLanguage: this.sourceLang,
        targetLanguage: this.targetLang,
        context: { previous: [...this.recentAiContext] },
      });

      if (!this.isActive || this.routeGeneration !== generation || this.lastProcessedText !== text) return;

      const translatedText = response?.segments?.[0]?.translatedText;
      if (!translatedText) {
        this.renderOverlay(text, '⚠️ 翻譯失敗: 無法取得翻譯結果');
        return;
      }

      this.inlineTranslationCache.set(fingerprint, translatedText);
      this.recentAiContext.push({ source: text, translation: translatedText });
      if (this.recentAiContext.length > 8) this.recentAiContext.shift();
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
      this.lastRenderedSentence = { original: originalText, translated: translatedText };
      const tokens = this.learningMode.isEnabled()
        ? tokenizeText(`cue-${this.routeGeneration}-${originalText.length}`, originalText, this.targetLang)
        : undefined;
      this.overlayRenderer.render(originalText, translatedText, { tokens });
      this.applyNativeSubtitleMask(true);
    }
  }


  /**
   * Places the toggle button inside the player controls bar when it exists.
   * Before the bar mounts (Netflix lazy-renders it), docks the button as a
   * floating ball at the bottom-right of the viewport. Hysteresis: once the
   * button has docked into a bar, it never goes back to floating — when
   * Netflix tears the bar down the button waits disconnected until a new
   * bar appears, instead of teleporting between two spots every tick.
   */






  /**
   * Close-on-dismiss affordances: click outside the menu and the Escape
   * key both hide it. Listeners are removed when the menu hides.
   */



  /**
   * Keeps the active secondary source aligned with the selection policy:
   * auto mode prefers a native track in the target language and falls back
   * to AI translation only when none exists; manual mode honours the pick
   * but falls back to auto when the chosen track disappears on navigation.
   */
  private reconcileTrackSelection(): void {
    if (this.selectionMode === 'manual') {
      const stillThere = this.selectedTrackId === 'ai-translate' ||
        this.discoveredTracks.some((t) => t.id === this.selectedTrackId);
      if (stillThere) return;
      this.selectionMode = 'auto';
    }
    void this.runAutoSelection();
  }

  private async runAutoSelection(): Promise<void> {
    if (this.autoSelectionRunning) return;
    const native = this.trackManager.findBestMatchingTrack(this.targetLang);
    if (native?.url) {
      // Already showing this exact track: skip the re-download.
      if (this.selectedTrackId === native.id && this.secondaryCues.length > 0) return;
      this.autoSelectionRunning = true;
      try {
        // Learning mode core: when a second native track (the video's
        // original language) exists, download BOTH tracks and pair cues by
        // maximum time overlap — the LR dual-subtitle layout.
        const original = await this.dualTrack.selectPrimary(this.discoveredTracks, native, this.targetLang);
        if (original && this.learningMode.isEnabled()) {
          await this.dualTrack.load(original, native);
        } else {
          await this.loadSecondaryTrack(native, { manual: false });
        }
      } finally {
        this.autoSelectionRunning = false;
      }
      return;
    }
    // No native track in the target language — machine translation it is.
    this.selectedTrackId = 'ai-translate';
    this.secondaryCues = [];
    if (this.isActive) this.processCaptions();
    this.scheduleNativeTrackRetry();
  }

  /**
   * Track discovery is progressive: the first reconcile often runs before
   * the manifest (with download URLs) arrives, which would lock AI mode in
   * even though a native track exists. Re-check once before accepting it.
   */
  private scheduleNativeTrackRetry(): void {
    if (this.nativeRetryTimer) return;
    this.nativeRetryTimer = setTimeout(() => {
      this.nativeRetryTimer = null;
      if (this.isActive && this.selectionMode === 'auto') this.reconcileTrackSelection();
    }, 4000);
  }

  private clearNativeTrackRetry(): void {
    if (this.nativeRetryTimer) {
      clearTimeout(this.nativeRetryTimer);
      this.nativeRetryTimer = null;
    }
  }


  /**
   * Picks the learning-language (primary) track for dual mode. Prefers the
   * track the player is CURRENTLY displaying — asking the MAIN world beats
   * heuristics when several non-target tracks exist (e.g. EN + FR audio
   * subs) — and falls back to the first non-target track with a URL.
   */
  /** Sentence-control timeline: dual primary cues → secondary cues → DOM-observed fallback. */
  private getSentenceTimeline(): Array<{ startMs: number; endMs: number }> {
    if (this.dualTrack.isActive()) {
      return this.dualTrack.timeline();
    }
    if (this.secondaryCues.length > 0) {
      return this.secondaryCues.map((c) => ({ startMs: c.startMs, endMs: c.endMs }));
    }
    // Pure AI mode: synthetic boundaries observed from the DOM line.
    return this.domCueTimeline.timeline();
  }

  private async loadSecondaryTrack(track: DiscoveredTrack, opts: { manual?: boolean } = {}) {
    if (opts.manual !== false) this.selectionMode = 'manual';
    this.selectedTrackId = track.id;
    this.dualTrack.reset();
    try {
      const xml = await this.fetchTtmlXml(track.url);
      this.secondaryCues = parseNetflixTtml(xml);
      logger.info('Parsed secondary Netflix TTML cues', this.secondaryCues.length);
    } catch (error) {
      this.secondaryCues = [];
      logger.error('Failed to fetch secondary track TTML', error);
    }
    this.lastProcessedText = '';
    this.processCaptions();
  }


}

import { messageRouter } from '@/infrastructure/messaging/message-router';
import { parseNetflixTtml, type SubtitleCue } from '@/shared/subtitles/ttml-parser';
import { createLogger } from '@/shared/logger';
import { SubtitleOverlayRenderer } from '@/shared/ui/subtitle-overlay-renderer';
import type { NetflixConfig, NetflixStateInfo } from '@/core/contracts/messages';
import { CaptionAdapterBase } from '@/adapters/caption-adapter-base';
import { DomCueTimelineBuilder } from '@/adapters/dom-cue-timeline';
import { tokenizeText } from '@/core/session/subtitle-session-store';
import { BRIDGE, onBridgeMessage, bridgeRequest, postToMain } from './netflix-bridge';
import { NetflixLearningMode } from './netflix-learning-mode';
import { NetflixDualTrackController } from './netflix-dual-track';
import { NetflixTrackManager, trackMatchesTargetLanguage, type DiscoveredTrack } from './netflix-track-manager';
import { NetflixSyncEngine } from './netflix-sync-engine';
import { NetflixAiPrefetchController } from './netflix-ai-prefetch';
import type { TranslationContext } from '@/core/contracts/translation';
import { translate, type TranslationKey } from '@/shared/i18n';

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
  private uiLanguage: string = 'auto';
  private lastReconciledTargetLang: string | null = null;
  private autoSelectionRunning = false;
  private aiLoading: Promise<boolean> | null = null;
  private aiLoadingKey = '';
  private aiLoadEpoch = 0;
  private aiSelectedSourceId = '';
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
  private aiPrefetch = new NetflixAiPrefetchController(
    {
      fetchTtml: (url) => this.fetchTtmlXml(url),
      parseTtml: (xml) => parseNetflixTtml(xml),
      isActive: () => this.isActive,
      routeGeneration: () => this.routeGeneration,
      currentVideoMs: () => this.prefetchVideoMs(),
      targetLanguage: () => this.targetLang,
      translateBatch: (segments, sourceLanguage, targetLanguage, generation, context) =>
        this.translateCueBatch(segments, sourceLanguage, targetLanguage, generation, context),
      renderCueLine: (primaryText, secondaryText, state) =>
        this.renderOverlay(primaryText, secondaryText, state),
      clearLine: () => this.clearOverlay(),
      onTimelineChanged: () => this.learningMode.notifyTimelineChanged(),
      getStatusText: (key) => this.subtitleStatus(key),
    },
    this.syncEngine,
  );
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
      translationMode: this.dualTrack.isActive() || this.secondaryCues.length > 0 ? 'native' :
        this.aiPrefetch.isActive() ? 'prefetch' : this.aiLoading ? 'loading' : 'realtime',
      prefetchedCount: this.aiPrefetch.getTranslatedCount(),
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
      if (this.dualTrack.isActive()) this.dualTrack.reset();
      void this.startAiPrefetchOrFallback();
      return;
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
    if (config.enabled === true && !this.isActive) {
      void this.start();
      return;
    }
    if (this.isActive) {
      this.refreshVisibleSubtitleStyle();
    }
  }

  private refreshVisibleSubtitleStyle(): void {
    this.overlayRenderer.updateSettings({
      subtitleOriginalFontSize: this.subtitleOriginalFontSize,
      subtitleTranslatedFontSize: this.subtitleTranslatedFontSize,
      subtitleOriginalColor: this.subtitleOriginalColor,
      subtitleTranslatedColor: this.subtitleTranslatedColor,
      displayMode: this.displayMode as any,
    });
    this.overlayRenderer.refresh();
  }

  public applyNativeSubtitleMask(enable: boolean) {
    const styleId = 'owt-hide-native-netflix-subtitles';
    let styleEl = document.getElementById(styleId);
    if (enable) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `.player-timedtext, .player-timed-text-image-container, [data-uia="player-timedtext"], [data-uia="watch-video--timed-text"] { visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }`;
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
        const tracks = msg.tracks as Array<Partial<DiscoveredTrack> & { trackId?: string; bcp47?: string }>;
        if (!Array.isArray(tracks)) return;
        // MAIN-world payloads use trackId/bcp47, while controllers use
        // id/language. Normalize the wire shape before selecting a source.
        this.discoveredTracks = tracks.filter(track => track && typeof track === 'object').map(track => {
          const language = track.language || track.bcp47 || 'unknown';
          const url = track.candidates?.find(candidate => candidate.isText)?.url || track.url || '';
          return {
            ...track,
            id: String(track.id ?? track.trackId ?? language),
            label: track.label || language,
            language,
            url,
            isCC: Boolean(track.isCC),
            hasUrl: Boolean(url),
          };
        });
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
    this.aiSelectedSourceId = '';
    this.lastProcessedText = '';
    this.domCueTimeline.reset();
    this.discoveredTracks = [];
    this.secondaryCues = [];
    this.dualTrack.reset();
    this.cancelAiPrefetch();
    this.inlineTranslationCache.clear();
    this.pendingTranslationFingerprints.clear();
    this.recentAiContext = [];
    this.clearNativeTrackRetry();
    this.clearOverlay();
  }

  protected onSharedSettingsApplied(settings: import('@/core/contracts/messages').ExtensionSettings): void {
    this.uiLanguage = settings.uiLanguage ?? 'auto';
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
    // Full-track prefetch modes do not pass through processCaptions(), so
    // repaint the renderer directly instead of waiting for the next cue.
    if (this.isActive) this.refreshVisibleSubtitleStyle();
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
    transColor = '#d4d4d4',
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

    // Keep Netflix's native subtitles visible until OWT has an actual source
    // line ready to render. The mask is applied only after renderOverlay().
    const host = this.getOverlayHost();
    this.overlayRenderer.mount(host);

    this.startObserver();
    this.learningMode.attach();
    this.requestSubtitleTracks();
    this.reconcileTrackSelection();
    logger.info('NetflixCaptionAdapter started', { targetLang: this.targetLang, displayMode: this.displayMode, selectionMode: this.selectionMode });
  }

  stop() {
    this.isActive = false;
    this.learningMode.detach();
    this.dualTrack.reset();
    this.cancelAiPrefetch();

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

  private prefetchVideoMs(): number | null {
    const video = document.querySelector('video') as HTMLVideoElement | null;
    if (!video || !Number.isFinite(video.currentTime)) return null;
    return Math.max(0, Math.round(video.currentTime * 1000));
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

    const elements = this.getNativeSubtitleElements();
    // Read leaf caption containers only; parents repeat their children's text.
    for (const element of elements.filter(parent => !elements.some(child => child !== parent && parent.contains(child)))) {
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
    // Full-track modes are driven by the sync engine + video.currentTime,
    // not by DOM scraping.
    if (this.dualTrack.isActive() || this.aiPrefetch.isActive()) return;

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
    if (this.dualTrack.isActive() || this.aiPrefetch.isActive()) return;
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

    if (this.selectedTrackId !== 'ai-translate' && this.secondaryCues.length > 0) {
      this.renderSecondaryCueForTime(cleanText);
    } else {
      void this.fetchAndRenderOverlay(cleanText, this.routeGeneration);
    }
  }

  private subtitleStatus(key: TranslationKey): string {
    return translate(this.uiLanguage, key);
  }

  private renderSecondaryCueForTime(primaryText: string) {
    const video = document.querySelector('video') as HTMLVideoElement | null;
    const currentMs = video ? Math.round(video.currentTime * 1000) : 0;
    // Allow a 400ms tolerance window to match cues across natural timing discrepancies
    const activeCue = this.secondaryCues.find(
      (cue) => currentMs >= cue.startMs - 300 && currentMs <= cue.endMs + 400,
    );
    this.renderOverlay(
      primaryText,
      activeCue?.text || this.subtitleStatus('subtitle.waitingTranslation'),
      activeCue ? 'ready' : 'pending',
    );
  }

  private async fetchAndRenderOverlay(text: string, generation: number) {
    if (this.aiLoading) {
      this.renderOverlay(text, this.subtitleStatus('subtitle.readingContext'), 'pending');
      const loaded = await this.aiLoading;
      if (loaded || !this.isActive || generation !== this.routeGeneration || this.lastProcessedText !== text) return;
    }
    const fingerprint = [this.currentVideoId, text, this.sourceLang, this.targetLang].join('|');

    const cached = this.inlineTranslationCache.get(fingerprint);
    if (cached) {
      this.renderOverlay(text, cached);
      return;
    }
    if (this.pendingTranslationFingerprints.has(fingerprint)) return;
    this.pendingTranslationFingerprints.add(fingerprint);

    // Render the source line immediately. AI/network latency should affect
    // only the translated line, never the availability of subtitles.
    this.renderOverlay(text, this.subtitleStatus('subtitle.translatingLine'), 'pending');

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
        this.renderOverlay(text, this.subtitleStatus('subtitle.translationMissing'), 'error');
        return;
      }

      this.inlineTranslationCache.set(fingerprint, translatedText);
      this.recentAiContext.push({ source: text, translation: translatedText });
      if (this.recentAiContext.length > 8) this.recentAiContext.shift();
      this.renderOverlay(text, translatedText, 'ready');
    } catch (error: any) {
      logger.error('Overlay translation failed', error);
      if (this.isActive && this.routeGeneration === generation && this.lastProcessedText === text) {
        const timedOut = /timed?\s*out|timeout|逾時/i.test(String(error?.message || ''));
        this.renderOverlay(
          text,
          timedOut ? this.subtitleStatus('subtitle.translationTimeout') : this.subtitleStatus('subtitle.translationUnavailable'),
          'error',
        );
      }
    } finally {
      this.pendingTranslationFingerprints.delete(fingerprint);
    }
  }

  private renderOverlay(
    originalText: string,
    translatedText: string,
    state: 'ready' | 'pending' | 'error' = 'ready',
  ) {
    const effectiveState = state === 'ready' && !translatedText.trim() ? 'pending' : state;
    const effectiveTranslatedText =
      effectiveState === 'pending' && !translatedText.trim() ? this.subtitleStatus('subtitle.waitingTranslation') : translatedText;
    const host = this.getOverlayHost();
    this.overlayRenderer.mount(host);
    this.overlayRenderer.updateSettings({
      subtitleOriginalFontSize: this.subtitleOriginalFontSize,
      subtitleTranslatedFontSize: this.subtitleTranslatedFontSize,
      subtitleOriginalColor: this.subtitleOriginalColor,
      subtitleTranslatedColor: this.subtitleTranslatedColor,
      displayMode: this.displayMode as any,
    });

    this.lastRenderedSentence = {
      original: originalText,
      translated: effectiveState === 'ready' ? effectiveTranslatedText : '',
    };
    const tokens = this.learningMode.isEnabled()
      ? tokenizeText(`cue-${this.routeGeneration}-${originalText.length}`, originalText, this.sourceLang)
      : undefined;
    this.overlayRenderer.render(originalText, effectiveTranslatedText, {
      tokens,
      isPending: effectiveState === 'pending',
      isError: effectiveState === 'error',
    });
    this.applyNativeSubtitleMask(true);
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
      if (this.selectedTrackId === 'ai-translate') {
        void this.startAiPrefetchOrFallback();
        return;
      }
      const stillThere = this.selectedTrackId === 'ai-translate' ||
        this.discoveredTracks.some((t) => t.id === this.selectedTrackId);
      if (stillThere) return;
      this.selectionMode = 'auto';
    }
    void this.runAutoSelection();
  }

  private async runAutoSelection(): Promise<void> {
    if (!this.isActive || this.autoSelectionRunning) return;
    const native = this.trackManager.findBestMatchingTrack(this.targetLang);
    if (native?.url) {
      // Already showing this exact track: skip the re-download.
      if (this.selectedTrackId === native.id && this.secondaryCues.length > 0) return;
      this.autoSelectionRunning = true;
      try {
        this.cancelAiPrefetch();
        // Learning mode core: when a second native track (the video's
        // original language) exists, download BOTH tracks and pair cues by
        // maximum time overlap — the LR dual-subtitle layout.
        const original = await this.dualTrack.selectPrimary(this.discoveredTracks, native, this.targetLang);
        if (original) {
          await this.dualTrack.load(original, native);
          if (this.dualTrack.isActive()) this.selectedTrackId = native.id;
        } else {
          await this.loadSecondaryTrack(native, { manual: false });
        }
      } finally {
        this.autoSelectionRunning = false;
      }
      return;
    }
    // No native track in the target language. Prefer full-source-track
    // rolling AI prefetch; DOM cue-by-cue translation remains the last fallback.
    this.selectedTrackId = 'ai-translate';
    this.secondaryCues = [];
    if (this.dualTrack.isActive()) this.dualTrack.reset();
    const prefetched = await this.startAiPrefetchOrFallback();
    if (!prefetched && this.isActive) this.processCaptions();
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
      if (!this.isActive) return;
      if (!this.aiPrefetch.isActive() && !this.dualTrack.isActive() && this.secondaryCues.length === 0) {
        this.requestSubtitleTracks();
      }
      if (this.selectionMode === 'auto' || this.selectedTrackId === 'ai-translate') this.reconcileTrackSelection();
    }, 4000);
  }

  private requestSubtitleTracks(): void {
    try {
      postToMain(BRIDGE.messageType.REQUEST_TRACKS);
    } catch (error) {
      logger.warn('Unable to request subtitle track snapshot', error);
    }
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
  /** Sentence-control timeline: native dual → AI source track → secondary → DOM fallback. */
  private getSentenceTimeline(): Array<{ startMs: number; endMs: number }> {
    if (this.dualTrack.isActive()) {
      return this.dualTrack.timeline();
    }
    if (this.aiPrefetch.isActive()) {
      return this.aiPrefetch.timeline();
    }
    if (this.secondaryCues.length > 0) {
      return this.secondaryCues.map((c) => ({ startMs: c.startMs, endMs: c.endMs }));
    }
    // Pure AI mode: synthetic boundaries observed from the DOM line.
    return this.domCueTimeline.timeline();
  }

  private findAiSourceTrack(): DiscoveredTrack | undefined {
    const downloadable = this.discoveredTracks.filter((track) => Boolean(track.url));
    if (downloadable.length === 0) return undefined;

    const normalizedSource = (this.sourceLang || '').toLowerCase().replace(/_/g, '-');
    if (normalizedSource && normalizedSource !== 'auto') {
      const prefix = normalizedSource.split('-')[0];
      const explicit = downloadable.find((track) => {
        const lang = (track.language || '').toLowerCase().replace(/_/g, '-');
        return lang === normalizedSource || lang.startsWith(prefix);
      });
      if (explicit && !trackMatchesTargetLanguage(explicit, this.targetLang)) return explicit;
    }

    // In auto mode, prefer any downloadable track that is not already the
    // requested target language. Netflix typically exposes the currently
    // selected/source subtitle near the front of the manifest track list.
    return downloadable.find(track => track.id === this.aiSelectedSourceId) ||
      downloadable.find((track) => !trackMatchesTargetLanguage(track, this.targetLang));
  }

  private async startAiPrefetchOrFallback(): Promise<boolean> {
    if (!this.isActive) return false;
    const source = this.findAiSourceTrack();
    if (!source?.url) {
      this.cancelAiPrefetch();
      this.scheduleNativeTrackRetry();
      return false;
    }

    if (this.aiPrefetch.matches(source, this.targetLang)) return true;
    const key = `${this.aiLoadEpoch}|${this.routeGeneration}|${source.id}|${this.targetLang}`;
    if (this.aiLoading && key === this.aiLoadingKey) return this.aiLoading;
    this.aiLoadingKey = key;
    const generation = this.routeGeneration;
    const work = (async () => {
      let chosen = source;
      if (this.sourceLang === 'auto' && !this.aiSelectedSourceId) {
        try {
          const active = await bridgeRequest<{ trackId: string }>(BRIDGE.messageType.GET_ACTIVE_TRACK, {}, 2000);
          chosen = this.discoveredTracks.find(track => track.url &&
            (String(track.id) === String(active?.trackId) || String(track.rawTrack?.trackId) === String(active?.trackId) || track.language === active?.trackId)) || source;
        } catch { /* Some player versions do not expose the selected track. */ }
      }
      if (!this.isActive || generation !== this.routeGeneration || key !== this.aiLoadingKey) return false;
      this.aiSelectedSourceId = chosen.id;
      return this.aiPrefetch.load(chosen);
    })();
    this.aiLoading = work;
    try {
      const loaded = await work;
      if (!loaded && this.isActive && generation === this.routeGeneration) this.scheduleNativeTrackRetry();
      return loaded;
    }
    finally { if (this.aiLoading === work) this.aiLoading = null; }
  }

  private cancelAiPrefetch(): void {
    // A bridge lookup may still be waiting when the engine is switched off or
    // a native source is selected. Invalidate it before a new session starts.
    this.aiLoadEpoch += 1;
    this.aiLoadingKey = '';
    this.aiLoading = null;
    this.aiPrefetch.reset();
  }

  private async translateCueBatch(
    segments: Array<{ id: string; text: string }>,
    sourceLanguage: string,
    targetLanguage: string,
    generation: number,
    context?: TranslationContext,
  ): Promise<Array<{ id: string; translatedText: string }>> {
    if (!this.isActive || generation !== this.routeGeneration || segments.length === 0) return [];

    const response = await messageRouter.sendMessage({
      type: 'TRANSLATE_REQUEST',
      segments,
      sourceLanguage: sourceLanguage || this.sourceLang,
      targetLanguage,
      context,
    });

    if (!this.isActive || generation !== this.routeGeneration) return [];
    return response?.segments ?? [];
  }

  private async loadSecondaryTrack(track: DiscoveredTrack, opts: { manual?: boolean } = {}) {
    if (opts.manual !== false) this.selectionMode = 'manual';
    this.selectedTrackId = track.id;
    this.dualTrack.reset();
    this.cancelAiPrefetch();
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

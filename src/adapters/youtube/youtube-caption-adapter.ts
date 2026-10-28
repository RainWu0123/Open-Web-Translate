import { messageRouter } from '@/infrastructure/messaging/message-router';
import { createLogger } from '@/shared/logger';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import { CaptionAdapterBase } from '@/adapters/caption-adapter-base';
import { DictionaryPopover } from '@/shared/ui/dictionary-popover';
import { SubtitleOverlayRenderer } from '@/shared/ui/subtitle-overlay-renderer';
import { tokenizeText } from '@/core/session/subtitle-session-store';
import { NetflixSyncEngine } from '@/adapters/netflix/netflix-sync-engine';
import { mergeSubtitleTimelines } from '@/shared/subtitles/dual-track-timeline';
import { NetflixAiPrefetchController, type AiPrefetchRenderState } from '@/adapters/netflix/netflix-ai-prefetch';
import { trackMatchesTargetLanguage, type DiscoveredTrack } from '@/adapters/netflix/netflix-track-manager';
import type { TranslationContext } from '@/core/contracts/translation';
import { translate, type TranslationKey } from '@/shared/i18n';
import { normalizeSubtitleCueText } from '@/shared/utils/subtitle-text';
import { SubtitlePreferenceStorage, type SubtitleTranslationPreference } from '@/infrastructure/storage/extension-storage/subtitle-preference-storage';

import { YT_BRIDGE, postToMain, subscribeToYouTubeBridge, type YouTubeTrack } from './youtube-bridge';
import { parseYouTubeTimedText } from './youtube-timedtext-parser';

const logger = createLogger('YouTubeCaptionAdapter');

interface RequestState {
  fingerprint: string;
  abortController: AbortController;
}

export class YouTubeCaptionAdapter extends CaptionAdapterBase {
  private popover: DictionaryPopover | null = null;
  private observer: MutationObserver | null = null;
  private observerTarget: Element | null = null;

  private pendingRequests = new Map<string, RequestState>();
  /** Rolling source=>translation window so AI lines stay coherent. */
  private recentAiContext: Array<{ source: string; translation: string }> = [];

  private discoveredTracks: YouTubeTrack[] = [];
  private selectedTrackId: string | null = null;
  private originalSourceId: string | null = null;
  private translationSourceId: string | null = null;
  private subtitlePreference: SubtitleTranslationPreference = { mode: 'native' };
  private subtitlePreferenceReady = true;
  private nativeFallback = false;
  private attemptedNativeKey = '';
  private nativePairActive = false;
  private selectionEpoch = 0;
  private domRenderEpoch = 0;
  private pendingSelectionEpoch: number | null = null;
  private nativePairOriginalLanguage = '';
  private strictPrefetchSource: { id: string; url: string; epoch: number } | null = null;
  private lastSettingsTarget: string | null = null;
  private unsubscribeBridge: (() => void) | null = null;
  private pendingTrackChanges = new Map<string, {
    resolve: (ok: boolean) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private pendingTimedTextRequests = new Map<string, {
    resolve: (payload: string) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  private uiLanguage = 'auto';
  private lastProcessedText = '';
  private clearGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly clearGraceMs = 1500;
  private lastRenderedSentence: { original: string; translated: string } | null = null;
  private tokenListenerAttached = false;
  private aiLoading: Promise<boolean> | null = null;
  private aiLoadingKey = '';
  private aiLoadEpoch = 0;

  private syncEngine = new NetflixSyncEngine();
  private overlayRenderer = new SubtitleOverlayRenderer('owt-youtube-overlay-host');
  private aiPrefetch = new NetflixAiPrefetchController(
    {
      fetchTtml: (url) => this.fetchTimedText(url),
      parseTtml: (payload) => parseYouTubeTimedText(payload),
      isActive: () => this.isActive,
      routeGeneration: () => this.routeGeneration,
      currentVideoMs: () => this.currentVideoMs(),
      targetLanguage: () => this.targetLang,
      translateBatch: (segments, sourceLanguage, targetLanguage, generation, context) =>
        this.translateCueBatch(segments, sourceLanguage, targetLanguage, generation, context),
      renderCueLine: (primaryText, secondaryText, state) =>
        this.renderOverlay(primaryText, secondaryText, state),
      clearLine: () => this.clearOverlay(),
      onTimelineChanged: () => {},
      getStatusText: (key) => this.subtitleStatus(key),
    },
    this.syncEngine,
  );

  constructor() {
    super();
  }

  private subtitleStatus(key: TranslationKey): string {
    return translate(this.uiLanguage, key);
  }

  private currentVideoMs(): number | null {
    const video = document.querySelector('video') as HTMLVideoElement | null;
    if (!video || !Number.isFinite(video.currentTime)) return 0;
    return Math.max(0, Math.round(video.currentTime * 1000));
  }

  public init() {
    if (typeof window !== 'undefined' && window.location?.hostname?.includes('youtube.com')) {
      logger.info('Initializing YouTubeCaptionAdapter on youtube.com');
      this.subtitlePreferenceReady = false;
      SubtitlePreferenceStorage.observe(preference => this.applySubtitlePreference(preference));
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
        if (data.selectedTrackId !== undefined) {
          this.selectedTrackId = data.selectedTrackId;
        }
        if (Array.isArray(data.tracks)) {
          this.discoveredTracks = data.tracks;
          logger.info('Discovered YouTube tracks:', this.discoveredTracks);
          if (this.isActive) {
            if (!this.originalSourceId && !this.nativePairActive) this.ensureCorrectTrackSelected();
            this.reconcileSubtitlePreference();
          }
        }
      } else if (data.type === YT_BRIDGE.messageType.TRACK_SET_RESULT && typeof data.requestId === 'string') {
        const pending = this.pendingTrackChanges.get(data.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pendingTrackChanges.delete(data.requestId);
        if (data.ok && typeof data.selectedTrackId === 'string') {
          this.selectedTrackId = data.selectedTrackId;
        }
        pending.resolve(Boolean(data.ok));
      } else if (data.type === YT_BRIDGE.messageType.TIMEDTEXT_RESULT && typeof data.requestId === 'string') {
        const pending = this.pendingTimedTextRequests.get(data.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pendingTimedTextRequests.delete(data.requestId);
        if (data.ok && typeof data.payload === 'string' && data.payload.trim().length > 0) {
          pending.resolve(data.payload);
        } else {
          pending.reject(new Error('Empty or failed YouTube timedtext response'));
        }
      }
    });
  }

  private applySubtitlePreference(preference: SubtitleTranslationPreference): void {
    const changed = !this.subtitlePreferenceReady || this.subtitlePreference.mode !== preference.mode || this.subtitlePreference.language !== preference.language;
    this.subtitlePreferenceReady = true;
    this.subtitlePreference = preference;
    if (!changed) return;
    this.selectionEpoch += 1;
    this.pendingSelectionEpoch = null;
    this.aiLoadEpoch += 1;
    this.aiLoadingKey = '';
    this.aiLoading = null;
    this.attemptedNativeKey = '';
    this.reconcileSubtitlePreference();
  }

  private preferredNativeTrack(language = this.subtitlePreference.language || this.targetLang): YouTubeTrack | undefined {
    return this.discoveredTracks.filter(track => Boolean(track.baseUrl) &&
      trackMatchesTargetLanguage({ language: track.languageCode, label: track.label }, language))
      .sort((a, b) => Number(a.kind === 'asr') - Number(b.kind === 'asr'))[0];
  }

  private reconcileSubtitlePreference(): void {
    if (!this.isActive || !this.subtitlePreferenceReady || this.pendingSelectionEpoch !== null) return;
    const original = this.discoveredTracks.find(track => track.id === this.originalSourceId);
    const originalPrefetchReady = original ? this.aiPrefetch.matches(this.toDiscoveredTrack(original), this.targetLang) : false;
    if (this.subtitlePreference.mode === 'ai') {
      this.nativeFallback = false;
      if (this.nativePairActive) void this.setSubtitleSources('translation', 'ai');
      else if (this.originalSourceId && !originalPrefetchReady) void this.setSubtitleSources('translation', 'ai');
      else if (!this.originalSourceId) void this.startAiPrefetchIfAvailable();
      return;
    }
    const current = this.discoveredTracks.find(track => track.id === this.translationSourceId);
    if (this.nativePairActive && current && trackMatchesTargetLanguage(
      { language: current.languageCode, label: current.label }, this.subtitlePreference.language || this.targetLang,
    )) { this.nativeFallback = false; return; }
    const track = this.preferredNativeTrack();
    if (!track) {
      this.nativeFallback = true;
      if (this.nativePairActive) void this.setSubtitleSources('translation', 'ai');
      else if (this.originalSourceId && !originalPrefetchReady) void this.setSubtitleSources('translation', 'ai');
      else if (!this.originalSourceId) void this.startAiPrefetchIfAvailable();
      return;
    }
    if (this.nativePairActive && this.translationSourceId === track.id) { this.nativeFallback = false; return; }
    const key = `${this.routeGeneration}|${track.id}|${track.baseUrl}|${this.subtitlePreference.language || this.targetLang}`;
    if (key === this.attemptedNativeKey) return;
    this.attemptedNativeKey = key;
    const nativeSelection = this.setSubtitleSources('translation', track.id);
    const nativeEpoch = this.selectionEpoch;
    void nativeSelection.then(async loaded => {
      if (nativeEpoch !== this.selectionEpoch || key !== this.attemptedNativeKey || !this.isActive || this.subtitlePreference.mode !== 'native') return;
      this.nativeFallback = !loaded;
      if (!loaded && (this.nativePairActive || this.originalSourceId)) {
        const aiSelection = this.setSubtitleSources('translation', 'ai');
        const aiEpoch = this.selectionEpoch;
        const aiLoaded = await aiSelection;
        if (!aiLoaded && aiEpoch === this.selectionEpoch && key === this.attemptedNativeKey && this.isActive && this.subtitlePreference.mode === 'native') {
          // Do not keep showing an old native translation in the wrong language.
          this.nativePairActive = false;
          this.nativePairOriginalLanguage = '';
          this.translationSourceId = null;
          this.clearOverlay();
          this.applyNativeSubtitleMask(false);
          this.lastProcessedText = '';
          this.processCaptions();
        }
      } else if (!loaded) await this.startAiPrefetchIfAvailable();
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
        void this.setTrack(this.sourceLang);
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
        void this.setTrack('auto');
      }
    }
  }

  private selectSourceTrackForPrefetch(): YouTubeTrack | undefined {
    const tracksWithUrl = this.discoveredTracks.filter((t) => Boolean(t.baseUrl));
    if (tracksWithUrl.length === 0) return undefined;

    if (this.sourceLang && this.sourceLang !== 'auto') {
      const explicit = tracksWithUrl.find(
        (t) => t.languageCode === this.sourceLang || t.languageCode?.startsWith(this.sourceLang),
      );
      if (explicit) return explicit;
    }

    if (this.selectedTrackId) {
      const active = tracksWithUrl.find(
        (t) => t.languageCode === this.selectedTrackId || t.id === this.selectedTrackId,
      );
      if (active) return active;
    }

    const targetPrefix = this.targetLang?.split('-')[0]?.toLowerCase();
    if (targetPrefix) {
      const nonTargetAuthor = tracksWithUrl.find(
        (t) => t.kind !== 'asr' && !t.languageCode?.toLowerCase().startsWith(targetPrefix),
      );
      if (nonTargetAuthor) return nonTargetAuthor;

      const nonTargetAny = tracksWithUrl.find(
        (t) => !t.languageCode?.toLowerCase().startsWith(targetPrefix),
      );
      if (nonTargetAny) return nonTargetAny;
    }

    return tracksWithUrl.find((t) => t.isDefault) || tracksWithUrl[0];
  }

  private toDiscoveredTrack(ytTrack: YouTubeTrack): DiscoveredTrack {
    return {
      id: ytTrack.id || ytTrack.languageCode,
      language: ytTrack.languageCode || 'auto',
      label: ytTrack.label || ytTrack.languageCode || 'auto',
      url: ytTrack.baseUrl || '',
      isCC: ytTrack.kind === 'asr',
      hasUrl: Boolean(ytTrack.baseUrl),
    };
  }

  public async startAiPrefetchIfAvailable(): Promise<boolean> {
    if (!this.isActive || this.nativePairActive || this.originalSourceId || this.pendingSelectionEpoch !== null) return false;
    const ytTrack = this.selectSourceTrackForPrefetch();
    if (!ytTrack?.baseUrl) return false;

    const discovered = this.toDiscoveredTrack(ytTrack);
    if (this.aiPrefetch.matches(discovered, this.targetLang)) return true;

    const key = `${this.aiLoadEpoch}|${this.routeGeneration}|${discovered.id}|${this.targetLang}`;
    if (this.aiLoading && key === this.aiLoadingKey) return this.aiLoading;
    this.aiLoadingKey = key;

    const work = (async () => {
      const loaded = await this.aiPrefetch.load(discovered, () => key === this.aiLoadingKey && !this.nativePairActive, () => this.invalidateDomRendering());
      if (loaded && this.isActive) {
        this.abortPendingRequests();
      }
      return loaded;
    })();
    this.aiLoading = work;
    try {
      return await work;
    } finally {
      if (this.aiLoading === work) this.aiLoading = null;
    }
  }

  private cancelAiPrefetch(): void {
    this.aiLoadEpoch += 1;
    this.aiLoadingKey = '';
    this.aiLoading = null;
    this.aiPrefetch.reset();
  }

  private invalidateDomRendering(): void {
    this.domRenderEpoch += 1;
    this.abortPendingRequests();
    if (this.clearGraceTimer !== null) clearTimeout(this.clearGraceTimer);
    this.clearGraceTimer = null;
    this.lastProcessedText = '';
  }

  private async fetchTimedText(url: string): Promise<string> {
    const videoId = new URLSearchParams(window.location.search).get('v');
    const urlVideoId = new URL(url, window.location.origin || 'https://www.youtube.com').searchParams.get('v');
    const inScope = () => Boolean(videoId) && new URLSearchParams(window.location.search).get('v') === videoId &&
      (!urlVideoId || urlVideoId === videoId);
    if (!inScope()) throw new Error('YouTube subtitle belongs to another video');
    if (this.strictPrefetchSource?.url === url) {
      const payload = await this.fetchTimedTextViaMainWorld(url, 6000, this.strictPrefetchSource.id);
      if (!inScope()) throw new Error('YouTube video changed during subtitle request');
      return payload;
    }
    if (typeof window !== 'undefined') {
      try {
        const payload = await this.fetchTimedTextViaMainWorld(url);
        if (!inScope()) throw new Error('YouTube video changed during subtitle request');
        return payload;
      } catch (bridgeErr) {
        if (!inScope()) throw bridgeErr;
        logger.debug('MAIN-world timedtext fetch failed, falling back to direct fetch', bridgeErr);
      }
    }
    const response = await fetch(url);
    if (!inScope()) throw new Error('YouTube video changed during subtitle request');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.text();
    if (!inScope()) throw new Error('YouTube video changed during subtitle request');
    return payload;
  }

  private fetchTimedTextViaMainWorld(baseUrl: string, timeoutMs = 6000, strictTrackId?: string): Promise<string> {
    const requestId = `yt-tt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const matchedTrack = this.discoveredTracks.find((t) => t.baseUrl === baseUrl);
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTimedTextRequests.delete(requestId);
        reject(new Error('Timed out fetching YouTube timedtext via MAIN world'));
      }, timeoutMs);
      this.pendingTimedTextRequests.set(requestId, { resolve, reject, timer });
      postToMain(YT_BRIDGE.messageType.FETCH_TIMEDTEXT, {
        requestId,
        baseUrl,
        strictTrackId,
        languageCode: matchedTrack?.languageCode || this.selectedTrackId || this.sourceLang,
      });
    });
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
      usage: 'video',
      segments,
      sourceLanguage: sourceLanguage || this.sourceLang,
      targetLanguage,
      context,
    });

    if (!this.isActive || generation !== this.routeGeneration) return [];
    return response?.segments ?? [];
  }

  private getOverlayHost(): HTMLElement {
    const fullscreenElement = document.fullscreenElement as HTMLElement | null;
    if (fullscreenElement && fullscreenElement.tagName !== 'VIDEO') {
      return fullscreenElement;
    }
    return (
      (document.querySelector('#movie_player') as HTMLElement) ||
      (document.querySelector('.html5-video-player') as HTMLElement) ||
      document.body ||
      document.documentElement
    );
  }

  private applyNativeSubtitleMask(enable: boolean): void {
    const styleId = 'owt-hide-native-youtube-subtitles';
    let styleEl = document.getElementById(styleId);
    if (enable) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `.ytp-caption-window-container, #ytp-caption-window-container { opacity: 0 !important; pointer-events: none !important; background: transparent !important; }`;
        (document.head || document.documentElement).appendChild(styleEl);
      }
    } else if (styleEl) {
      styleEl.remove();
    }
  }

  private renderOverlay(
    originalText: string,
    translatedText: string,
    state: AiPrefetchRenderState = 'ready',
    allowEmptyTranslation = false,
  ): void {
    const cleanOriginal = normalizeSubtitleCueText(originalText);
    const cleanTranslated = normalizeSubtitleCueText(translatedText);
    const effectiveState = state === 'ready' && !cleanTranslated && !allowEmptyTranslation ? 'pending' : state;
    const effectiveTranslatedText =
      effectiveState === 'pending' && !cleanTranslated
        ? this.subtitleStatus('subtitle.waitingTranslation')
        : cleanTranslated;

    const host = this.getOverlayHost();
    const overlayEl = this.overlayRenderer.mount(host);
    if (!this.tokenListenerAttached) {
      this.tokenListenerAttached = true;
      overlayEl.addEventListener('owt-token-clicked', ((event: CustomEvent) => {
        const detail = event.detail;
        if (!detail?.surface || !this.lastRenderedSentence) return;
        this.showPopover(
          detail.surface,
          this.lastRenderedSentence.original,
          this.lastRenderedSentence.translated,
          detail.clientX ?? window.innerWidth / 2,
          detail.clientY ?? window.innerHeight - 120,
        );
      }) as EventListener);
    }

    this.overlayRenderer.updateSettings({
      subtitleOriginalFontSize: this.subtitleOriginalFontSize,
      subtitleTranslatedFontSize: this.subtitleTranslatedFontSize,
      subtitleOriginalColor: this.subtitleOriginalColor,
      subtitleTranslatedColor: this.subtitleTranslatedColor,
      uiLanguage: this.uiLanguage as any,
      displayMode: this.displayMode as any,
    });

    this.lastRenderedSentence = {
      original: cleanOriginal,
      translated: effectiveState === 'ready' ? effectiveTranslatedText : '',
    };
    const tokens = tokenizeText(
      `yt-cue-${this.routeGeneration}-${cleanOriginal.length}`,
      cleanOriginal,
      this.nativePairOriginalLanguage || this.aiPrefetch.getSourceLanguage() || this.sourceLang,
    );
    this.overlayRenderer.render(cleanOriginal, effectiveTranslatedText, {
      tokens,
      isPending: effectiveState === 'pending',
      isError: effectiveState === 'error',
    });
    this.applyNativeSubtitleMask(true);
  }

  private clearOverlay(): void {
    this.overlayRenderer.clear();
  }

  public requestTracks(): void {
    if (typeof window !== 'undefined') {
      postToMain(YT_BRIDGE.messageType.REQUEST_TRACKS);
    }
  }

  public async setTrack(languageCode: string): Promise<boolean> {
    if (typeof window === 'undefined' || this.originalSourceId || this.pendingSelectionEpoch !== null || this.nativePairActive) return false;
    const requestId = `yt-track-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const changed = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingTrackChanges.delete(requestId);
        resolve(false);
      }, 2500);
      this.pendingTrackChanges.set(requestId, { resolve, timer });
    });
    postToMain(YT_BRIDGE.messageType.SET_TRACK, {
      requestId,
      languageCode,
      targetLanguage: this.targetLang,
    });
    const ok = await changed;
    if (!ok) return false;
    if (this.originalSourceId || this.pendingSelectionEpoch !== null || this.nativePairActive) return false;
    this.inlineTranslationCache.clear();
    this.lastProcessedText = '';
    if (this.isActive) {
      void this.startAiPrefetchIfAvailable();
      this.processCaptions();
    }
    return true;
  }

  /** Select two per-video subtitle sources. A failed load keeps the current display. */
  public async setSubtitleSources(side: 'original' | 'translation', value: string): Promise<boolean> {
    if (!this.isActive) return false;
    if (side === 'translation' && value === 'auto') {
      const native = this.preferredNativeTrack(this.targetLang);
      const applied = await this.setSubtitleSources(side, native?.id || 'ai');
      this.nativeFallback = applied && !native;
      return applied;
    }
    const epoch = ++this.selectionEpoch;
    const generation = this.routeGeneration;
    const videoId = new URLSearchParams(window.location.search).get('v');
    const valid = () => this.isActive && epoch === this.selectionEpoch && generation === this.routeGeneration &&
      videoId === new URLSearchParams(window.location.search).get('v');
    const requestedOriginal = side === 'original' ? (value === 'auto' ? null : value) : this.originalSourceId;
    const requestedTranslation = side === 'translation' ? (value === 'ai' ? null : value) : this.translationSourceId;
    const activeTracks = this.discoveredTracks.filter(t => t.languageCode === this.selectedTrackId);
    const original = requestedOriginal
      ? this.discoveredTracks.find(t => t.id === requestedOriginal)
      : this.selectedTrackId ? (activeTracks.length === 1 ? activeTracks[0] : undefined) : this.selectSourceTrackForPrefetch();
    const translated = requestedTranslation ? this.discoveredTracks.find(t => t.id === requestedTranslation) : null;
    if (!original?.baseUrl || (requestedTranslation && !translated?.baseUrl)) return false;
    this.pendingSelectionEpoch = epoch;
    this.aiLoadEpoch += 1;
    this.aiLoadingKey = '';
    this.aiLoading = null;
    try {
      if (!translated) {
        const track = this.toDiscoveredTrack(original);
        this.strictPrefetchSource = { id: original.id, url: original.baseUrl, epoch };
        const loaded = await this.aiPrefetch.load(track, valid, () => {
          this.invalidateDomRendering();
          this.nativePairActive = false;
          this.nativePairOriginalLanguage = '';
          this.abortPendingRequests();
        });
        if (!loaded || !valid()) return false;
      } else {
        const [primaryPayload, secondaryPayload] = await Promise.all([
          this.fetchTimedTextViaMainWorld(original.baseUrl, 6000, original.id),
          original.id === translated.id ? this.fetchTimedTextViaMainWorld(original.baseUrl, 6000, original.id)
            : this.fetchTimedTextViaMainWorld(translated.baseUrl!, 6000, translated.id),
        ]);
        if (!valid()) return false;
        const primary = parseYouTubeTimedText(primaryPayload, { preserveTiming: true });
        const secondary = parseYouTubeTimedText(secondaryPayload, { preserveTiming: true });
        if (!primary.length || !secondary.length) return false;
        const segments = mergeSubtitleTimelines(primary, secondary);
        if (!segments.length) return false;
        this.cancelAiPrefetch();
        this.invalidateDomRendering();
        this.nativePairActive = true;
        this.nativePairOriginalLanguage = original.languageCode;
        this.syncEngine.setCues(segments);
        this.syncEngine.start(cue => {
          if (!this.isActive || !this.nativePairActive) return;
          if (!cue) { this.clearOverlay(); return; }
          const segment = cue as typeof segments[number];
          this.renderOverlay(segment.primaryText, segment.secondaryText, 'ready', true);
        });
      }
      this.originalSourceId = requestedOriginal;
      this.translationSourceId = requestedTranslation;
      return true;
    } catch { return false; }
    finally {
      if (this.strictPrefetchSource?.epoch === epoch) this.strictPrefetchSource = null;
      if (this.pendingSelectionEpoch === epoch) this.pendingSelectionEpoch = null;
    }
  }

  /** Popup entry point: current bilingual-subtitle state. */
  public getStateInfo(): {
    isActive: boolean;
    tracks: YouTubeTrack[];
    selectedTrackId: string | null;
    originalSourceId: string | null;
    translationSourceId: string | null;
    nativeFallback: boolean;
  } {
    return {
      isActive: this.isActive,
      tracks: this.discoveredTracks,
      selectedTrackId: this.selectedTrackId,
      originalSourceId: this.originalSourceId,
      translationSourceId: this.translationSourceId,
      nativeFallback: this.nativeFallback && !this.nativePairActive,
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
    this.selectionEpoch += 1;
    this.domRenderEpoch += 1;
    this.pendingSelectionEpoch = null;
    this.nativePairActive = false;
    this.originalSourceId = null;
    this.translationSourceId = null;
    this.nativePairOriginalLanguage = '';
    this.attemptedNativeKey = '';
    this.nativeFallback = false;
    this.discoveredTracks = [];
    this.selectedTrackId = null;
    this.cancelAiPrefetch();
    this.applyNativeSubtitleMask(false);
    this.clearOverlay();
    this.abortPendingRequests();
    this.lastProcessedText = '';
    if (this.clearGraceTimer !== null) {
      clearTimeout(this.clearGraceTimer);
      this.clearGraceTimer = null;
    }
    this.recentAiContext = [];
    this.requestTracks();
  }

  protected onSharedSettingsApplied(settings: any): void {
    if (settings?.uiLanguage) {
      this.uiLanguage = settings.uiLanguage;
    }
    if (!this.originalSourceId && !this.nativePairActive && settings?.sourceLanguage && settings.sourceLanguage !== 'auto') {
      void this.setTrack(settings.sourceLanguage);
    }
    if (this.isActive) {
      this.overlayRenderer.updateSettings({
        subtitleOriginalFontSize: this.subtitleOriginalFontSize,
        subtitleTranslatedFontSize: this.subtitleTranslatedFontSize,
        subtitleOriginalColor: this.subtitleOriginalColor,
        subtitleTranslatedColor: this.subtitleTranslatedColor,
        uiLanguage: this.uiLanguage as any,
        displayMode: this.displayMode as any,
      });
      this.overlayRenderer.refresh();
      const targetChanged = Boolean(settings?.targetLanguage && this.lastSettingsTarget !== null && settings.targetLanguage !== this.lastSettingsTarget);
      if (targetChanged) {
        this.selectionEpoch += 1;
        this.pendingSelectionEpoch = null;
        this.aiLoadEpoch += 1;
        this.aiLoadingKey = '';
        this.aiLoading = null;
        this.attemptedNativeKey = '';
        this.reconcileSubtitlePreference();
      }
      if (!targetChanged && !this.originalSourceId && !this.nativePairActive) this.reconcileSubtitlePreference();
    }
    if (settings?.targetLanguage) this.lastSettingsTarget = settings.targetLanguage;
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
    transColor: string = DEFAULT_SETTINGS.subtitleTranslatedColor ?? '#d4d4d4',
  ) {
    if (targetLang) this.targetLang = targetLang;
    if (displayMode) this.displayMode = displayMode;
    this.subtitleOriginalFontSize = origSize;
    this.subtitleTranslatedFontSize = transSize;
    this.subtitleOriginalColor = origColor;
    this.subtitleTranslatedColor = transColor;
    this.currentVideoId = new URLSearchParams(window.location.search).get('v');

    this.isActive = true;
    const host = this.getOverlayHost();
    this.overlayRenderer.mount(host);

    this.ensureNativeSubtitlesEnabled();
    this.requestTracks();
    if (this.subtitlePreference.mode === 'ai' && (this.originalSourceId || this.translationSourceId)) {
      void this.setSubtitleSources('translation', 'ai');
    } else if (this.subtitlePreference.mode === 'native') {
      this.reconcileSubtitlePreference();
    } else if (this.originalSourceId || this.translationSourceId) {
      void this.setSubtitleSources('translation', this.translationSourceId || 'ai');
    } else {
      void this.setTrack(this.sourceLang || 'auto');
      this.reconcileSubtitlePreference();
    }
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
    this.selectionEpoch += 1;
    this.domRenderEpoch += 1;
    this.pendingSelectionEpoch = null;
    this.attemptedNativeKey = '';
    this.nativePairActive = false;
    this.nativePairOriginalLanguage = '';
    this.isActive = false;
    this.cancelAiPrefetch();
    this.applyNativeSubtitleMask(false);
    this.clearOverlay();
    this.lastProcessedText = '';
    if (this.clearGraceTimer !== null) {
      clearTimeout(this.clearGraceTimer);
      this.clearGraceTimer = null;
    }

    for (const [id, pending] of this.pendingTimedTextRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('YouTubeCaptionAdapter stopped'));
      this.pendingTimedTextRequests.delete(id);
    }

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
    this.popover?.hide();
    logger.info('YouTubeCaptionAdapter stopped');
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

  private getNativeSubtitleTextFromDOM(): string {
    const visualLines = Array.from(document.querySelectorAll<HTMLElement>('.caption-visual-line')).filter(
      (el) => !el.closest('#owt-youtube-overlay-host'),
    );
    if (visualLines.length > 0) {
      const lines = visualLines
        .map((lineEl) => {
          const segs = Array.from(lineEl.querySelectorAll<HTMLElement>('.ytp-caption-segment'));
          const raw =
            segs.length > 0
              ? segs.map((s) => (s.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ')
              : (lineEl.textContent || '').replace(/\s+/g, ' ').trim();
          return raw;
        })
        .filter(Boolean);
      return normalizeSubtitleCueText(lines.join('\n'));
    }

    const rawSegments = Array.from(document.querySelectorAll<HTMLElement>('.ytp-caption-segment')).filter(
      (seg) => !seg.closest('#owt-youtube-overlay-host'),
    );
    if (rawSegments.length === 0) return '';

    const parts = rawSegments
      .map((seg) => (seg.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return normalizeSubtitleCueText(parts.join('\n'));
  }

  public processCaptions(): void {
    if (!this.isActive) return;
    // Full-track timedtext prefetch mode is driven by SyncEngine + video.currentTime
    if (this.aiPrefetch.isActive() || this.nativePairActive) return;

    const currentNativeText = this.getNativeSubtitleTextFromDOM();
    if (!currentNativeText) {
      // Hold the last rendered subtitle briefly between cues so YouTube's
      // transient caption-window teardown never makes the overlay flicker or jump.
      if (this.lastProcessedText !== '' && this.clearGraceTimer === null) {
        this.clearGraceTimer = setTimeout(() => {
          this.clearGraceTimer = null;
          this.lastProcessedText = '';
          this.clearOverlay();
        }, this.clearGraceMs);
      }
      return;
    }

    if (this.clearGraceTimer !== null) {
      clearTimeout(this.clearGraceTimer);
      this.clearGraceTimer = null;
    }

    if (this.lastProcessedText === currentNativeText) return;
    this.lastProcessedText = currentNativeText;

    void this.fetchAndRenderOverlay(currentNativeText, this.routeGeneration);
  }

  private async fetchAndRenderOverlay(originalText: string, generation: number) {
    const domEpoch = this.domRenderEpoch;
    const current = () => this.isActive && generation === this.routeGeneration && domEpoch === this.domRenderEpoch && !this.nativePairActive;
    if (this.aiLoading) {
      this.renderOverlay(originalText, this.subtitleStatus('subtitle.translatingLine'), 'pending');
      const loaded = await this.aiLoading;
      if (loaded || !current() || this.lastProcessedText !== originalText) {
        return;
      }
    }

    const fingerprint = `${this.currentVideoId}|${originalText}|${this.sourceLang}|${this.targetLang}`;

    const cached = this.inlineTranslationCache.get(fingerprint);
    if (cached) {
      this.renderOverlay(originalText, cached, 'ready');
      return;
    }

    // Render the source line + pending status immediately at identical 2-line height
    // so there is zero vertical layout jump when the translation arrives.
    this.renderOverlay(originalText, this.subtitleStatus('subtitle.translatingLine'), 'pending');

    if (this.pendingRequests.has(fingerprint)) return;

    await this.acquireSlot();
    if (!current()) { this.releaseSlot(); return; }
    const abortController = new AbortController();
    this.pendingRequests.set(fingerprint, { fingerprint, abortController });

    try {
      let response: any;
      try {
        response = await messageRouter.sendMessage({
          type: 'TRANSLATE_REQUEST',
          usage: 'video',
          segments: [{ id: 'yt-caption', text: originalText }],
          sourceLanguage: this.sourceLang,
          targetLanguage: this.targetLang,
          context: { previous: [...this.recentAiContext] },
        });
      } catch (firstErr) {
        if (!current() || abortController.signal.aborted) {
          return;
        }
        // Retry once after a brief pause before showing an error banner
        await new Promise((r) => setTimeout(r, 250));
        if (!current() || abortController.signal.aborted) {
          return;
        }
        response = await messageRouter.sendMessage({
          type: 'TRANSLATE_REQUEST',
          usage: 'video',
          segments: [{ id: 'yt-caption', text: originalText }],
          sourceLanguage: this.sourceLang,
          targetLanguage: this.targetLang,
          context: { previous: [...this.recentAiContext] },
        });
      }

      if (!current() || abortController.signal.aborted) {
        return;
      }

      const translatedText = response?.segments?.[0]?.translatedText || '';
      if (!translatedText) {
        if (this.lastProcessedText === originalText) {
          this.renderOverlay(originalText, this.subtitleStatus('subtitle.translationMissing'), 'error');
        }
        return;
      }

      this.inlineTranslationCache.set(fingerprint, translatedText);
      this.recentAiContext.push({ source: originalText, translation: translatedText });
      if (this.recentAiContext.length > 8) this.recentAiContext.shift();

      if (this.lastProcessedText === originalText) {
        this.renderOverlay(originalText, translatedText, 'ready');
      }
    } catch (err: any) {
      if (!current() || abortController.signal.aborted) return;
      if (this.lastProcessedText === originalText) {
        this.renderOverlay(originalText, this.subtitleStatus('subtitle.translationUnavailable'), 'error');
      }
      logger.error('Subtitle overlay translation failed', err);
    } finally {
      this.pendingRequests.delete(fingerprint);
      this.releaseSlot();
    }
  }

  private showPopover(surface: string, sentence: string, sentenceTranslation: string, clientX: number, clientY: number) {
    if (!this.popover) {
      this.popover = new DictionaryPopover({
        onLookup: async (word, sent) => {
          return await messageRouter.sendMessage({
            type: 'ANALYZE_WORD',
            word,
            sentence: sent || '',
            sourceLang: this.sourceLang || 'auto',
            targetLang: this.targetLang || 'zh-Hant',
            usage: 'video',
          });
        },
        onExplainGrammar: async (sent, focusWord) => {
          return await messageRouter.sendMessage({
            type: 'EXPLAIN_GRAMMAR',
            sentence: sent,
            focusWord,
            sourceLang: this.sourceLang || 'auto',
            targetLang: this.targetLang || 'zh-Hant',
            usage: 'video',
          });
        },
        onSave: async (entry) => {
          const result = await messageRouter.sendMessage({
            type: 'SAVE_VOCAB_ITEM',
            word: entry.surface,
            meaning: entry.meaning,
            lemma: entry.lemma,
            pos: entry.pos,
            phonetic: entry.phonetic,
            contextSentence: entry.sentence,
            contextTranslation: entry.sentenceTranslation,
            sourceLang: this.sourceLang || 'auto',
            targetLang: this.targetLang || 'zh-Hant',
            url: entry.sourceUrl,
            mediaTimestampMs: entry.mediaTimestampMs,
            mediaTitle: entry.mediaTitle,
          });
          if (!result?.success) throw new Error('Vocabulary save failed');
        },
      });
    }
    this.popover.show({
      sourceUrl: window.location.href,
      mediaTimestampMs: Math.round((document.querySelector('video')?.currentTime ?? 0) * 1000),
      mediaTitle: document.title,
      surface,
      sentence,
      sentenceTranslation,
      clientX,
      clientY,
      sourceLang: this.sourceLang || 'auto',
      targetLang: this.targetLang || 'zh-Hant',
    });
  }

  private abortPendingRequests() {
    for (const [_, state] of this.pendingRequests.entries()) {
      state.abortController.abort();
    }
    this.pendingRequests.clear();
  }
}

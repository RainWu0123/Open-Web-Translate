import { browser } from 'wxt/browser';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { parseNetflixTtmlDetailed, SubtitleCue as TtmlCue } from '@/shared/subtitles/ttml-parser';
import { createLogger } from '@/shared/logger';
import type { NetflixConfig, NetflixStateInfo } from '@/core/contracts/messages';
import { NetflixTrackManager, DiscoveredTrack, isBitmapImsc } from './netflix-track-manager';
import { NetflixSyncEngine } from './netflix-sync-engine';
import { NetflixOverlayRenderer } from './netflix-overlay-renderer';
import { NetflixTranslationPipeline } from './netflix-translation-pipeline';
import { NetflixDomObserver } from './netflix-dom-observer';
import {
  globalSubtitleSessionStore,
  CapturedTrack,
  SubtitleCue as SessionCue,
} from '@/core/session/subtitle-session-store';

const logger = createLogger('NetflixCaptionAdapter');
const CONTENT_SOURCE = 'owt-netflix-content';

export interface InternalHydrationResult {
  ok: boolean;
  source?: 'manifest' | 'network';
  trackKey?: string;
  cues?: TtmlCue[];
  reason?: 'timeout' | 'track-not-found' | 'api-unavailable';
}

export class NetflixCaptionAdapter {
  private isActive = false;
  private targetLang = 'zh-Hant';
  private displayMode: 'bilingual' | 'target-only' | 'source-only' = 'bilingual';
  private origSize = 18;
  private transSize = 22;
  private origColor = '#ffffff';
  private transColor = '#818cf8';
  private bottomPosition = 80;
  private lineSpacing = 4;
  private enableBitmapRescue = true;
  private learningMode = true;

  private trackManager = new NetflixTrackManager();
  private syncEngine = new NetflixSyncEngine();
  private overlayRenderer = new NetflixOverlayRenderer();
  private translationPipeline = new NetflixTranslationPipeline();
  private domObserver = new NetflixDomObserver();

  private controlsButton: HTMLElement | null = null;
  private controlsPollTimer: ReturnType<typeof setTimeout> | null = null;

  private pendingTtmlRequests = new Map<
    string,
    { resolve: (xml: string) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  private pendingHydrations = new Map<
    string,
    { resolve: (res: { ok: boolean; reason?: string }) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor() {}

  public init(): void {
    if (typeof window === 'undefined' || !window.location?.hostname?.includes('netflix.com')) {
      return;
    }

    logger.info('Initializing NetflixCaptionAdapter on netflix.com');
    this.setupMainWorldListener();
    this.setupSettingsListener();
    this.setupRuntimeConfigListener();
    this.setupHotkeyListeners();
    this.setupStateMessageListener();
    this.overlayRenderer.init();

    if (this.controlsPollTimer) clearInterval(this.controlsPollTimer);
    this.controlsPollTimer = setInterval(() => {
      this.injectControlsButton();
      this.tryAutoStart();
    }, 1000);

    window.addEventListener('mousemove', () => {
      this.injectControlsButton();
    });

    this.whenDomReady(() => {
      this.injectControlsButton();
      this.tryAutoStart();
    });
  }

  public async start(
    targetLang?: string,
    displayMode?: any,
    origSize?: number,
    transSize?: number,
    origColor?: string,
    transColor?: string,
  ): Promise<void> {
    if (targetLang) this.targetLang = targetLang;
    if (displayMode) this.displayMode = displayMode;
    if (origSize) this.origSize = origSize;
    if (transSize) this.transSize = transSize;
    if (origColor) this.origColor = origColor;
    if (transColor) this.transColor = transColor;

    if (this.isActive) return;
    this.isActive = true;
    logger.info('NetflixCaptionAdapter started', { targetLang: this.targetLang, displayMode: this.displayMode });

    this.applyOverlayStyleConfig();

    this.syncEngine.start((cue, videoMs) => {
      void this.onCueSyncTick(cue, videoMs);
    });

    await this.refreshSelectedTrack();
  }

  public stop(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.syncEngine.stop();
    this.domObserver.stop();
    this.applyNativeSubtitleMask(false);
    this.overlayRenderer.renderCues('', '');
    logger.info('NetflixCaptionAdapter stopped');
  }

  public getStateInfo(): NetflixStateInfo {
    const primaryTrack = globalSubtitleSessionStore.getPrimaryTrack();
    const secondaryTrack = globalSubtitleSessionStore.getSecondaryTrack();
    const mode = globalSubtitleSessionStore.getEngineMode();
    const discoveredCount = this.trackManager.getDiscoveredTracks().length;

    const primaryStatus = primaryTrack
      ? `${primaryTrack.lang} · text · ${primaryTrack.cues.length} cues · READY`
      : `未載入 (Found ${discoveredCount} tracks)`;

    const secondaryStatus = secondaryTrack
      ? `${secondaryTrack.lang} · text · ${secondaryTrack.cues.length} cues · READY`
      : '未載入 (No Secondary)';

    let modeLabel = '原生播放器模式 (Native Only)';
    let modeClass = 'native-only';

    if (mode === 'dual-native') {
      modeLabel = '官方雙語模式 (Dual Native)';
      modeClass = 'dual-native';
    } else if (mode === 'primary-native-ai-secondary') {
      modeLabel = '官方主軌 + AI 翻譯模式';
      modeClass = 'ai-mode';
    }

    const video = document.querySelector('video') as HTMLVideoElement | null;
    const nowMs = Math.round((video?.currentTime || 0) * 1000);
    const activePair = globalSubtitleSessionStore.getActivePair(nowMs);

    return {
      isActive: this.isActive,
      primaryStatus,
      secondaryStatus,
      modeLabel,
      modeClass,
      discoveredTracksCount: discoveredCount,
      activePreview: activePair
        ? {
            primary: activePair.primary.text,
            secondary: activePair.secondary?.text || '',
          }
        : null,
    };
  }

  private setupStateMessageListener(): void {
    try {
      browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
        if (message?.type === 'GET_NETFLIX_STATE') {
          sendResponse(this.getStateInfo());
          return true;
        }
      });
    } catch {
      // ignore
    }
  }

  private applyNativeSubtitleMask(hide: boolean): void {
    let styleEl = document.getElementById('owt-hide-native-netflix-subtitles');
    if (hide) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'owt-hide-native-netflix-subtitles';
        styleEl.textContent = `
          [data-uia="player-timedtext"],
          .player-timedtext {
            visibility: hidden !important;
          }
        `;
        (document.head || document.documentElement)?.appendChild(styleEl);
      }
    } else {
      if (styleEl) {
        styleEl.remove();
      }
    }
  }

  private applyOverlayStyleConfig(): void {
    this.overlayRenderer.setConfig({
      origSize: this.origSize,
      transSize: this.transSize,
      origColor: this.origColor,
      transColor: this.transColor,
      displayMode: this.displayMode,
      bottomPosition: this.bottomPosition,
      lineSpacing: this.lineSpacing,
    });
  }

  public getTrackManager(): NetflixTrackManager {
    return this.trackManager;
  }

  public getSyncEngine(): NetflixSyncEngine {
    return this.syncEngine;
  }

  public getOverlayRenderer(): NetflixOverlayRenderer {
    return this.overlayRenderer;
  }

  public getTranslationPipeline(): NetflixTranslationPipeline {
    return this.translationPipeline;
  }

  private whenDomReady(fn: () => void): void {
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    }
  }

  private setupMainWorldListener(): void {
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.source !== 'owt-netflix-main') return;

      if (data.type === 'OWT_NETFLIX_MANIFEST_TRACKS') {
        const rawTracks = data.tracks || [];
        const discovered: DiscoveredTrack[] = rawTracks.map((t: any) => {
          let url = '';
          if (t.downloadables) {
            for (const profileEntry of Object.values(t.downloadables as Record<string, any>)) {
              const u = profileEntry?.downloadUrls?.[0] || profileEntry?.urls?.[0];
              if (u) {
                url = u;
                break;
              }
            }
          }
          return {
            id: t.id,
            label: t.label,
            language: t.language,
            url,
            isCC: t.isCC,
            hasUrl: Boolean(url),
            rawTrack: t,
            downloadables: t.downloadables,
          };
        });

        this.trackManager.setDiscoveredTracks(discovered);
        logger.info(`Captured ${discovered.length} tracks from manifest/player`);
        if (this.isActive) {
          void this.refreshSelectedTrack();
        }
      }

      if (data.type === 'OWT_NETFLIX_HYDRATE_RESULT') {
        const txId = data.txId;
        const pending = this.pendingHydrations.get(txId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingHydrations.delete(txId);
          pending.resolve({ ok: Boolean(data.ok), reason: data.reason });
        }
      }

      if (data.type === 'OWT_NETFLIX_TTML_RESULT') {
        const requestId = data.requestId;
        const pending = this.pendingTtmlRequests.get(requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingTtmlRequests.delete(requestId);
          if (data.ok && typeof data.xml === 'string') {
            pending.resolve(data.xml);
          } else {
            pending.reject(new Error(data.error || 'Fetch TTML failed'));
          }
        }
      }
    });
  }

  private setupSettingsListener(): void {
    try {
      void browser.storage.sync.get(['owt_netflix_config', 'targetLanguage', 'displayMode']).then((res: any) => {
        if (res?.owt_netflix_config) {
          const cfg = res.owt_netflix_config;
          if (cfg.primarySize) this.origSize = cfg.primarySize;
          if (cfg.secondarySize) this.transSize = cfg.secondarySize;
          if (cfg.bottomPosition !== undefined) this.bottomPosition = cfg.bottomPosition;
          if (cfg.lineSpacing !== undefined) this.lineSpacing = cfg.lineSpacing;
          if (cfg.enableBitmapRescue !== undefined) this.enableBitmapRescue = cfg.enableBitmapRescue;
          if (cfg.learningMode !== undefined) this.learningMode = cfg.learningMode;
          this.applyOverlayStyleConfig();
        }
      });
    } catch {
      // ignore
    }
  }

  private setupRuntimeConfigListener(): void {
    try {
      browser.runtime.onMessage.addListener((message: any) => {
        if (message?.type === 'UPDATE_NETFLIX_CONFIG' && message.payload) {
          const p = message.payload as Partial<NetflixConfig>;
          if (p.enabled !== undefined) {
            if (p.enabled && !this.isActive) void this.start();
            if (!p.enabled && this.isActive) this.stop();
          }
          if (p.primarySize !== undefined) this.origSize = p.primarySize;
          if (p.secondarySize !== undefined) this.transSize = p.secondarySize;
          if (p.bottomPosition !== undefined) this.bottomPosition = p.bottomPosition;
          if (p.lineSpacing !== undefined) this.lineSpacing = p.lineSpacing;
          if (p.enableBitmapRescue !== undefined) this.enableBitmapRescue = p.enableBitmapRescue;
          if (p.learningMode !== undefined) this.learningMode = p.learningMode;

          this.applyOverlayStyleConfig();
        }
      });
    } catch {
      // ignore
    }
  }

  private setupHotkeyListeners(): void {
    window.addEventListener('keydown', (e) => {
      if (!this.isActive) return;
      if (!e.altKey) return;

      const key = e.key.toLowerCase();
      if (['q', 'e', 'a', 'd', 's', 'z', 'c'].includes(key)) {
        e.stopPropagation();

        const video = document.querySelector('video') as HTMLVideoElement | null;
        if (key === 'q' && video) {
          video.playbackRate = Math.max(0.5, video.playbackRate - 0.1);
        } else if (key === 'e' && video) {
          video.playbackRate = Math.min(2.0, video.playbackRate + 0.1);
        } else if (key === 'z') {
          this.displayMode = this.displayMode === 'target-only' ? 'bilingual' : 'target-only';
          this.applyOverlayStyleConfig();
        } else if (key === 'c') {
          this.displayMode = this.displayMode === 'source-only' ? 'bilingual' : 'source-only';
          this.applyOverlayStyleConfig();
        }
      }
    });
  }

  private async fetchTtmlXml(url: string): Promise<string> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTtmlRequests.delete(requestId);
        reject(new Error('TTML fetch timeout (8s)'));
      }, 8000);

      this.pendingTtmlRequests.set(requestId, { resolve, reject, timer });
      window.postMessage(
        {
          source: CONTENT_SOURCE,
          type: 'OWT_NETFLIX_FETCH_TTML',
          requestId,
          url,
        },
        '*',
      );
    });
  }

  private async sendHydrateRequest(trackId: string, performSeek: boolean): Promise<boolean> {
    const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingHydrations.delete(txId);
        resolve(false);
      }, performSeek ? 4000 : 1200);

      this.pendingHydrations.set(txId, {
        resolve: (res) => resolve(res.ok),
        timer,
      });

      window.postMessage(
        {
          source: CONTENT_SOURCE,
          type: 'OWT_NETFLIX_HYDRATE_TRACK',
          trackId,
          performSeek,
          txId,
        },
        '*',
      );
    });
  }

  public async hydrateTrack(track: DiscoveredTrack): Promise<InternalHydrationResult> {
    if (track.url) {
      try {
        const xml = await this.fetchTtmlXml(track.url);
        const parsed = parseNetflixTtmlDetailed(xml);
        if (parsed.cues.length > 0) {
          return { ok: true, source: 'manifest', trackKey: track.id, cues: parsed.cues };
        }
      } catch {}
    }

    const initialOk = await this.sendHydrateRequest(track.id, false);
    if (initialOk && track.url) {
      try {
        const xml = await this.fetchTtmlXml(track.url);
        const parsed = parseNetflixTtmlDetailed(xml);
        if (parsed.cues.length > 0) {
          return { ok: true, source: 'network', trackKey: track.id, cues: parsed.cues };
        }
      } catch {}
    }

    const seekOk = await this.sendHydrateRequest(track.id, true);
    if (seekOk && track.url) {
      try {
        const xml = await this.fetchTtmlXml(track.url);
        const parsed = parseNetflixTtmlDetailed(xml);
        if (parsed.cues.length > 0) {
          return { ok: true, source: 'network', trackKey: track.id, cues: parsed.cues };
        }
      } catch {}
    }

    return { ok: false, reason: 'timeout' };
  }

  private async refreshSelectedTrack(): Promise<void> {
    this.trackManager.setAdapterState('loading_primary');
    const primaryTrack = this.trackManager.findPrimaryTrack();
    const secondaryTrack = this.trackManager.findBestMatchingTrack(this.targetLang);

    if (!primaryTrack) {
      this.startTier3DomFallback();
      return;
    }

    try {
      const primaryRes = await this.hydrateTrack(primaryTrack);
      if (primaryRes.ok && primaryRes.cues) {
        const sessionCues: SessionCue[] = primaryRes.cues.map((c, i) => ({
          id: `pri_${i}_${c.startMs}`,
          startMs: c.startMs,
          endMs: c.endMs,
          text: c.text,
          lang: primaryTrack.language,
          source: 'netflix-native' as const,
        }));

        const capturedPrimary: CapturedTrack = {
          id: primaryTrack.id,
          lang: primaryTrack.language,
          source: primaryRes.source || 'manifest',
          cues: sessionCues,
        };
        globalSubtitleSessionStore.setPrimaryTrack(capturedPrimary);
        this.syncEngine.setCues(primaryRes.cues);
      }

      if (secondaryTrack) {
        const secondaryRes = await this.hydrateTrack(secondaryTrack);
        if (secondaryRes.ok && secondaryRes.cues) {
          const sessionCues: SessionCue[] = secondaryRes.cues.map((c, i) => ({
            id: `sec_${i}_${c.startMs}`,
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text,
            lang: secondaryTrack.language,
            source: 'netflix-native' as const,
          }));

          const capturedSecondary: CapturedTrack = {
            id: secondaryTrack.id,
            lang: secondaryTrack.language,
            source: secondaryRes.source || 'manifest',
            cues: sessionCues,
          };
          globalSubtitleSessionStore.setSecondaryTrack(capturedSecondary);
        }
      }

      const mode = globalSubtitleSessionStore.getEngineMode();
      if (mode === 'dual-native' || mode === 'primary-native-ai-secondary') {
        this.trackManager.setAdapterState('overlay_ready');
        this.applyNativeSubtitleMask(true);
        this.trackManager.setAdapterState('native_hidden');
      } else {
        this.startTier3DomFallback();
      }
    } catch (err) {
      logger.warn('Failed to load TTML track:', err);
      this.startTier3DomFallback();
    }
  }

  private startTier3DomFallback(): void {
    logger.info('Falling back to Tier 3 DOM Observer');
    this.trackManager.setAdapterState('degraded_ai');
    this.applyNativeSubtitleMask(false);

    this.domObserver.start((capturedText) => {
      if (!this.isActive) return;
      if (!capturedText) {
        this.overlayRenderer.renderCues('', '');
        return;
      }

      void this.translationPipeline.translateText(capturedText, this.targetLang).then((translated) => {
        this.overlayRenderer.renderCues(capturedText, translated);
      });
    });
  }

  private async onCueSyncTick(cue: TtmlCue | null, videoMs: number): Promise<void> {
    if (!this.isActive) return;

    const pair = globalSubtitleSessionStore.getActivePair(videoMs);
    if (pair) {
      this.overlayRenderer.renderPair(pair);
      return;
    }

    if (!cue || !cue.text.trim()) {
      this.overlayRenderer.renderCues('', '');
      return;
    }

    const origText = cue.text.trim();
    const translatedText = await this.translationPipeline.translateText(origText, this.targetLang);
    this.overlayRenderer.renderCues(origText, translatedText);
  }

  private tryAutoStart(): void {
    const isWatch = window.location.pathname.includes('/watch/');
    if (isWatch && !this.isActive) {
      void this.start();
    }
  }

  public injectControlsButton(): void {
    if (this.controlsButton && document.contains(this.controlsButton)) return;

    const audioSubBtn =
      document.querySelector('[data-uia="control-audio-subtitle"]') ||
      document.querySelector('[data-uia="control-speed"]') ||
      document.querySelector('[data-uia="control-fullscreen"]') ||
      document.querySelector('[data-uia="control-episodes"]');

    const parentContainer =
      audioSubBtn?.parentElement ||
      document.querySelector('[data-uia="controls-standard"]') ||
      document.querySelector('[data-uia="player-controls-bottom"]') ||
      document.querySelector('.AkiraPlayerControls--bottom-controls') ||
      document.querySelector('.player-controls-wrapper');

    if (!parentContainer) return;

    const btn = document.createElement('button');
    btn.className = 'owt-netflix-toggle-btn';
    btn.type = 'button';
    btn.title = 'OWT 雙語字幕與語言學習 Overlay';
    btn.style.cssText = [
      'background: rgba(0, 0, 0, 0.4)',
      'border: 1px solid rgba(255, 255, 255, 0.25)',
      'border-radius: 4px',
      'color: #ffffff',
      'font-size: 13px',
      'font-weight: bold',
      'cursor: pointer',
      'padding: 4px 8px',
      'margin: 0 6px',
      'display: inline-flex',
      'align-items: center',
      'justify-content: center',
      'height: 28px',
      'flex-shrink: 0',
      'align-self: center',
      'white-space: nowrap',
      'vertical-align: middle',
      'z-index: 2147483647',
    ].join(';');
    btn.innerHTML = '🌐 OWT';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.isActive) {
        this.stop();
        btn.style.opacity = '0.5';
      } else {
        void this.start();
        btn.style.opacity = '1.0';
      }
    });

    if (audioSubBtn && audioSubBtn.parentElement === parentContainer) {
      parentContainer.insertBefore(btn, audioSubBtn);
    } else {
      parentContainer.appendChild(btn);
    }
    this.controlsButton = btn;
  }
}

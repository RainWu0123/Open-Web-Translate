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
  private isUserDisabled = false;
  private targetLang = 'zh-Hant';
  private displayMode: 'bilingual' | 'target-only' | 'source-only' = 'bilingual';
  private origSize = 20;
  private transSize = 24;
  private origColor = '#ffffff';
  private transColor = '#ffde59';
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
  private lastFetchError: string | null = null;

  private pendingTtmlRequests = new Map<
    string,
    {
      resolve: (res: { ok: boolean; xml?: string; status?: number; contentType?: string; error?: string }) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  private pendingHydrations = new Map<
    string,
    { resolve: (res: { ok: boolean; reason?: string }) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor() {}

  public requestMainWorldTracks(): void {
    if (typeof window !== 'undefined') {
      window.postMessage(
        {
          source: CONTENT_SOURCE,
          type: 'OWT_NETFLIX_REQUEST_TRACKS',
        },
        '*',
      );
    }
  }

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
    this.requestMainWorldTracks();

    // Attach F12 Debug Helper to window
    if (typeof window !== 'undefined') {
      (window as any).__OWT_DEBUG__ = () => {
        this.requestMainWorldTracks();
        const isMainInjected = document.documentElement?.getAttribute('data-owt-netflix-main') === '1';
        const primary = globalSubtitleSessionStore.getPrimaryTrack();
        const secondary = globalSubtitleSessionStore.getSecondaryTrack();
        const video = document.querySelector('video') as HTMLVideoElement | null;
        const nowMs = Math.round((video?.currentTime || 0) * 1000);
        const pair = globalSubtitleSessionStore.getActivePair(nowMs);

        console.group('🔍 OWT Netflix Diagnostic Evidence Breakdown (5-Step Trace)');
        console.log('[Step 1] MAIN Script Injected:', isMainInjected ? '✅ Injected' : '❌ Failed');
        console.log('[Step 2] Manifest Tracks Discovered:', `${this.trackManager.getDiscoveredTracks().length} tracks (With URLs: ${this.trackManager.getDiscoveredTracks().filter(t => Boolean(t.url)).length})`);
        console.log('[Step 3] Fetch Status:', this.lastFetchError || 'OK');
        console.log('[Step 4] Primary Cues:', primary ? `${primary.cues.length} cues (${primary.lang})` : '❌ Not Loaded');
        console.log('[Step 4] Secondary Cues:', secondary ? `${secondary.cues.length} cues (${secondary.lang})` : 'AI Fallback');
        console.log('[Step 5] Sync Time:', `${(video?.currentTime || 0).toFixed(2)}s`, 'Active Cue Pair:', pair);
        console.groupEnd();

        if (typeof (window as any).__OWT_MAIN_DEBUG__ === 'function') {
          (window as any).__OWT_MAIN_DEBUG__();
        }

        return {
          step1_mainInjected: isMainInjected,
          step2_discoveredTracks: this.trackManager.getDiscoveredTracks().length,
          step2_tracksWithUrl: this.trackManager.getDiscoveredTracks().filter(t => Boolean(t.url)).length,
          step3_fetchStatus: this.lastFetchError || 'OK',
          selectedPrimary: primary
            ? {
                lang: primary.lang,
                cuesCount: primary.cues.length,
                activeCue: pair?.primary?.text || null,
              }
            : null,
          selectedSecondary: secondary
            ? {
                lang: secondary.lang,
                cuesCount: secondary.cues.length,
                activeCue: pair?.secondary?.text || null,
              }
            : null,
          renderer: {
            active: this.isActive,
            nativeHidden: true,
          },
        };
      };
    }

    if (this.controlsPollTimer) clearInterval(this.controlsPollTimer);
    this.controlsPollTimer = setInterval(() => {
      this.injectControlsButton();
      this.tryAutoStart();
      if (this.isActive) {
        this.overlayRenderer.ensureHostAttached();
      }
    }, 1000);

    window.addEventListener('mousemove', () => {
      this.injectControlsButton();
      if (this.isActive) {
        this.overlayRenderer.ensureHostAttached();
      }
    });

    this.whenDomReady(() => {
      this.injectControlsButton();
      this.tryAutoStart();
      if (this.isActive) {
        this.overlayRenderer.ensureHostAttached();
      }
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
    this.isUserDisabled = false;
    logger.info('NetflixCaptionAdapter started', { targetLang: this.targetLang, displayMode: this.displayMode });

    this.applyOverlayStyleConfig();
    this.overlayRenderer.showOverlay();

    this.requestMainWorldTracks();

    // Start live sync engine & DOM Observer capture
    this.syncEngine.start((cue, videoMs) => {
      void this.onCueSyncTick(cue, videoMs);
    });

    this.startTier3DomFallback();

    await this.refreshSelectedTrack();
  }

  public stop(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.syncEngine.stop();
    this.domObserver.stop();
    this.applyNativeSubtitleMask(false);
    this.overlayRenderer.showNativeSubtitles();
    this.overlayRenderer.hideOverlay();
    logger.info('NetflixCaptionAdapter stopped');
  }

  public updateConfig(p: Partial<NetflixConfig>): void {
    if (p.enabled !== undefined) {
      if (p.enabled && !this.isActive) {
        this.isUserDisabled = false;
        void this.start();
      }
      if (!p.enabled && this.isActive) {
        this.isUserDisabled = true;
        this.stop();
      }
    }
    if (p.primarySize !== undefined) this.origSize = p.primarySize;
    if (p.secondarySize !== undefined) this.transSize = p.secondarySize;
    if (p.bottomPosition !== undefined) this.bottomPosition = p.bottomPosition;
    if (p.lineSpacing !== undefined) this.lineSpacing = p.lineSpacing;
    if (p.enableBitmapRescue !== undefined) this.enableBitmapRescue = p.enableBitmapRescue;
    if (p.learningMode !== undefined) this.learningMode = p.learningMode;

    this.applyOverlayStyleConfig();
    this.overlayRenderer.updateStyles();
  }

  public getStateInfo(): NetflixStateInfo {
    this.requestMainWorldTracks();

    const isMainInjected = document.documentElement?.getAttribute('data-owt-netflix-main') === '1';
    const primaryTrack = globalSubtitleSessionStore.getPrimaryTrack();
    const secondaryTrack = globalSubtitleSessionStore.getSecondaryTrack();
    const mode = globalSubtitleSessionStore.getEngineMode();
    const discoveredCount = this.trackManager.getDiscoveredTracks().length;

    let primaryStatus = `Step 2: Discovered ${discoveredCount} tracks`;
    if (!isMainInjected) {
      primaryStatus = '斷點 Step 1 失敗: MAIN 腳本未注入';
    } else if (discoveredCount === 0) {
      primaryStatus = '斷點 Step 2 失敗: 未擷取到 Manifest 軌道 (0 軌)';
    } else if (this.lastFetchError) {
      primaryStatus = `斷點 Step 3 失敗: TTML 下載錯誤 (${this.lastFetchError})`;
    } else if (primaryTrack) {
      primaryStatus = `Step 4 OK: ${primaryTrack.lang} (${primaryTrack.cues.length} Cues READY)`;
    }

    const secondaryStatus = secondaryTrack
      ? `Step 4 OK: ${secondaryTrack.lang} (${secondaryTrack.cues.length} Cues)`
      : '副軌：使用 AI 動態翻譯';

    let modeLabel = '原生播放器模式 (Native Only)';
    let modeClass = 'native-only';

    if (mode === 'dual-native') {
      modeLabel = '官方雙語模式 (Dual Native)';
      modeClass = 'dual-native';
    } else if (mode === 'primary-native-ai-secondary' || primaryTrack) {
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

  private async fetchTtmlXml(url: string): Promise<{ ok: boolean; xml: string; status: number; contentType: string }> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return new Promise<{ ok: boolean; xml: string; status: number; contentType: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTtmlRequests.delete(requestId);
        this.lastFetchError = 'TTML Fetch Timeout (8s)';
        reject(new Error('TTML fetch timeout (8s)'));
      }, 8000);

      this.pendingTtmlRequests.set(requestId, {
        resolve: (res) => {
          if (res.ok && res.xml) {
            resolve({ ok: true, xml: res.xml, status: res.status || 200, contentType: res.contentType || '' });
          } else {
            reject(new Error(res.error || 'Fetch failed'));
          }
        },
        reject,
        timer,
      });

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
    let targetUrl = track.url;
    if (!targetUrl) {
      targetUrl = this.trackManager.findTextFallbackUrl(track) || '';
    }

    if (targetUrl) {
      try {
        const rawFetchRes: any = await this.fetchTtmlXml(targetUrl);
        const xml = typeof rawFetchRes === 'string' ? rawFetchRes : rawFetchRes?.xml || '';
        const httpStatus = typeof rawFetchRes === 'object' ? rawFetchRes?.status || 200 : 200;
        const contentType = typeof rawFetchRes === 'object' ? rawFetchRes?.contentType || 'text/xml' : 'text/xml';

        console.log('[OWT][Step3 Fetch]', {
          lang: track.language,
          trackId: track.id,
          urlPresent: Boolean(targetUrl),
          httpStatus,
          contentType,
          bodyBytes: xml.length,
          preview: xml.slice(0, 120).replace(/\n/g, ' '),
        });

        const parsed = parseNetflixTtmlDetailed(xml);
        console.log('[OWT][Step4 Parse]', {
          lang: track.language,
          trackId: track.id,
          profile: track.downloadables ? Object.keys(track.downloadables)[0] : 'unknown',
          cueCount: parsed.cues.length,
          firstCue: parsed.cues[0]
            ? {
                startMs: parsed.cues[0].startMs,
                endMs: parsed.cues[0].endMs,
                text: parsed.cues[0].text.slice(0, 80),
              }
            : null,
        });

        if (parsed.cues.length > 0) {
          this.lastFetchError = null;
          return { ok: true, source: 'manifest', trackKey: track.id, cues: parsed.cues };
        }
      } catch (err: any) {
        this.lastFetchError = err?.message || 'TTML fetch failed';
        logger.warn(`Failed to fetch TTML XML for track ${track.id}:`, err);
      }
    }

    const initialOk = await this.sendHydrateRequest(track.id, false);
    if (initialOk) {
      const updatedUrl = track.url || this.trackManager.findTextFallbackUrl(track);
      if (updatedUrl) {
        try {
          const rawFetchRes: any = await this.fetchTtmlXml(updatedUrl);
          const xml = typeof rawFetchRes === 'string' ? rawFetchRes : rawFetchRes?.xml || '';
          const parsed = parseNetflixTtmlDetailed(xml);
          if (parsed.cues.length > 0) {
            this.lastFetchError = null;
            return { ok: true, source: 'network', trackKey: track.id, cues: parsed.cues };
          }
        } catch {}
      }
    }

    return { ok: false, reason: 'timeout' };
  }

  private async refreshSelectedTrack(): Promise<void> {
    this.trackManager.setAdapterState('loading_primary');
    const primaryTrack = this.trackManager.findPrimaryTrack();
    const secondaryTrack = this.trackManager.findBestMatchingTrack(this.targetLang);

    if (!primaryTrack) {
      const count = this.trackManager.getDiscoveredTracks().length;
      this.overlayRenderer.renderCues(
        '⚠️ 尚未擷取到 Netflix 字幕軌',
        count > 0 ? `(已發現 ${count} 個字幕軌，請切換選單)` : '(請開啟 Netflix 音訊與字幕選單選擇字幕語言)',
      );
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
      if (mode === 'dual-native' || mode === 'primary-native-ai-secondary' || globalSubtitleSessionStore.getPrimaryTrack()) {
        this.trackManager.setAdapterState('overlay_ready');
        this.applyNativeSubtitleMask(true);
        this.trackManager.setAdapterState('native_hidden');
      } else {
        const count = this.trackManager.getDiscoveredTracks().length;
        this.overlayRenderer.renderCues(
          '⚠️ 尚未載入實體雙語字幕軌',
          `(已發現 ${count} 個字幕軌，已開啟即時 DOM 擷取)`,
        );
        this.startTier3DomFallback();
      }
    } catch (err) {
      logger.warn('Failed to load TTML track:', err);
      this.overlayRenderer.renderCues('⚠️ 尚未擷取到 Netflix 字幕軌', '(嘗試重新連接 Netflix 播放器中...)');
      this.startTier3DomFallback();
    }
  }

  private startTier3DomFallback(): void {
    logger.info('Starting Tier 3 DOM Observer live capture');
    this.trackManager.setAdapterState('degraded_ai');
    // Keep native subtitles unmasked during DOM fallback so user can see subtitles
    this.applyNativeSubtitleMask(false);

    this.domObserver.start((capturedText) => {
      if (!this.isActive) return;
      if (!capturedText) {
        return;
      }

      void this.translationPipeline.translateText(capturedText, this.targetLang).then((translated) => {
        this.overlayRenderer.renderCues(capturedText, translated);
      });
    });
  }

  private async onCueSyncTick(cue: TtmlCue | null, videoMs: number): Promise<void> {
    if (!this.isActive) return;

    const primaryTrack = globalSubtitleSessionStore.getPrimaryTrack();
    const pair = globalSubtitleSessionStore.getActivePair(videoMs);

    if (pair) {
      console.log('[OWT][Step5 Sync]', {
        nowMs: Math.round(videoMs),
        lang: primaryTrack?.lang || 'none',
        activeCue: pair.primary.text.slice(0, 80),
      });
      this.overlayRenderer.renderPair(pair);
      return;
    }

    if (cue && cue.text.trim()) {
      const origText = cue.text.trim();
      console.log('[OWT][Step5 Sync]', {
        nowMs: Math.round(videoMs),
        lang: primaryTrack?.lang || 'none',
        activeCue: origText.slice(0, 80),
      });
      const translatedText = await this.translationPipeline.translateText(origText, this.targetLang);
      this.overlayRenderer.renderCues(origText, translatedText);
      return;
    }

    if (!primaryTrack) {
      const count = this.trackManager.getDiscoveredTracks().length;
      this.overlayRenderer.renderCues(
        '⚠️ 尚未擷取到 Netflix 字幕軌',
        count > 0 ? `(已發現 ${count} 個字幕軌，請切換選單)` : '(請開啟 Netflix 音訊與字幕選單選擇字幕語言)',
      );
    } else {
      // Subtitle track is loaded, but no dialogue at current timestamp
      this.overlayRenderer.renderCues('', '');
    }
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
      const elements = document.querySelectorAll('[data-uia="player-timedtext"], .player-timedtext');
      elements.forEach((el) => {
        (el as HTMLElement).style.visibility = 'visible';
      });
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

  private setupMainWorldListener(): void {
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.source !== 'owt-netflix-main') return;

      if (data.type === 'OWT_NETFLIX_MANIFEST_TRACKS') {
        const rawTracks = data.tracks || [];
        const discovered: DiscoveredTrack[] = rawTracks.map((t: any) => ({
          id: t.id || t.trackId || t.language,
          label: t.label || t.languageDescription || t.language,
          language: t.language || t.bcp47 || 'unknown',
          url: t.url || '',
          isCC: Boolean(t.isCC || t.isClosedCaptions),
          hasUrl: Boolean(t.url),
          rawTrack: t.rawTrack || t,
          downloadables: t.downloadables,
        }));

        this.trackManager.setDiscoveredTracks(discovered);
        logger.info(`Captured ${discovered.length} tracks from manifest/player (With URLs: ${discovered.filter(d => Boolean(d.url)).length})`);
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
            this.lastFetchError = null;
            pending.resolve({
              ok: true,
              xml: data.xml,
              status: Number(data.status || 200),
              contentType: String(data.contentType || ''),
            });
          } else {
            this.lastFetchError = data.error || 'Fetch TTML failed';
            pending.resolve({
              ok: false,
              xml: '',
              status: Number(data.status || 0),
              contentType: '',
              error: data.error || 'Fetch TTML failed',
            });
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
          this.updateConfig(cfg);
        }
      });
    } catch {
      // ignore
    }
  }

  private setupRuntimeConfigListener(): void {
    const handleConfigUpdate = (p: Partial<NetflixConfig>) => {
      this.updateConfig(p);
    };

    try {
      browser.runtime.onMessage.addListener((message: any) => {
        if (message?.type === 'UPDATE_NETFLIX_CONFIG' && message.payload) {
          handleConfigUpdate(message.payload);
        }
      });

      browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.owt_netflix_config?.newValue) {
          handleConfigUpdate(changes.owt_netflix_config.newValue);
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
          this.overlayRenderer.updateStyles();
        } else if (key === 'c') {
          this.displayMode = this.displayMode === 'source-only' ? 'bilingual' : 'source-only';
          this.applyOverlayStyleConfig();
          this.overlayRenderer.updateStyles();
        }
      }
    });
  }

  private tryAutoStart(): void {
    const isWatch = window.location.pathname.includes('/watch/');
    if (isWatch && !this.isActive && !this.isUserDisabled) {
      void this.start();
    }
  }

  public injectControlsButton(): void {
    const existingBtns = document.querySelectorAll('.owt-netflix-toggle-btn');
    if (existingBtns.length > 0) {
      for (let i = 1; i < existingBtns.length; i++) {
        existingBtns[i].remove();
      }
      this.controlsButton = existingBtns[0] as HTMLElement;
      if (document.contains(this.controlsButton)) return;
    }

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
        this.isUserDisabled = true;
        this.stop();
        btn.style.opacity = '0.5';
      } else {
        this.isUserDisabled = false;
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

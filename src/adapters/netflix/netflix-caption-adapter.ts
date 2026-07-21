import { messageRouter } from '@/infrastructure/messaging/message-router';
import { parseNetflixTtml, SubtitleCue } from '@/shared/subtitles/ttml-parser';
import { createLogger } from '@/shared/logger';
import { NetflixForensicProbe } from './netflix-forensic-probe';

const logger = createLogger('NetflixCaptionAdapter');

const MAIN_SOURCE = 'owt-netflix-main';
const CONTENT_SOURCE = 'owt-netflix-content';

interface DiscoveredTrack {
  id: string;
  label: string;
  language: string;
  url: string;
  isCC: boolean;
  hasUrl: boolean;
  trackType?: string;
}

/** Match Netflix language codes/labels against the user's target language. */
function trackMatchesTargetLanguage(
  track: { language: string; label: string },
  targetLang: string,
): boolean {
  const lang = (track.language || '').toLowerCase().replace(/_/g, '-');
  const label = (track.label || '').toLowerCase();
  const target = (targetLang || '').toLowerCase().replace(/_/g, '-');
  const targetPrefix = target.split('-')[0];

  if (!targetPrefix) return false;

  // Chinese family: zh-Hant / zh-Hans / cmn / yue / 中文 / 繁體 / 简体
  if (targetPrefix === 'zh' || target.startsWith('cmn') || target.startsWith('yue')) {
    const isChineseLang =
      lang.startsWith('zh') ||
      lang.startsWith('cmn') ||
      lang.startsWith('yue') ||
      lang.includes('hant') ||
      lang.includes('hans') ||
      lang.includes('cht') ||
      lang.includes('chs');
    const isChineseLabel =
      label.includes('中文') ||
      label.includes('chinese') ||
      label.includes('mandarin') ||
      label.includes('cantonese') ||
      label.includes('繁體') ||
      label.includes('繁体') ||
      label.includes('简体') ||
      label.includes('簡體') ||
      label.includes('國語') ||
      label.includes('国语') ||
      label.includes('粵語') ||
      label.includes('粤语');
    return isChineseLang || isChineseLabel;
  }

  if (lang.startsWith(targetPrefix)) return true;
  if (label.includes(targetPrefix)) return true;
  return false;
}

function findCueAt(cues: SubtitleCue[], currentMs: number): SubtitleCue | undefined {
  // Linear scan is fine for typical cue counts; cues are sorted by startMs.
  // Prefer the last matching cue if ranges overlap.
  let hit: SubtitleCue | undefined;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (c.startMs > currentMs) break;
    if (currentMs >= c.startMs && currentMs <= c.endMs) hit = c;
  }
  return hit;
}

/**
 * Netflix caption adapter (isolated content-script world).
 *
 * Primary path (Firefox-safe):
 *   MAIN-world netflix-main.ts reads Cadmium playerApp tracks
 *   → window.postMessage pure JSON
 *   → this adapter stores tracks, requests TTML via page-world fetch
 *   → parse cues → sync overlay to video.currentTime
 *
 * DOM / textTracks / XHR patching are NOT primary sources.
 */
export class NetflixCaptionAdapter {
  private isActive = false;
  private observer: MutationObserver | null = null;
  private controlsButton: HTMLElement | null = null;
  private selectorMenu: HTMLElement | null = null;
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

  private discoveredTracks: DiscoveredTrack[] = [];
  private selectedTrackId: string = 'ai-translate'; // 'ai-translate' or trackId
  private secondaryCues: SubtitleCue[] = [];

  private inlineTranslationCache = new Map<string, string>();
  private lastProcessedText = '';
  private translationRequestVersion = 0;
  private forensicProbe = new NetflixForensicProbe();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private nativeTranslationCues: SubtitleCue[] = [];
  private hasAutoSelected = false;
  private channelAlive = false;
  private lastProbeStatus: { pollCount: number; trackCount: number; ts: number } | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPingTs = 0;
  private missedPings = 0;
  private clearGraceMs = 800;
  private lastCueRenderTs = 0;
  private nativeSubtitleElements = new Set<HTMLElement>();
  private pendingTtmlRequests = new Map<
    string,
    { resolve: (xml: string) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private pendingResolveRequests = new Map<
    string,
    { resolve: (url: string) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private messageListenerBound = false;
  private controlsPollTimer: ReturnType<typeof setInterval> | null = null;
  private nativeLoadGeneration = 0;
  private lastRenderedKey = '';
  /** TTML health: if no cue matches within grace period, fall back to DOM. */
  private ttmlMatchCount = 0;
  private ttmlLoadedAt = 0;

  constructor() {}

  public init() {
    if (typeof window === 'undefined' || !window.location?.hostname?.includes('netflix.com')) {
      return;
    }

    logger.info('Initializing NetflixCaptionAdapter on netflix.com');
    this.setupMainWorldMessageListener();
    this.setupNavigationListeners();
    this.setupSettingsListener();
    this.setupMouseMoveInjectionListener();
    this.startControlsPoller();
    this.startHeartbeat();

    // Defer any DOM writes until body exists (document_start race).
    this.whenDomReady(() => {
      this.forensicProbe.start();
      this.injectControlsButton();
      this.tryAutoStart();
    });
  }

  /** Wait for document.body before touching the live DOM. */
  private whenDomReady(fn: () => void) {
    if (document.body) {
      fn();
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          if (document.body) fn();
          else {
            // Extremely early edge case: keep a short retry.
            let attempts = 0;
            const retry = () => {
              attempts += 1;
              if (document.body) fn();
              else if (attempts < 40) setTimeout(retry, 50);
            };
            retry();
          }
        },
        { once: true },
      );
      return;
    }
    let attempts = 0;
    const retry = () => {
      attempts += 1;
      if (document.body) fn();
      else if (attempts < 40) setTimeout(retry, 50);
    };
    retry();
  }

  private bodyContains(el: Element | null): boolean {
    if (!el) return false;
    return !!(document.body && document.body.contains(el));
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.lastPingTs = Date.now();
      try {
        window.postMessage({ source: CONTENT_SOURCE, type: 'OWT_NETFLIX_PING', ts: this.lastPingTs }, '*');
      } catch { /* ignore */ }
      if (this.isActive && this.discoveredTracks.length === 0 && this.channelAlive) {
        try {
          window.postMessage({ source: CONTENT_SOURCE, type: 'OWT_NETFLIX_REQUEST_TRACKS' }, '*');
        } catch { /* ignore */ }
      }
    }, 3000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    this.missedPings = 0;
  }

  private setupMainWorldMessageListener() {
    if (this.messageListenerBound) return;
    this.messageListenerBound = true;

    window.addEventListener('message', (event) => {
      // Same-window only; MAIN and isolated share window for postMessage.
      if (event.source !== window) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      // Accept MAIN source messages (and legacy unscoped track messages).
      const isMain =
        data.source === MAIN_SOURCE ||
        data.type === 'OWT_NETFLIX_TRACKS_DISCOVERED' ||
        data.type === 'OWT_TEST_PING' ||
        data.type === 'OWT_NETFLIX_PROBE_STATUS' ||
        data.type === 'OWT_NETFLIX_TTML_RESULT' ||
        data.type === 'OWT_NETFLIX_RESOLVE_TRACK_RESULT';

      if (!isMain) return;

      switch (data.type) {
        case 'OWT_TEST_PING':
          this.channelAlive = true;
          this.missedPings = 0;
          logger.info('MAIN-world channel PING received', data.payload || data);
          break;

        case 'OWT_NETFLIX_PONG':
          this.channelAlive = true;
          this.missedPings = 0;
          break;

        case 'OWT_NETFLIX_PROBE_STATUS':
          this.channelAlive = true;
          this.lastProbeStatus = data.payload || null;
          break;

        case 'OWT_NETFLIX_TRACKS_DISCOVERED':
          this.channelAlive = true;
          void this.onTracksDiscovered(Array.isArray(data.tracks) ? data.tracks : []);
          break;

        case 'OWT_NETFLIX_TTML_RESULT':
          this.onTtmlResult(data);
          break;

        case 'OWT_NETFLIX_RESOLVE_TRACK_RESULT':
          this.onResolveTrackResult(data);
          break;

        default:
          break;
      }
    });
  }

  private async onTracksDiscovered(rawTracks: any[]) {
    // Accept tracks even without URL — MAIN may resolve downloadables later.
    const tracks: DiscoveredTrack[] = rawTracks
      .filter((t) => t && (t.id || t.label || t.language))
      .map((t) => {
        const url = typeof t.url === 'string' && t.url.startsWith('http') ? t.url : '';
        return {
          id: String(t.id || url || `${t.language}:${t.label}`),
          label: String(t.label || 'Unknown Track'),
          language: String(t.language || 'unknown'),
          url,
          isCC: !!t.isCC,
          hasUrl: !!url || !!t.hasUrl,
          trackType: typeof t.trackType === 'string' ? t.trackType : undefined,
        };
      });

    if (tracks.length === 0) {
      if (this.discoveredTracks.length > 0) {
        logger.info('MAIN reported 0 tracks (player may have torn down)');
      }
      return;
    }

    const prevCount = this.discoveredTracks.length;
    // Merge: keep previously resolved URLs when MAIN re-emits without them.
    const merged = tracks.map((t) => {
      const prev = this.discoveredTracks.find((p) => p.id === t.id);
      if (prev?.url && !t.url) {
        return { ...t, url: prev.url, hasUrl: true };
      }
      return t;
    });
    this.discoveredTracks = merged;
    logger.info(`Tracks received from MAIN: ${merged.length} (was ${prevCount})`, {
      labels: merged.map((t) => `${t.label}${t.url ? '' : '[no-url]'}`),
      withUrl: merged.filter((t) => !!t.url).length,
    });

    this.updateSelectorMenuOptions();

    if (this.isActive) {
      // Always try native target-language track first (Chinese etc.)
      await this.loadNativeTranslationTrack();
      await this.ensureTrackSelectionAndLoad();
    }
  }

  /** Pick source (original) track for secondary line / timed original. */
  private pickSourceTrack(): DiscoveredTrack | undefined {
    const tracks = this.discoveredTracks;
    if (tracks.length === 0) return undefined;

    // Never pick the target-language track as "source/original"
    const nonTarget = tracks.filter((t) => !trackMatchesTargetLanguage(t, this.targetLang));

    const pool = nonTarget.length > 0 ? nonTarget : tracks;

    // Prefer Japanese for JP content, then English, then first text-like track
    return (
      pool.find(
        (t) =>
          t.language.toLowerCase().startsWith('ja') ||
          t.label.toLowerCase().includes('japanese') ||
          t.label.includes('日語') ||
          t.label.includes('日语') ||
          t.label.includes('日本語'),
      ) ||
      pool.find(
        (t) =>
          t.language.toLowerCase().startsWith('en') ||
          t.label.toLowerCase().includes('english'),
      ) ||
      pool.find((t) => !!t.url) ||
      pool[0]
    );
  }

  /** Auto-select a secondary source track and load TTML when active. */
  private async ensureTrackSelectionAndLoad() {
    if (!this.isActive) return;
    if (this.discoveredTracks.length === 0) return;

    // Prefer keeping current selection if still present and cues already loaded.
    if (
      this.selectedTrackId !== 'ai-translate' &&
      this.discoveredTracks.some((t) => t.id === this.selectedTrackId) &&
      this.secondaryCues.length > 0
    ) {
      await this.loadNativeTranslationTrack();
      return;
    }

    if (!this.hasAutoSelected || this.selectedTrackId === 'ai-translate') {
      const defaultTrack = this.pickSourceTrack();
      if (defaultTrack) {
        this.hasAutoSelected = true;
        logger.info(`Auto-selecting source track: ${defaultTrack.label} (${defaultTrack.language})`);
        await this.selectTrack(defaultTrack.id);
        return;
      }
    }

    if (this.selectedTrackId !== 'ai-translate') {
      await this.selectTrack(this.selectedTrackId);
    }
  }

  private async ensureTrackUrl(track: DiscoveredTrack): Promise<string> {
    if (track.url && track.url.startsWith('http')) return track.url;

    const resolved = await this.resolveTrackUrlViaMain(track.id);
    if (resolved) {
      track.url = resolved;
      track.hasUrl = true;
      // Persist into discovered list
      const idx = this.discoveredTracks.findIndex((t) => t.id === track.id);
      if (idx >= 0) {
        this.discoveredTracks[idx] = { ...this.discoveredTracks[idx], url: resolved, hasUrl: true };
      }
      return resolved;
    }
    return '';
  }

  private resolveTrackUrlViaMain(trackId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const requestId = `resolve-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const timer = setTimeout(() => {
        this.pendingResolveRequests.delete(requestId);
        resolve(''); // soft-fail → caller handles empty
      }, 3500);

      this.pendingResolveRequests.set(requestId, {
        resolve: (url) => resolve(url),
        reject,
        timer,
      });

      try {
        window.postMessage(
          {
            source: CONTENT_SOURCE,
            type: 'OWT_NETFLIX_RESOLVE_TRACK',
            requestId,
            trackId,
          },
          '*',
        );
      } catch {
        clearTimeout(timer);
        this.pendingResolveRequests.delete(requestId);
        resolve('');
      }
    });
  }

  private onResolveTrackResult(data: any) {
    const requestId = data?.requestId;
    if (typeof requestId !== 'string') return;
    const pending = this.pendingResolveRequests.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingResolveRequests.delete(requestId);
    pending.resolve(typeof data.url === 'string' ? data.url : '');
  }

  private async selectTrack(trackId: string) {
    const track = this.discoveredTracks.find((t) => t.id === trackId);
    if (!track) {
      logger.warn('selectTrack: track not found', trackId);
      return;
    }

    this.selectedTrackId = trackId;
    this.renderDiagnostic(`[OWT] ⏳ 下載字幕：${track.label}…`);

    try {
      const url = await this.ensureTrackUrl(track);
      if (!url) {
        logger.warn('Track has no downloadable URL', track.label);
        this.renderDiagnostic(`[OWT] ⚠️ ${track.label} 無可用 TTML URL`, true);
        // Still try native translation track
        await this.loadNativeTranslationTrack();
        this.updateSelectorMenuOptions();
        return;
      }

      const xml = await this.fetchTtml(url);
      this.secondaryCues = parseNetflixTtml(xml);
      this.ttmlMatchCount = 0;
      this.ttmlLoadedAt = Date.now();
      logger.info(`Loaded secondary cues: ${this.secondaryCues.length} from ${track.label}`);

      if (this.secondaryCues.length === 0) {
        this.renderDiagnostic(
          `[OWT] ⚠️ 軌道 ${track.label} 解析後 0 條 cue（可能非文字 TTML）`,
          true,
        );
      } else {
        this.renderDiagnostic(
          `[OWT] 🎬 ${track.label} 就緒（${this.secondaryCues.length} cues），時間同步中…`,
        );
      }

      await this.loadNativeTranslationTrack();
      this.updateSelectorMenuOptions();
    } catch (err) {
      logger.error('Failed to load track TTML:', err);
      this.renderDiagnostic(`[OWT] ❌ 下載/解析 ${track.label} 失敗`, true);
    }
  }

  /**
   * Fetch TTML preferentially via MAIN-world (page credentials / no CORS),
   * fall back to content-script fetch with extension host permissions.
   */
  private fetchTtml(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const requestId = `ttml-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const timer = setTimeout(() => {
        this.pendingTtmlRequests.delete(requestId);
        // Fallback: content-script fetch
        void this.fetchTtmlDirect(url).then(resolve).catch(reject);
      }, 4000);

      this.pendingTtmlRequests.set(requestId, { resolve, reject, timer });

      try {
        window.postMessage(
          {
            source: CONTENT_SOURCE,
            type: 'OWT_NETFLIX_FETCH_TTML',
            requestId,
            url,
          },
          '*',
        );
      } catch (err) {
        clearTimeout(timer);
        this.pendingTtmlRequests.delete(requestId);
        void this.fetchTtmlDirect(url).then(resolve).catch(reject);
      }
    });
  }

  private onTtmlResult(data: any) {
    const requestId = data?.requestId;
    if (typeof requestId !== 'string') return;
    const pending = this.pendingTtmlRequests.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingTtmlRequests.delete(requestId);

    if (data.ok && typeof data.xml === 'string') {
      pending.resolve(data.xml);
    } else {
      // Fall back to direct fetch rather than hard-failing immediately.
      const url = typeof data.url === 'string' ? data.url : '';
      if (url) {
        void this.fetchTtmlDirect(url).then(pending.resolve).catch(pending.reject);
      } else {
        pending.reject(new Error(data.error || 'TTML fetch failed'));
      }
    }
  }

  private async fetchTtmlDirect(url: string): Promise<string> {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`TTML HTTP ${response.status}`);
    }
    return response.text();
  }

  private setupMouseMoveInjectionListener() {
    document.addEventListener(
      'mousemove',
      () => {
        const now = Date.now();
        if (now - this.lastMouseMoveTime > 1000) {
          this.lastMouseMoveTime = now;
          if (!this.controlsButton || !this.bodyContains(this.controlsButton)) {
            this.injectControlsButton();
          }
        }
      },
      { passive: true },
    );
  }

  /** Controls bar appears late; poll without blocking the subtitle pipeline. */
  private startControlsPoller() {
    if (this.controlsPollTimer) return;
    this.controlsPollTimer = setInterval(() => {
      if (!document.body) return;
      if (!this.controlsButton || !this.bodyContains(this.controlsButton)) {
        this.injectControlsButton();
      }
    }, 2000);
  }

  private setupNavigationListeners() {
    let lastUrl = window.location.href;
    const handleNavigation = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        const watchMatch = window.location.pathname.match(/\/watch\/(\d+)/);
        const newVideoId = watchMatch ? watchMatch[1] : currentUrl;
        if (newVideoId !== this.currentVideoId) {
          this.currentVideoId = newVideoId;
          this.routeGeneration++;
          this.lastProcessedText = '';
          this.discoveredTracks = [];
          this.secondaryCues = [];
          this.nativeTranslationCues = [];
          this.hasAutoSelected = false;
          this.selectedTrackId = 'ai-translate';
          this.ttmlMatchCount = 0;
          this.ttmlLoadedAt = 0;
          this.clearOverlay();
          this.inlineTranslationCache.clear();
          this.tryAutoStart();
        }
        this.injectControlsButton();
      }
    };
    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('hashchange', handleNavigation);
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
      } catch {
        await this.start('zh-Hant', 'bilingual', 18, 22, '#ffffff', '#818cf8');
      }
    }
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
    const watchMatch = window.location.pathname.match(/\/watch\/(\d+)/);
    this.currentVideoId = watchMatch ? watchMatch[1] : window.location.href;

    this.isActive = true;
    this.whenDomReady(() => {
      document.body?.classList.add('owt-netflix-active');
      this.forensicProbe.start();
      this.injectControlsButton();
    });
    this.updateControlsButtonState();

    this.startObserver();
    this.startSubtitleSync();

    this.renderDiagnostic(
      this.discoveredTracks.length > 0
        ? `[OWT] ✅ 已有 ${this.discoveredTracks.length} 軌，載入中…`
        : this.channelAlive
          ? '[OWT] ⏳ 正在等待 Cadmium 字幕軌…'
          : '[OWT] ⏳ 初始化 MAIN 通道與字幕探測…',
    );

    // If tracks already arrived before start(), select now.
    if (this.discoveredTracks.length > 0) {
      await this.ensureTrackSelectionAndLoad();
    } else {
      setTimeout(() => {
        if (this.isActive && this.discoveredTracks.length === 0) {
          this.renderDiagnostic(
            this.channelAlive
              ? '[OWT] ⚠️ 尚未收到字幕軌。請確認播放器已開始、字幕已開啟，或稍候再試'
              : '[OWT] ⚠️ 未收到 MAIN world 訊息。請重載擴充功能後重整 Netflix 頁面',
            true,
          );
        }
      }, 8000);
    }

    logger.info('NetflixCaptionAdapter started', {
      targetLang,
      displayMode,
      channelAlive: this.channelAlive,
      trackCount: this.discoveredTracks.length,
    });
  }

  stop() {
    this.isActive = false;
    this.stopHeartbeat();
    this.forensicProbe.stop();
    this.stopSubtitleSync();

    for (const [, pending] of this.pendingTtmlRequests) {
      clearTimeout(pending.timer);
    }
    this.pendingTtmlRequests.clear();
    for (const [, pending] of this.pendingResolveRequests) {
      clearTimeout(pending.timer);
    }
    this.pendingResolveRequests.clear();
    this.lastRenderedKey = '';

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.inlineTranslationCache.clear();
    this.lastProcessedText = '';
    this.clearOverlay();
    this.hideSelectorMenu();
    document.body?.classList.remove('owt-netflix-active', 'owt-overlay-showing');

    const nativeContainer = document.querySelector('.player-timedtext') as HTMLElement | null;
    if (nativeContainer) {
      nativeContainer.classList.remove('owt-hide-native');
    }

    this.updateControlsButtonState();
    logger.info('NetflixCaptionAdapter stopped');
  }

  private getOverlay(): HTMLElement {
    let overlay = document.getElementById('owt-netflix-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'owt-netflix-overlay';
      overlay.style.position = 'absolute';
      overlay.style.bottom = '12%';
      overlay.style.left = '50%';
      overlay.style.transform = 'translateX(-50%)';
      overlay.style.zIndex = '2147483647';
      overlay.style.pointerEvents = 'none';
      overlay.style.display = 'flex';
      overlay.style.flexDirection = 'column';
      overlay.style.alignItems = 'center';
      overlay.style.width = '90%';
      overlay.style.maxWidth = '1000px';

      const container =
        document.querySelector('.watch-video') ||
        document.querySelector('[data-uia="watch-video"]') ||
        document.body ||
        document.documentElement;
      container?.appendChild(overlay);
    }
    return overlay;
  }

  private markAndHideNativeSubtitleElements(): void {
    const selectors = [
      '.player-timedtext',
      '[data-uia="player-timedtext"]',
      '[data-uia="watch-video--timed-text"]',
      '.player-timedtext-text-container',
      '[class*="timedtext"]',
      '[class*="TimedText"]',
      '[class*="subtitle"]',
      '[class*="Subtitle"]',
    ];

    const candidates = document.querySelectorAll<HTMLElement>(selectors.join(', '));

    candidates.forEach((element) => {
      if (element.id === 'owt-netflix-overlay' || element.closest('#owt-netflix-overlay')) {
        return;
      }

      const text = element.innerText?.trim();
      const rect = element.getBoundingClientRect();

      if (
        text &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight
      ) {
        element.classList.add('owt-hide-native-subtitle');
        this.nativeSubtitleElements.add(element);
      }
    });
  }

  private restoreNativeSubtitleElements(): void {
    this.nativeSubtitleElements.forEach((element) => {
      element.classList.remove('owt-hide-native-subtitle');
    });

    this.nativeSubtitleElements.clear();
  }

  private clearOverlay() {
    logger.info('[NF] clearOverlay called', {
      lastProcessedText: this.lastProcessedText,
      selectedTrackId: this.selectedTrackId,
      stack: new Error().stack,
    });

    const overlay = document.getElementById('owt-netflix-overlay');
    if (overlay) overlay.innerHTML = '';

    this.lastRenderedKey = '';
    this.restoreNativeSubtitleElements();
    document.body?.classList.remove('owt-overlay-showing');
  }

  /** DOM scrape when AI mode, no TTML, or TTML timing never matched. */
  private shouldUseDomFallback(): boolean {
    if (this.selectedTrackId === 'ai-translate') return true;
    if (this.secondaryCues.length === 0) return true;

    const video = document.querySelector('video') as HTMLVideoElement | null;
    if (!video) return true;

    const currentMs = Math.round(video.currentTime * 1000);
    if (findCueAt(this.secondaryCues, currentMs)) return false;

    // TTML loaded but never matched → broken timing or wrong track
    if (this.ttmlMatchCount === 0 && this.ttmlLoadedAt > 0 && Date.now() - this.ttmlLoadedAt > 2500) {
      return true;
    }

    // Between cues in a working TTML stream — don't DOM-scrape
    return false;
  }

  private startObserver() {
    if (this.observer) this.observer.disconnect();

    const targetNode =
      document.querySelector('.watch-video') ||
      document.querySelector('[data-uia="watch-video"]') ||
      (window.location.pathname.includes('/watch/') ? document.body : null);

    if (!targetNode) return;

    // DOM path is fallback when TTML is unavailable or not matching.
    this.observer = new MutationObserver(() => {
      if (this.isActive && this.shouldUseDomFallback()) {
        this.processCaptions();
      }
    });
    this.observer.observe(targetNode, { childList: true, subtree: true, characterData: true });

    if (this.shouldUseDomFallback()) {
      this.processCaptions();
    }
  }

  private getNativeSubtitleTextFromDOM(): string {
    const selectors = [
      '.player-timedtext',
      '[data-uia="player-timedtext"]',
      '[data-uia="watch-video--timed-text"]',
      '.player-timedtext-text-container',
      '[class*="timedtext"]',
    ];

    const elements = document.querySelectorAll<HTMLElement>(selectors.join(', '));

    logger.info('[NF] DOM subtitle probe', {
      selectorCount: elements.length,
      matches: [...elements].map((element) => ({
        tag: element.tagName,
        className: element.className,
        dataUia: element.getAttribute('data-uia'),
        text: element.innerText?.trim().slice(0, 120),
        visible: element.getBoundingClientRect().height > 0,
      })),
    });

    const lines: string[] = [];

    elements.forEach((el) => {
      if (el.id === 'owt-netflix-overlay' || el.closest('#owt-netflix-overlay')) return;
      const txt = el.textContent?.trim();
      if (txt && !lines.includes(txt)) {
        lines.push(txt);
      }
    });

    return lines.join('\n');
  }

  private processCaptions() {
    if (!this.isActive) return;
    if (!this.shouldUseDomFallback()) return;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      const currentNativeText = this.getNativeSubtitleTextFromDOM();

      if (!currentNativeText) {
        if (this.lastProcessedText !== '') {
          this.lastProcessedText = '';
        }
        return;
      }

      this.onNewSubtitleText(currentNativeText);
    }, 120);
  }

  private onNewSubtitleText(text: string) {
    const cleanText = text.replace(/<[^>]*>/g, '').trim();

    logger.info('[NF] DOM fallback subtitle detected', {
      cleanText,
      selectedTrackId: this.selectedTrackId,
    });

    if (!cleanText) {
      this.clearOverlay();
      this.lastProcessedText = '';
      this.lastRenderedKey = '';
      return;
    }

    if (this.lastProcessedText === cleanText) {
      return;
    }
    this.lastProcessedText = cleanText;

    const requestVersion = ++this.translationRequestVersion;
    const video = document.querySelector('video') as HTMLVideoElement | null;
    const currentMs = video ? Math.round(video.currentTime * 1000) : 0;
    void this.translateAndRender(cleanText, currentMs, this.routeGeneration, undefined, requestVersion);
  }

  private renderOverlay(originalText: string, translatedText: string) {
    if (!document.body && !document.documentElement) return;

    const key = `${this.displayMode}|${originalText}||${translatedText}`;
    if (this.lastRenderedKey === key) return;
    this.lastRenderedKey = key;

    const overlay = this.getOverlay();
    // Update text nodes in place when structure matches to reduce layout thrash
    const existing = overlay.firstElementChild as HTMLElement | null;
    if (existing && existing.dataset.owtOverlay === '1') {
      // Rebuild is simpler and still cheap without backdrop-filter
    }

    overlay.innerHTML = '';

    const container = document.createElement('div');
    container.dataset.owtOverlay = '1';
    container.style.display = 'inline-flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.backgroundColor = 'rgba(8, 8, 8, 0.88)';
    container.style.padding = '10px 20px';
    container.style.borderRadius = '8px';
    container.style.pointerEvents = 'none';
    container.style.textAlign = 'center';
    container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.55)';
    // No backdrop-filter — expensive over <video> and causes stutter.

    const origLines = originalText.split('\n').filter(Boolean);
    const transLines = translatedText.split('\n').filter(Boolean);

    const origFontSize = `${this.subtitleOriginalFontSize}px`;
    const transFontSize = `${this.subtitleTranslatedFontSize}px`;
    const origColor = this.subtitleOriginalColor || '#ffffff';
    const transColor = this.subtitleTranslatedColor || '#818cf8';

    const createSpan = (text: string, color: string, isBold = false, fontSize = '20px') => {
      const span = document.createElement('span');
      span.style.display = 'block';
      span.style.color = color;
      span.style.fontWeight = isBold ? '700' : '500';
      span.style.fontSize = fontSize;
      span.style.lineHeight = '1.4';
      span.style.margin = '2px 0';
      span.style.textShadow = '0 2px 4px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)';
      span.textContent = text;
      return span;
    };

    if (this.displayMode === 'immersive') {
      transLines.forEach((line) => container.appendChild(createSpan(line, transColor, true, transFontSize)));
    } else if (this.displayMode === 'translation-first') {
      transLines.forEach((line) => container.appendChild(createSpan(line, transColor, true, transFontSize)));
      origLines.forEach((line) => container.appendChild(createSpan(line, origColor, false, origFontSize)));
    } else {
      origLines.forEach((line) => container.appendChild(createSpan(line, origColor, false, origFontSize)));
      transLines.forEach((line) => container.appendChild(createSpan(line, transColor, true, transFontSize)));
    }

    overlay.appendChild(container);

    this.markAndHideNativeSubtitleElements();
    document.body?.classList.add('owt-overlay-showing');

    requestAnimationFrame(() => {
      const renderedOverlay = document.getElementById('owt-netflix-overlay') as HTMLElement | null;
      const rect = renderedOverlay?.getBoundingClientRect();

      logger.info('[NF] overlay DOM verification', {
        exists: Boolean(renderedOverlay),
        childCount: renderedOverlay?.childElementCount ?? 0,
        text: renderedOverlay?.innerText ?? '',
        parent: renderedOverlay?.parentElement?.className ?? '',
        rect: rect
          ? {
              top: Math.round(rect.top),
              bottom: Math.round(rect.bottom),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            }
          : null,
        visible:
          Boolean(rect) &&
          (rect?.width ?? 0) > 0 &&
          (rect?.height ?? 0) > 0 &&
          (rect?.bottom ?? 0) > 0 &&
          (rect?.top ?? window.innerHeight) < window.innerHeight,
      });
    });
  }

  private injectControlsButton() {
    if (!document.body) return;

    let button = document.querySelector('.owt-netflix-toggle-btn') as HTMLButtonElement | null;
    if (button && this.bodyContains(button)) {
      this.controlsButton = button;
      this.updateControlsButtonState();
      return;
    }

    const audioSubBtn =
      document.querySelector('[data-uia="control-audio-subtitle"]') ||
      document.querySelector('[data-uia="player-audio-subtitle-button"]') ||
      document.querySelector('[aria-label*="Audio"]') ||
      document.querySelector('[aria-label*="Subtitle"]') ||
      document.querySelector('[aria-label*="音訊"]') ||
      document.querySelector('[aria-label*="字幕"]');

    const rightControls =
      document.querySelector('.player-controls .right-controls') ||
      document.querySelector('.watch-video--bottom-controls .controls') ||
      document.querySelector('[data-uia="controls-standard"]') ||
      document.querySelector('[data-uia="player-controls"]') ||
      document.querySelector('.player-controls');
    
    if (!audioSubBtn && !rightControls) {
      // Do not fallback to generic player container to prevent top-left jumping
      return;
    }

    button = document.createElement('button');
    button.className = 'owt-netflix-toggle-btn';
    button.setAttribute('aria-label', 'OWT 雙語字幕');
    button.setAttribute('title', 'OWT 雙語字幕 (左鍵開關 / 右鍵副字幕選單)');
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
    button.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
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

    try {
      if (audioSubBtn) {
        const wrapper = audioSubBtn.closest('div');
        const parent = wrapper?.parentElement || audioSubBtn.parentElement;
        if (parent) {
          parent.insertBefore(button, wrapper || audioSubBtn);
        } else if (rightControls) {
          rightControls.prepend(button);
        }
      } else if (rightControls) {
        rightControls.prepend(button);
      }
    } catch (err) {
      // UI injection failure must never break the subtitle pipeline.
      logger.warn('Controls button inject failed (will retry)', err);
      return;
    }

    this.controlsButton = button;
    this.updateControlsButtonState();
  }

  private toggleSelectorMenu() {
    if (!this.isActive) {
      void this.handleToggleClick();
    }
    if (this.selectorMenu && this.selectorMenu.style.display === 'block') {
      this.hideSelectorMenu();
    } else {
      this.showSelectorMenu();
    }
  }

  private showSelectorMenu() {
    if (!document.body) return;

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

      const playerControls =
        document.querySelector('.player-controls') || document.body || document.documentElement;
      playerControls?.appendChild(menu);
    }

    this.selectorMenu = menu;
    this.updateSelectorMenuOptions();
    menu.style.display = 'block';
  }

  private hideSelectorMenu() {
    if (this.selectorMenu) {
      this.selectorMenu.style.display = 'none';
    }
  }

  private updateSelectorMenuOptions() {
    if (!this.selectorMenu) return;

    const channelHint = this.channelAlive ? '通道 OK' : '通道等待中';
    const withUrl = this.discoveredTracks.filter((t) => !!t.url).length;
    const nativeReady = this.nativeTranslationCues.length > 0;
    this.selectorMenu.innerHTML = `
      <div style="font-weight: 700; font-size: 14px; margin-bottom: 8px; color: #a855f7; display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span>🌐 OWT 副字幕選單</span>
          <span style="font-size: 11px; font-weight: 400; opacity: 0.7;">${this.discoveredTracks.length} 軌 (${withUrl} URL) · ${channelHint}</span>
        </div>
        <div style="font-size: 11px; font-weight: 400; opacity: 0.75;">
          譯文優先：${nativeReady ? `原生 ${this.nativeTranslationCues.length} cues` : '尚無原生譯文'} → AI → Google → 原文
        </div>
      </div>
      <div id="owt-track-list" style="max-height: 250px; overflow-y: auto;"></div>
    `;

    const listContainer = this.selectorMenu.querySelector('#owt-track-list') as HTMLElement;
    if (!listContainer) return;

    const aiItem = document.createElement('div');
    aiItem.style.padding = '8px 10px';
    aiItem.style.margin = '4px 0';
    aiItem.style.borderRadius = '4px';
    aiItem.style.cursor = 'pointer';
    aiItem.style.backgroundColor =
      this.selectedTrackId === 'ai-translate' ? 'rgba(168, 85, 247, 0.3)' : 'transparent';
    aiItem.style.color = this.selectedTrackId === 'ai-translate' ? '#c084fc' : 'white';
    aiItem.textContent = '✨ 自動 AI / 機器翻譯 (DOM fallback)';
    aiItem.onclick = () => {
      this.selectedTrackId = 'ai-translate';
      this.secondaryCues = [];
      this.updateSelectorMenuOptions();
      this.processCaptions();
    };
    listContainer.appendChild(aiItem);

    if (this.discoveredTracks.length > 0) {
      const divider = document.createElement('div');
      divider.style.height = '1px';
      divider.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
      divider.style.margin = '6px 0';
      listContainer.appendChild(divider);

      this.discoveredTracks.forEach((track) => {
        const isTargetLangTrack = trackMatchesTargetLanguage(track, this.targetLang);
        const item = document.createElement('div');
        item.style.padding = '8px 10px';
        item.style.margin = '4px 0';
        item.style.borderRadius = '4px';
        item.style.cursor = 'pointer';
        item.style.backgroundColor =
          this.selectedTrackId === track.id ? 'rgba(168, 85, 247, 0.3)' : 'transparent';
        item.style.color = this.selectedTrackId === track.id ? '#c084fc' : 'white';
        item.textContent = `🎬 ${track.label} ${track.isCC ? '(CC)' : ''}${
          isTargetLangTrack ? ' · (原生譯文對照軌)' : ''
        }`;
        item.onclick = async () => {
          if (isTargetLangTrack) {
            this.renderDiagnostic(
              `[OWT] 💡 提示：${track.label} 是目標語，已自動做為原生譯文對照。請點選「ja (日文)」等原文軌做為來源字幕。`,
              true,
            );
          }
          this.hasAutoSelected = true;
          item.textContent = `⏳ 正在下載 ${track.label}...`;
          await this.selectTrack(track.id);
          this.updateSelectorMenuOptions();
        };
        listContainer.appendChild(item);
      });
    } else {
      const empty = document.createElement('div');
      empty.style.padding = '8px 10px';
      empty.style.opacity = '0.7';
      empty.style.fontSize = '12px';
      empty.textContent = this.channelAlive
        ? '尚無字幕軌（Cadmium 仍在輪詢）'
        : 'MAIN 通道未就緒';
      listContainer.appendChild(empty);
    }
  }

  private updateControlsButtonState() {
    if (!this.controlsButton) return;
    if (this.isActive) {
      this.controlsButton.style.color = '#a855f7';
      this.controlsButton.style.opacity = '1';
      this.controlsButton.style.textShadow = '0 0 8px rgba(168, 85, 247, 0.6)';
    } else {
      this.controlsButton.style.color = 'white';
      this.controlsButton.style.opacity = '0.8';
      this.controlsButton.style.textShadow = 'none';
    }
  }

  private setupSettingsListener() {
    messageRouter.sendMessage({ type: 'GET_SETTINGS' }).then((settings) => {
      if (settings?.targetLanguage) this.targetLang = settings.targetLanguage;
      if (settings?.displayMode) this.displayMode = settings.displayMode;
      if (settings?.subtitleOriginalFontSize)
        this.subtitleOriginalFontSize = settings.subtitleOriginalFontSize;
      if (settings?.subtitleTranslatedFontSize)
        this.subtitleTranslatedFontSize = settings.subtitleTranslatedFontSize;
      if (settings?.subtitleOriginalColor) this.subtitleOriginalColor = settings.subtitleOriginalColor;
      if (settings?.subtitleTranslatedColor)
        this.subtitleTranslatedColor = settings.subtitleTranslatedColor;
    });
  }

  private startSubtitleSync() {
    this.stopSubtitleSync();
    this.syncTimer = setInterval(() => {
      this.updateSubtitleSync();
    }, 50);
  }

  private stopSubtitleSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Primary subtitle pipeline: TTML cues × video.currentTime → overlay.
   * Does NOT depend on Netflix DOM text or HTML5 textTracks.
   */
  private updateSubtitleSync() {
    if (!this.isActive) return;
    if (this.selectedTrackId === 'ai-translate' || this.secondaryCues.length === 0) return;

    const video = document.querySelector('video') as HTMLVideoElement | null;
    if (!video) return;

    const currentMs = Math.round(video.currentTime * 1000);
    const activeCue = findCueAt(this.secondaryCues, currentMs);

    if (!activeCue) {
      const elapsed = Date.now() - this.lastCueRenderTs;
      if (this.lastProcessedText !== '' && elapsed > this.clearGraceMs) {
        logger.info('[NF] cue gap confirmed; clearing overlay', {
          currentMs,
          elapsed,
        });
        this.clearOverlay();
        this.lastProcessedText = '';
      }
      if (this.shouldUseDomFallback()) {
        this.processCaptions();
      }
      return;
    }

    this.ttmlMatchCount += 1;
    this.lastCueRenderTs = Date.now();

    const text = activeCue.text;
    if (this.lastProcessedText === text) return;

    this.lastProcessedText = text;
    const requestVersion = ++this.translationRequestVersion;
    void this.translateAndRender(text, currentMs, this.routeGeneration, activeCue, requestVersion);
  }

  /**
   * Fallback chain (required product order):
   *   1. 原生譯文 (Netflix target-language TTML)
   *   2. AI 譯文 (configured provider)
   *   3. Google 翻譯
   *   4. 原生原文 (show original only)
   */
  private async translateAndRender(
    originalText: string,
    currentMs: number,
    generation: number,
    sourceCue?: SubtitleCue,
    requestVersion?: number,
  ) {
    logger.info('[NF] translateAndRender start', {
      originalText,
      currentMs,
      generation,
      selectedTrackId: this.selectedTrackId,
      displayMode: this.displayMode,
      hasNativeTranslation: this.nativeTranslationCues.length > 0,
    });

    // Priority 1: Native professional human translation track
    if (this.nativeTranslationCues.length > 0) {
      let nativeCue = findCueAt(this.nativeTranslationCues, currentMs);
      
      if (!nativeCue && sourceCue) {
        nativeCue = this.nativeTranslationCues.find(c => c.startMs < sourceCue.endMs && c.endMs > sourceCue.startMs);
      }

      if (nativeCue?.text) {
        if (
          !this.isActive ||
          this.routeGeneration !== generation ||
          (requestVersion !== undefined && requestVersion !== this.translationRequestVersion)
        ) {
          return;
        }
        logger.info('[NF] render overlay (native TTML)', {
          originalText,
          translatedText: nativeCue.text,
          overlayExists: Boolean(document.getElementById('owt-netflix-overlay')),
        });
        this.renderOverlay(originalText, nativeCue.text);
        return;
      }
    }

    const fingerprint = `${this.currentVideoId}|${originalText}|${this.targetLang}|${this.displayMode}`;
    const cached = this.inlineTranslationCache.get(fingerprint);
    if (cached) {
      if (
        !this.isActive ||
        this.routeGeneration !== generation ||
        (requestVersion !== undefined && requestVersion !== this.translationRequestVersion)
      ) {
        return;
      }
      logger.info('[NF] render overlay (cache)', {
        originalText,
        translatedText: cached,
        overlayExists: Boolean(document.getElementById('owt-netflix-overlay')),
      });
      this.renderOverlay(originalText, cached);
      return;
    }

    // Priority 2: AI / configured provider
    try {
      logger.info('[NF] sending TRANSLATE_REQUEST', {
        originalText,
        targetLang: this.targetLang,
      });

      const response = await messageRouter.sendMessage({
        type: 'TRANSLATE_REQUEST',
        segments: [{ id: 'nf-overlay', text: originalText }],
        sourceLanguage: 'auto',
        targetLanguage: this.targetLang,
      });

      const translatedText = response?.segments?.[0]?.translatedText;
      logger.info('[NF] response received', {
        originalText,
        translatedText,
        active: this.isActive,
        generation,
        currentGeneration: this.routeGeneration,
      });

      if (
        this.isActive &&
        this.routeGeneration === generation &&
        (requestVersion === undefined || requestVersion === this.translationRequestVersion)
      ) {
        if (translatedText) {
          this.inlineTranslationCache.set(fingerprint, translatedText);
          logger.info('[NF] render overlay (AI)', {
            originalText,
            translatedText,
            overlayExists: Boolean(document.getElementById('owt-netflix-overlay')),
          });
          this.renderOverlay(originalText, translatedText);
          return;
        }
      }
    } catch (err) {
      logger.warn('AI translation failed, falling back to Google Translate:', err);
    }

    // Priority 3: Google fallback
    try {
      const response = await messageRouter.sendMessage({
        type: 'TRANSLATE_REQUEST',
        forceProvider: 'google-provider',
        segments: [{ id: 'nf-overlay', text: originalText }],
        sourceLanguage: 'auto',
        targetLanguage: this.targetLang,
      });

      const translatedText = response?.segments?.[0]?.translatedText;
      if (
        this.isActive &&
        this.routeGeneration === generation &&
        (requestVersion === undefined || requestVersion === this.translationRequestVersion)
      ) {
        if (translatedText) {
          this.inlineTranslationCache.set(fingerprint, translatedText);
          logger.info('[NF] render overlay (Google fallback)', {
            originalText,
            translatedText,
            overlayExists: Boolean(document.getElementById('owt-netflix-overlay')),
          });
          this.renderOverlay(originalText, translatedText);
          return;
        }
      }
    } catch (err) {
      logger.error('Google Translate fallback failed:', err);
    }

    if (
      this.isActive &&
      this.routeGeneration === generation &&
      (requestVersion === undefined || requestVersion === this.translationRequestVersion)
    ) {
      logger.info('[NF] render overlay (original fallback)', {
        originalText,
        translatedText: originalText,
        overlayExists: Boolean(document.getElementById('owt-netflix-overlay')),
      });
      this.renderOverlay(originalText, originalText);
    }
  }

  private async loadNativeTranslationTrack() {
    if (!this.targetLang || this.discoveredTracks.length === 0) return;

    const candidates = this.discoveredTracks.filter(
      (t) => t.id !== this.selectedTrackId && trackMatchesTargetLanguage(t, this.targetLang),
    );

    if (candidates.length === 0) {
      logger.info('No matching native translation track found for', this.targetLang, {
        available: this.discoveredTracks.map((t) => `${t.language}:${t.label}`),
      });
      return;
    }

    // Prefer Traditional Chinese labels when target is zh-Hant; else first match.
    const target = this.targetLang.toLowerCase();
    const preferHant = target.includes('hant') || target.includes('tw') || target.includes('hk');
    const preferHans = target.includes('hans') || target.includes('cn');

    const scored = [...candidates].sort((a, b) => {
      const score = (t: DiscoveredTrack) => {
        let s = 0;
        const lang = t.language.toLowerCase();
        const label = t.label.toLowerCase();
        if (t.url) s += 5;
        if (preferHant && (lang.includes('hant') || label.includes('繁') || label.includes('台灣') || label.includes('台湾') || label.includes('香港'))) s += 3;
        if (preferHans && (lang.includes('hans') || label.includes('简') || label.includes('簡') || label.includes('大陆') || label.includes('大陸'))) s += 3;
        if (!t.isCC) s += 1; // prefer full dialogue over CC when both exist
        return s;
      };
      return score(b) - score(a);
    });

    const matchingTrack = scored[0];
    const gen = ++this.nativeLoadGeneration;

    logger.info(
      `Loading native translation track: ${matchingTrack.label} (${matchingTrack.language})`,
    );

    try {
      const url = await this.ensureTrackUrl(matchingTrack);
      if (!url) {
        logger.warn('Native translation track has no URL', matchingTrack.label);
        return;
      }
      if (gen !== this.nativeLoadGeneration) return;

      const xml = await this.fetchTtml(url);
      if (gen !== this.nativeLoadGeneration) return;

      this.nativeTranslationCues = parseNetflixTtml(xml);
      logger.info('Parsed native translation cues:', this.nativeTranslationCues.length, {
        track: matchingTrack.label,
      });
      this.updateSelectorMenuOptions();

      // Force immediate re-render so user sees native 譯文 without waiting for next cue.
      this.lastProcessedText = '';
      this.lastRenderedKey = '';
      if (this.secondaryCues.length > 0) {
        this.updateSubtitleSync();
      } else {
        this.processCaptions();
      }
    } catch (err) {
      logger.error('Failed to load native translation track:', err);
    }
  }

  private async tryAutoStart() {
    if (this.isActive) return;
    if (!window.location.pathname.includes('/watch/')) return;

    try {
      const settings = await messageRouter.sendMessage({ type: 'GET_SETTINGS' }).catch(() => null);
      const targetLang = settings?.targetLanguage || 'zh-Hant';
      const displayMode = settings?.displayMode || 'bilingual';
      const origSize = settings?.subtitleOriginalFontSize || 18;
      const transSize = settings?.subtitleTranslatedFontSize || 22;
      const origColor = settings?.subtitleOriginalColor || '#ffffff';
      const transColor = settings?.subtitleTranslatedColor || '#818cf8';
      await this.start(targetLang, displayMode, origSize, transSize, origColor, transColor);
    } catch {
      await this.start('zh-Hant', 'bilingual', 18, 22, '#ffffff', '#818cf8');
    }
  }

  private renderDiagnostic(message: string, isError = false) {
    if (!isError) return; // Only show errors to users in production
    if (!this.isActive) return;
    if (!document.body && !document.documentElement) return;

    try {
      const overlay = this.getOverlay();
      overlay.innerHTML = '';

      const container = document.createElement('div');
      container.style.display = 'inline-flex';
      container.style.flexDirection = 'column';
      container.style.alignItems = 'center';
      container.style.backgroundColor = isError ? 'rgba(185, 28, 28, 0.9)' : 'rgba(30, 41, 59, 0.9)';
      container.style.padding = '8px 16px';
      container.style.borderRadius = '6px';
      container.style.border = isError ? '1px solid #ef4444' : '1px solid #3b82f6';
      container.style.pointerEvents = 'auto';
      container.style.textAlign = 'center';
      container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
      container.style.backdropFilter = 'blur(4px)';

      const span = document.createElement('span');
      span.style.display = 'block';
      span.style.color = '#ffffff';
      span.style.fontWeight = '600';
      span.style.fontSize = '14px';
      span.style.lineHeight = '1.4';
      span.style.margin = '0';
      span.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';
      span.textContent = message;

      container.appendChild(span);
      overlay.appendChild(container);
    } catch (err) {
      logger.warn('renderDiagnostic failed', err);
    }
  }
}

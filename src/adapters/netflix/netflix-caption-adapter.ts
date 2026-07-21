import { messageRouter } from '@/infrastructure/messaging/message-router';
import { parseNetflixTtml, SubtitleCue } from '@/shared/subtitles/ttml-parser';
import { createLogger } from '@/shared/logger';
import { NetflixForensicProbe } from './netflix-forensic-probe';

const logger = createLogger('NetflixCaptionAdapter');

interface DiscoveredTrack {
  id: string;
  label: string;
  language: string;
  url: string;
  isCC: boolean;
}

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
  private forensicProbe = new NetflixForensicProbe();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private nativeTranslationCues: SubtitleCue[] = [];
  private hasAutoSelected = false;
  private networkTrackPollerTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {}

  public init() {
    if (typeof window !== 'undefined' && window.location?.hostname?.includes('netflix.com')) {
      logger.info('Initializing NetflixCaptionAdapter on netflix.com');
      this.forensicProbe.start();
      this.setupNavigationListeners();
      this.setupSettingsListener();
      this.setupMouseMoveInjectionListener();
      this.setupMainWorldMessageListener();

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          this.injectControlsButton();
          this.tryAutoStart();
        }, { once: true });
      } else {
        this.injectControlsButton();
        this.tryAutoStart();
      }
    }
  }

  private setupMainWorldMessageListener() {
    window.addEventListener('message', async (event) => {
      if (event.data?.type === 'OWT_NETFLIX_TRACKS_DISCOVERED' && Array.isArray(event.data.tracks)) {
        this.discoveredTracks = event.data.tracks;

        if (this.selectedTrackId === 'ai-translate' && this.discoveredTracks.length > 0 && !this.hasAutoSelected) {
          this.hasAutoSelected = true;
          const defaultTrack = this.discoveredTracks.find(t =>
            t.language.toLowerCase().startsWith('en') ||
            t.label.toLowerCase().includes('english')
          ) || this.discoveredTracks[0];

          if (defaultTrack) {
            logger.info(`Auto-selecting default secondary track: ${defaultTrack.label}`);
            this.selectedTrackId = defaultTrack.id;
            try {
              const xml = await fetch(defaultTrack.url).then(res => res.text());
              this.secondaryCues = parseNetflixTtml(xml);
              logger.info(`Auto-loaded secondary cues: ${this.secondaryCues.length}`);
            } catch (err) {
              logger.error('Failed to auto-load secondary track TTML:', err);
            }
          }
        }

        this.updateSelectorMenuOptions();
        await this.loadNativeTranslationTrack();
        this.processCaptions();
      }
    });
  }

  private setupMouseMoveInjectionListener() {
    document.addEventListener('mousemove', () => {
      const now = Date.now();
      if (now - this.lastMouseMoveTime > 1000) {
        this.lastMouseMoveTime = now;
        if (!this.controlsButton || !document.body.contains(this.controlsButton)) {
          this.injectControlsButton();
        }
      }
    }, { passive: true });
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
          this.clearOverlay();
          this.inlineTranslationCache.clear();

          const win = (window as any).wrappedJSObject;
          if (win && win._owtDiscoveredTracks) {
            try {
              win._owtDiscoveredTracks.length = 0;
            } catch (e) {}
          }

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
      } catch (e) {
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
    transColor = '#818cf8'
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
    this.forensicProbe.start();
    document.body?.classList.add('owt-netflix-active');
    this.updateControlsButtonState();
    this.injectControlsButton();

    this.startObserver();
    this.startSubtitleSync();
    this.startNetworkTrackPoller();

    // Immediately show status to indicate rendering works and we are loading tracks
    this.renderDiagnostic('[OWT] ⏳ 正在尋找/初始化字幕軌...');
    setTimeout(() => {
      if (this.isActive && this.discoveredTracks.length === 0) {
        this.renderDiagnostic('[OWT] ⚠️ 未偵測到字幕軌。請確認影片字幕已開啟，或點選右鍵開啟選單/重整', true);
      }
    }, 6000);

    logger.info('NetflixCaptionAdapter started', { targetLang, displayMode });
  }

  stop() {
    this.isActive = false;
    this.forensicProbe.stop();
    this.stopSubtitleSync();
    this.stopNetworkTrackPoller();
    const win = (window as any).wrappedJSObject;
    if (win && win._owtDiscoveredTracks) {
      try {
        win._owtDiscoveredTracks.length = 0;
      } catch (e) {}
    }
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
    document.body.classList.remove('owt-netflix-active');
    
    // Restore native subtitles visibility
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
      
      const container = document.querySelector('.watch-video') || document.querySelector('[data-uia="watch-video"]') || document.body;
      container.appendChild(overlay);
    }
    return overlay;
  }

  private clearOverlay() {
    const overlay = document.getElementById('owt-netflix-overlay');
    if (overlay) overlay.innerHTML = '';
  }

  private startObserver() {
    if (this.observer) this.observer.disconnect();

    const targetNode =
      document.querySelector('.watch-video') ||
      document.querySelector('[data-uia="watch-video"]') ||
      (window.location.pathname.includes('/watch/') ? document.body : null);

    if (!targetNode) return;

    this.observer = new MutationObserver(() => {
      if (this.isActive) this.processCaptions();
    });
    this.observer.observe(targetNode, { childList: true, subtree: true, characterData: true });

    this.processCaptions();
  }

  private getNativeSubtitleTextFromDOM(): string {
    const selectors = [
      '.player-timedtext',
      '[data-uia="player-timedtext"]',
      '[data-uia="watch-video--timed-text"]',
      '.player-timedtext-text-container',
      '[class*="timedtext"]'
    ];

    const elements = document.querySelectorAll(selectors.join(', '));
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

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      const currentNativeText = this.getNativeSubtitleTextFromDOM();
      
      if (!currentNativeText) {
        if (this.lastProcessedText !== '') {
          this.lastProcessedText = '';
          this.clearOverlay();
        }
        return;
      }

      this.onNewSubtitleText(currentNativeText);
    }, 120);
  }

  private onNewSubtitleText(text: string) {
    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    if (!cleanText) {
      this.clearOverlay();
      this.lastProcessedText = '';
      return;
    }

    if (this.lastProcessedText === cleanText) {
      return; 
    }
    this.lastProcessedText = cleanText;

    if (this.selectedTrackId !== 'ai-translate' && this.secondaryCues.length > 0) {
      this.renderSecondaryCueForTime(cleanText);
    } else {
      this.fetchAndRenderOverlay(cleanText, this.routeGeneration);
    }
  }

  private renderSecondaryCueForTime(primaryText: string) {
    const video = document.querySelector('video') as HTMLVideoElement | null;
    const currentMs = video ? Math.round(video.currentTime * 1000) : 0;
    
    const activeCue = this.secondaryCues.find(c => currentMs >= c.startMs && currentMs <= c.endMs);
    const secondaryText = activeCue ? activeCue.text : '...';
    
    this.renderOverlay(primaryText, secondaryText);
  }

  private async fetchAndRenderOverlay(text: string, generation: number) {
    const fingerprint = `${this.currentVideoId}|${text}|${this.targetLang}|${this.displayMode}`;
    const cached = this.inlineTranslationCache.get(fingerprint);
    if (cached) {
       this.renderOverlay(text, cached);
       return;
    }

    try {
      const response = await messageRouter.sendMessage({
        type: 'TRANSLATE_REQUEST',
        segments: [{ id: 'nf-overlay', text }],
        sourceLanguage: 'auto',
        targetLanguage: this.targetLang,
      });

      if (!this.isActive || this.routeGeneration !== generation) {
        return;
      }

      const translatedText = response?.segments?.[0]?.translatedText;
      if (!translatedText) {
        return;
      }

      this.inlineTranslationCache.set(fingerprint, translatedText);
      this.renderOverlay(text, translatedText);
    } catch (err: any) {
      logger.error('Overlay translation failed', err);
    }
  }

  private renderOverlay(originalText: string, translatedText: string) {
    const overlay = this.getOverlay();
    overlay.innerHTML = '';

    const container = document.createElement('div');
    container.style.display = 'inline-flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.backgroundColor = 'rgba(8, 8, 8, 0.88)';
    container.style.padding = '10px 20px';
    container.style.borderRadius = '8px';
    container.style.pointerEvents = 'auto';
    container.style.textAlign = 'center';
    container.style.boxShadow = '0 4px 16px rgba(0,0,0,0.6)';
    container.style.backdropFilter = 'blur(4px)';

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
      transLines.forEach(line => container.appendChild(createSpan(line, transColor, true, transFontSize)));
    } else if (this.displayMode === 'translation-first') {
      transLines.forEach(line => container.appendChild(createSpan(line, transColor, true, transFontSize)));
      origLines.forEach(line => container.appendChild(createSpan(line, origColor, false, origFontSize)));
    } else {
      origLines.forEach(line => container.appendChild(createSpan(line, origColor, false, origFontSize)));
      transLines.forEach(line => container.appendChild(createSpan(line, transColor, true, transFontSize)));
    }

    overlay.appendChild(container);
  }

  private injectControlsButton() {
    let button = document.querySelector('.owt-netflix-toggle-btn') as HTMLButtonElement | null;
    if (button && document.body.contains(button)) {
      this.controlsButton = button;
      this.updateControlsButtonState();
      return;
    }

    const audioSubBtn = document.querySelector('[data-uia="control-audio-subtitle"]');
    const audioSubWrapper = audioSubBtn?.closest('div') || audioSubBtn;

    const rightGroup =
      audioSubWrapper?.parentElement ||
      document.querySelector('.player-controls .right-controls') ||
      document.querySelector('.player-controls');
    if (!rightGroup) return;

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

    if (audioSubWrapper && audioSubWrapper.parentNode) {
      audioSubWrapper.parentNode.insertBefore(button, audioSubWrapper);
    } else {
      rightGroup.prepend(button);
    }

    this.controlsButton = button;
    this.updateControlsButtonState();
  }

  private toggleSelectorMenu() {
    if (!this.isActive) {
      this.handleToggleClick();
    }
    if (this.selectorMenu && this.selectorMenu.style.display === 'block') {
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

      const playerControls = document.querySelector('.player-controls') || document.body;
      playerControls.appendChild(menu);
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

    this.selectorMenu.innerHTML = `
      <div style="font-weight: 700; font-size: 14px; margin-bottom: 8px; color: #a855f7; display: flex; align-items: center; justify-content: space-between;">
        <span>🌐 OWT 副字幕選單</span>
        <span style="font-size: 11px; font-weight: 400; opacity: 0.7;">${this.discoveredTracks.length} 軌可用</span>
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
    aiItem.style.backgroundColor = this.selectedTrackId === 'ai-translate' ? 'rgba(168, 85, 247, 0.3)' : 'transparent';
    aiItem.style.color = this.selectedTrackId === 'ai-translate' ? '#c084fc' : 'white';
    aiItem.textContent = '✨ 自動 AI / 機器翻譯 (Google / DeepL / Gemini)';
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
        const item = document.createElement('div');
        item.style.padding = '8px 10px';
        item.style.margin = '4px 0';
        item.style.borderRadius = '4px';
        item.style.cursor = 'pointer';
        item.style.backgroundColor = this.selectedTrackId === track.id ? 'rgba(168, 85, 247, 0.3)' : 'transparent';
        item.style.color = this.selectedTrackId === track.id ? '#c084fc' : 'white';
        item.textContent = `🎬 原生副字幕：${track.label} ${track.isCC ? '(CC)' : ''}`;
        item.onclick = async () => {
          this.selectedTrackId = track.id;
          item.textContent = `⏳ 正在下載 ${track.label}...`;
          try {
            const xml = await fetch(track.url).then(res => res.text());
            this.secondaryCues = parseNetflixTtml(xml);
            logger.info('Parsed secondary Netflix TTML cues:', this.secondaryCues.length);
            await this.loadNativeTranslationTrack();
          } catch (err) {
            logger.error('Failed to fetch secondary track TTML:', err);
          }
          this.updateSelectorMenuOptions();
          this.processCaptions();
        };
        listContainer.appendChild(item);
      });
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
      if (settings?.subtitleOriginalFontSize) this.subtitleOriginalFontSize = settings.subtitleOriginalFontSize;
      if (settings?.subtitleTranslatedFontSize) this.subtitleTranslatedFontSize = settings.subtitleTranslatedFontSize;
      if (settings?.subtitleOriginalColor) this.subtitleOriginalColor = settings.subtitleOriginalColor;
      if (settings?.subtitleTranslatedColor) this.subtitleTranslatedColor = settings.subtitleTranslatedColor;
    });
  }

  private startSubtitleSync() {
    this.stopSubtitleSync();
    this.syncTimer = setInterval(() => {
      this.updateSubtitleSync();
    }, 100);
  }

  private stopSubtitleSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private updateSubtitleSync() {
    if (!this.isActive) return;

    if (this.selectedTrackId === 'ai-translate') {
      // AI translation relies on MutationObserver to hook text from DOM
      return;
    }

    const video = document.querySelector('video') as HTMLVideoElement | null;
    if (!video) {
      this.clearOverlay();
      return;
    }

    // Hide native subtitles if OWT is active
    const nativeContainer = document.querySelector('.player-timedtext') as HTMLElement | null;
    if (nativeContainer && !nativeContainer.classList.contains('owt-hide-native')) {
      nativeContainer.classList.add('owt-hide-native');
    }

    // Loaded track mode (such as English text track loaded for Chinese image main track)
    const currentMs = Math.round(video.currentTime * 1000);
    const activeCue = this.secondaryCues.find(
      (c) => currentMs >= c.startMs && currentMs <= c.endMs,
    );

    if (!activeCue) {
      this.clearOverlay();
      this.lastProcessedText = '';
      return;
    }

    const text = activeCue.text;
    if (this.lastProcessedText === text) {
      return;
    }

    this.lastProcessedText = text;
    this.translateAndRender(text, currentMs, this.routeGeneration);
  }

  private async translateAndRender(originalText: string, currentMs: number, generation: number) {
    // Priority 1: Native professional human translation (原生譯文)
    if (this.nativeTranslationCues.length > 0) {
      const nativeCue = this.nativeTranslationCues.find(
        (c) => currentMs >= c.startMs && currentMs <= c.endMs,
      );
      if (nativeCue?.text) {
        this.renderOverlay(originalText, nativeCue.text);
        return;
      }
    }

    // Check inline translation cache
    const fingerprint = `${this.currentVideoId}|${originalText}|${this.targetLang}|${this.displayMode}`;
    const cached = this.inlineTranslationCache.get(fingerprint);
    if (cached) {
      this.renderOverlay(originalText, cached);
      return;
    }

    // Priority 2: AI Translation (Gemini/DeepL)
    try {
      const response = await messageRouter.sendMessage({
        type: 'TRANSLATE_REQUEST',
        segments: [{ id: 'nf-overlay', text: originalText }],
        sourceLanguage: 'auto',
        targetLanguage: this.targetLang,
      });

      if (this.isActive && this.routeGeneration === generation) {
        const translatedText = response?.segments?.[0]?.translatedText;
        if (translatedText) {
          this.inlineTranslationCache.set(fingerprint, translatedText);
          this.renderOverlay(originalText, translatedText);
          return;
        }
      }
    } catch (err) {
      logger.warn('AI translation failed, falling back to Google Translate:', err);
    }

    // Priority 3: Google Translation fallback
    try {
      const response = await messageRouter.sendMessage({
        type: 'TRANSLATE_REQUEST',
        forceProvider: 'google-provider',
        segments: [{ id: 'nf-overlay', text: originalText }],
        sourceLanguage: 'auto',
        targetLanguage: this.targetLang,
      });

      if (this.isActive && this.routeGeneration === generation) {
        const translatedText = response?.segments?.[0]?.translatedText;
        if (translatedText) {
          this.inlineTranslationCache.set(fingerprint, translatedText);
          this.renderOverlay(originalText, translatedText);
          return;
        }
      }
    } catch (err) {
      logger.error('Google Translate fallback failed:', err);
    }

    // Priority 4: If all fails, show original text
    this.renderOverlay(originalText, originalText);
  }

  private async loadNativeTranslationTrack() {
    this.nativeTranslationCues = [];
    if (!this.targetLang || this.discoveredTracks.length === 0) return;

    const targetPrefix = this.targetLang.split('-')[0].toLowerCase();
    const matchingTrack = this.discoveredTracks.find((t) => {
      if (t.id === this.selectedTrackId) return false;
      const lang = t.language.toLowerCase().replace('_', '-');
      return lang.startsWith(targetPrefix);
    });

    if (!matchingTrack) {
      logger.info('No matching native translation track found for', this.targetLang);
      return;
    }

    logger.info(`Found native translation track: ${matchingTrack.label} (${matchingTrack.language})`);
    try {
      const xml = await fetch(matchingTrack.url).then((res) => res.text());
      this.nativeTranslationCues = parseNetflixTtml(xml);
      logger.info('Parsed native translation cues:', this.nativeTranslationCues.length);
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
    } catch (e) {
      await this.start('zh-Hant', 'bilingual', 18, 22, '#ffffff', '#818cf8');
    }
  }

  private startNetworkTrackPoller() {
    this.stopNetworkTrackPoller();
    this.networkTrackPollerTimer = setInterval(() => {
      if (!this.isActive) return;
      this.pollNetworkInterceptedTracks();
    }, 1500);
  }

  private stopNetworkTrackPoller() {
    if (this.networkTrackPollerTimer) {
      clearInterval(this.networkTrackPollerTimer);
      this.networkTrackPollerTimer = null;
    }
  }

  private pollNetworkInterceptedTracks() {
    const win = (window as any).wrappedJSObject;
    if (!win || !win._owtDiscoveredTracks) return;

    const len = win._owtDiscoveredTracks.length;
    for (let i = 0; i < len; i++) {
      const t = win._owtDiscoveredTracks[i];
      if (t && typeof t.url === 'string') {
        const url = t.url;
        if (!this.discoveredTracks.some((d) => d.url === url)) {
          const trackId = `net-track-${Math.random().toString(36).substring(2, 11)}`;
          const newTrack: DiscoveredTrack = {
            id: trackId,
            label: 'Analyzing track...',
            language: 'unknown',
            url: url,
            isCC: false,
          };
          this.discoveredTracks.push(newTrack);
          logger.info(`Discovered new network track: ${url}`);
          void this.resolveSingleTrackLanguage(newTrack);
        }
      }
    }
  }

  private async resolveSingleTrackLanguage(track: DiscoveredTrack) {
    try {
      this.renderDiagnostic(`[OWT] ⏳ 已偵測到字幕網址，正在下載與分析語系...`);
      const xml = await fetch(track.url).then((res) => res.text());
      const match = xml.match(/xml:lang="([^"]+)"/) || xml.match(/lang="([^"]+)"/);
      if (match && match[1]) {
        const langCode = match[1];
        track.language = langCode;
        track.label = this.getLanguageLabel(langCode);
        logger.info(`Resolved language for track ${track.id}: ${track.label} (${langCode})`);
        
        this.updateSelectorMenuOptions();

        // Auto-select Chinese track or default secondary track
        if (this.selectedTrackId === 'ai-translate' && !this.hasAutoSelected) {
          if (langCode.toLowerCase().startsWith('en') || track.label.toLowerCase().includes('english')) {
            this.hasAutoSelected = true;
            logger.info(`Auto-selecting default secondary track: ${track.label}`);
            this.selectedTrackId = track.id;
            this.secondaryCues = parseNetflixTtml(xml);
            logger.info(`Auto-loaded secondary cues: ${this.secondaryCues.length}`);
            this.renderDiagnostic(`[OWT] 🎬 字幕軌 [${track.label}] 載入就緒，等待播放時間對齊...`);
            this.updateSelectorMenuOptions();
            this.processCaptions();
          }
        }

        await this.loadNativeTranslationTrack();
      } else {
        track.label = 'Subtitle (unknown language)';
        this.updateSelectorMenuOptions();
      }
    } catch (err) {
      logger.error(`Failed to resolve language for track ${track.url}:`, err);
      track.label = 'Subtitle (failed to load)';
      this.renderDiagnostic(`[OWT] ❌ 下載/解析字幕網址失敗，請開啟原生字幕或重試。`, true);
      this.updateSelectorMenuOptions();
    }
  }

  private getLanguageLabel(code: string): string {
    const map: Record<string, string> = {
      'zh': 'Chinese',
      'zh-Hant': 'Chinese (Traditional)',
      'zh-Hans': 'Chinese (Simplified)',
      'en': 'English',
      'ja': 'Japanese',
      'ko': 'Korean',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'vi': 'Vietnamese',
      'th': 'Thai'
    };
    return map[code] || map[code.split('-')[0]] || `Subtitle (${code})`;
  }

  private renderDiagnostic(message: string, isError = false) {
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
  }
}

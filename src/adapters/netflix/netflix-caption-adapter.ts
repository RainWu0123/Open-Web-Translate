import { messageRouter } from '@/infrastructure/messaging/message-router';
import { parseNetflixTtml, SubtitleCue } from '@/shared/subtitles/ttml-parser';
import { createLogger } from '@/shared/logger';

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

  constructor() {}

  public init() {
    if (typeof window !== 'undefined' && window.location?.hostname?.includes('netflix.com')) {
      logger.info('Initializing NetflixCaptionAdapter on netflix.com');
      this.setupNavigationListeners();
      this.setupSettingsListener();
      this.setupMouseMoveInjectionListener();
      this.setupMainWorldMessageListener();

      this.injectControlsButton();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          this.injectControlsButton();
        }, { once: true });
      }
    }
  }

  private setupMainWorldMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'OWT_NETFLIX_TRACKS_DISCOVERED' && Array.isArray(event.data.tracks)) {
        this.discoveredTracks = event.data.tracks;
        this.updateSelectorMenuOptions();
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
          this.clearOverlay();
          this.inlineTranslationCache.clear();
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
    document.body.classList.add('owt-netflix-active');
    this.updateControlsButtonState();
    this.injectControlsButton();

    this.startObserver();
    logger.info('NetflixCaptionAdapter started', { targetLang, displayMode });
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
    this.lastProcessedText = '';
    this.clearOverlay();
    this.hideSelectorMenu();
    document.body.classList.remove('owt-netflix-active');
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
    let btn = document.querySelector('.owt-netflix-toggle-btn') as HTMLButtonElement | null;
    if (btn && document.body.contains(btn)) {
      this.controlsButton = btn;
      this.updateControlsButtonState();
      return;
    }

    const rightGroup =
      document.querySelector('.player-controls .right-controls') ||
      document.querySelector('[data-uia="control-audio-subtitle"]') ||
      document.querySelector('.player-controls');

    if (!rightGroup) return;

    const firstWrapper =
      rightGroup.querySelector('div') ||
      rightGroup.querySelector('button')?.parentElement ||
      rightGroup.firstElementChild;

    btn = document.createElement('button');
    btn.className = 'owt-netflix-toggle-btn';
    btn.title = 'Open Web Translate (副字幕選單)';
    btn.style.background = 'transparent';
    btn.style.border = 'none';
    btn.style.color = 'white';
    btn.style.cursor = 'pointer';
    btn.style.width = '44px';
    btn.style.height = '44px';
    btn.style.padding = '0';
    btn.style.margin = '0 8px 0 0';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.opacity = '0.8';
    btn.style.transition = 'all 0.2s ease';
    btn.style.zIndex = '9999';
    btn.style.position = 'absolute'; 
    btn.style.right = '100%'; 

    btn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSelectorMenu();
    });

    if (firstWrapper && rightGroup.contains(firstWrapper)) {
      (rightGroup as HTMLElement).style.position = 'relative';
      rightGroup.insertBefore(btn, firstWrapper);
    } else {
      (rightGroup as HTMLElement).style.position = 'relative';
      rightGroup.prepend(btn);
    }

    this.controlsButton = btn;
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
}

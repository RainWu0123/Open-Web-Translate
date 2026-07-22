import { createLogger } from '@/shared/logger';
import { SubtitleToken, globalSubtitleSessionStore, SubtitlePair } from '@/core/session/subtitle-session-store';

const logger = createLogger('NetflixOverlayRenderer');

export interface OverlayStyleConfig {
  origSize: number;
  transSize: number;
  origColor: string;
  transColor: string;
  displayMode: 'bilingual' | 'target-only' | 'source-only';
  bottomPosition: number;
  lineSpacing: number;
}

export class NetflixOverlayRenderer {
  private hostEl: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private containerEl: HTMLElement | null = null;
  private origSubEl: HTMLElement | null = null;
  private transSubEl: HTMLElement | null = null;
  private loadingEl: HTMLElement | null = null;

  private config: OverlayStyleConfig = {
    origSize: 18,
    transSize: 22,
    origColor: '#ffffff',
    transColor: '#818cf8',
    displayMode: 'bilingual',
    bottomPosition: 80,
    lineSpacing: 4,
  };

  private isDragging = false;
  private startY = 0;
  private offsetY = 0;
  private currentPair: SubtitlePair | null = null;

  constructor() {}

  public init(): void {
    this.ensureHostAttached();
    window.addEventListener('fullscreenchange', this.onFullscreenChange);
    window.addEventListener('webkitfullscreenchange', this.onFullscreenChange);
  }

  public destroy(): void {
    window.removeEventListener('fullscreenchange', this.onFullscreenChange);
    window.removeEventListener('webkitfullscreenchange', this.onFullscreenChange);

    this.showNativeSubtitles();

    if (this.hostEl) {
      this.hostEl.remove();
      this.hostEl = null;
      this.shadowRoot = null;
    }
  }

  public setConfig(config: Partial<OverlayStyleConfig>): void {
    this.config = { ...this.config, ...config };
    this.updateStyles();
  }

  private getBestTargetContainer(): HTMLElement {
    return (
      (document.fullscreenElement as HTMLElement) ||
      document.querySelector('[data-uia="watch-video"]') ||
      document.querySelector('.watch-video') ||
      document.querySelector('.player-timedtext')?.parentElement ||
      document.body
    );
  }

  public ensureHostAttached(): void {
    const parent = this.getBestTargetContainer();

    if (!this.hostEl) {
      this.hostEl = document.createElement('div');
      this.hostEl.id = 'owt-netflix-overlay-host';
      this.hostEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
      this.shadowRoot = this.hostEl.attachShadow({ mode: 'open' });
      this.buildShadowDom();
    }

    if (this.hostEl.parentElement !== parent) {
      parent.appendChild(this.hostEl);
      logger.debug('Overlay host re-parented to:', parent.tagName || parent.className);
    }
  }

  private onFullscreenChange = (): void => {
    setTimeout(() => {
      this.ensureHostAttached();
    }, 100);
  };

  private buildShadowDom(): void {
    if (!this.shadowRoot) return;

    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .owt-subtitle-box {
        position: absolute;
        bottom: ${this.config.bottomPosition}px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        pointer-events: auto;
        cursor: grab;
        user-select: none;
        padding: 6px 14px;
        background: rgba(0, 0, 0, 0.65);
        border-radius: 8px;
        backdrop-filter: blur(4px);
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        max-width: 90%;
        transition: opacity 0.15s ease, transform 0.05s ease;
      }
      .owt-subtitle-box:active {
        cursor: grabbing;
      }
      .owt-sub-line {
        margin: ${this.config.lineSpacing}px 0;
        line-height: 1.3;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-weight: 600;
        text-shadow: 0 2px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.8);
        word-break: break-word;
      }
      .owt-sub-orig {
        font-size: 18px;
        color: #ffffff;
      }
      .owt-sub-trans {
        font-size: 22px;
        color: #818cf8;
      }
      .owt-token {
        display: inline-block;
        padding: 0 2px;
        border-radius: 3px;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .owt-token:hover {
        background: rgba(56, 189, 248, 0.35);
        color: #38bdf8;
      }
      .owt-loading {
        font-size: 14px;
        color: #fbbf24;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .hidden {
        display: none !important;
      }
    `;

    this.containerEl = document.createElement('div');
    this.containerEl.className = 'owt-subtitle-box hidden';

    this.transSubEl = document.createElement('div');
    this.transSubEl.className = 'owt-sub-line owt-sub-trans';

    this.origSubEl = document.createElement('div');
    this.origSubEl.className = 'owt-sub-line owt-sub-orig';

    this.loadingEl = document.createElement('div');
    this.loadingEl.className = 'owt-sub-line owt-loading hidden';
    this.loadingEl.innerHTML = '<span>⏳ 正在載入雙語字幕...</span>';

    this.containerEl.appendChild(this.transSubEl);
    this.containerEl.appendChild(this.origSubEl);
    this.containerEl.appendChild(this.loadingEl);

    this.setupDragEvents(this.containerEl);
    this.setupTokenClickDelegation(this.containerEl);

    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(this.containerEl);

    this.updateStyles();
  }

  private setupTokenClickDelegation(el: HTMLElement): void {
    el.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement)?.closest('[data-token-id]') as HTMLElement | null;
      if (!target) return;

      e.stopPropagation();
      const tokenId = target.dataset.tokenId;
      if (!tokenId) return;

      const token = globalSubtitleSessionStore.getTokenById(tokenId);
      if (!token) return;

      // Pause Netflix video player
      const video = document.querySelector('video') as HTMLVideoElement | null;
      if (video && !video.paused) {
        video.pause();
      }

      logger.info('Interactive token clicked:', token.surface);
      window.dispatchEvent(
        new CustomEvent('owt-token-click', {
          detail: { token, pair: this.currentPair },
        }),
      );
    });
  }

  private setupDragEvents(el: HTMLElement): void {
    el.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement)?.closest('[data-token-id]')) return;
      this.isDragging = true;
      this.startY = e.clientY - this.offsetY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.offsetY = e.clientY - this.startY;
      el.style.transform = `translate(-50%, ${this.offsetY}px)`;
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  }

  private updateStyles(): void {
    if (!this.containerEl || !this.origSubEl || !this.transSubEl) return;

    this.containerEl.style.bottom = `${this.config.bottomPosition}px`;

    this.origSubEl.style.fontSize = `${this.config.origSize}px`;
    this.origSubEl.style.color = this.config.origColor;
    this.origSubEl.style.margin = `${this.config.lineSpacing}px 0`;

    this.transSubEl.style.fontSize = `${this.config.transSize}px`;
    this.transSubEl.style.color = this.config.transColor;
    this.transSubEl.style.margin = `${this.config.lineSpacing}px 0`;
  }

  public renderTokenizedLine(container: HTMLElement, text: string, lang: string, cueId: string): void {
    container.innerHTML = '';
    const mockCue = { id: cueId, startMs: 0, endMs: 0, text, lang, source: 'netflix-native' as const };
    const tokens = globalSubtitleSessionStore.getTokensForCue(mockCue);

    if (tokens.length === 0) {
      container.textContent = text;
      return;
    }

    const fragment = document.createDocumentFragment();
    tokens.forEach((token) => {
      const span = document.createElement('span');
      span.className = 'owt-token';
      span.dataset.tokenId = token.id;
      span.textContent = token.surface;
      fragment.appendChild(span);
    });
    container.appendChild(fragment);
  }

  public renderPair(pair: SubtitlePair | null): void {
    this.currentPair = pair;
    if (!pair) {
      this.renderCues('', '');
      return;
    }
    const origText = pair.primary.text;
    const transText = pair.secondary?.text || '';
    this.renderCues(origText, transText, pair.primary.lang, pair.primary.id);
  }

  public renderCues(origText: string, transText: string, lang = 'ja', cueId = `cue_${Date.now()}`): void {
    this.ensureHostAttached();
    if (!this.containerEl || !this.origSubEl || !this.transSubEl || !this.loadingEl) return;

    const hasOrig = Boolean(origText.trim());
    const hasTrans = Boolean(transText.trim());

    if (!hasOrig && !hasTrans) {
      this.containerEl.classList.add('hidden');
      this.showNativeSubtitles();
      return;
    }

    this.hideNativeSubtitles();
    this.loadingEl.classList.add('hidden');
    this.containerEl.classList.remove('hidden');

    const mode = this.config.displayMode;

    if (mode === 'target-only') {
      this.transSubEl.textContent = transText || origText;
      this.transSubEl.classList.remove('hidden');
      this.origSubEl.classList.add('hidden');
    } else if (mode === 'source-only') {
      this.renderTokenizedLine(this.origSubEl, origText, lang, cueId);
      this.origSubEl.classList.remove('hidden');
      this.transSubEl.classList.add('hidden');
    } else {
      // bilingual
      this.transSubEl.textContent = transText;
      this.transSubEl.classList.toggle('hidden', !hasTrans);

      this.renderTokenizedLine(this.origSubEl, origText, lang, cueId);
      this.origSubEl.classList.toggle('hidden', !hasOrig);
    }
  }

  public setRecoveringState(): void {
    this.ensureHostAttached();
    if (!this.containerEl || !this.loadingEl || !this.origSubEl || !this.transSubEl) return;

    this.hideNativeSubtitles();
    this.containerEl.classList.remove('hidden');
    this.origSubEl.classList.add('hidden');
    this.transSubEl.classList.add('hidden');
    this.loadingEl.classList.remove('hidden');
  }

  public hideNativeSubtitles(): void {
    const el = document.querySelector('.player-timedtext') as HTMLElement | null;
    if (el) {
      el.style.visibility = 'hidden';
    }
  }

  public showNativeSubtitles(): void {
    const el = document.querySelector('.player-timedtext') as HTMLElement | null;
    if (el) {
      el.style.visibility = 'visible';
    }
  }
}

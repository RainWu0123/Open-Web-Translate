import type { ExtensionSettings } from '@/core/contracts/messages';
import { composeBilingualLines, type BilingualDisplayMode, type BilingualLine } from '@/shared/subtitles/bilingual-lines';

export interface OverlayToken {
  id: string;
  surface: string;
  start: number;
  end: number;
}

export interface OverlayRenderOptions {
  isError?: boolean;
  /** Clickable tokens (whole-text offsets) for the original-language line. */
  tokens?: OverlayToken[];
}

export class SubtitleOverlayRenderer {
  private containerId: string;
  private overlayElement: HTMLElement | null = null;
  private settings: Partial<ExtensionSettings> = {};
  private lineVisibility = { original: true, translated: true };
  private lastRender: { primary: string; secondary: string; options: OverlayRenderOptions } | null = null;

  // Drag state
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private initialLeft = 0;
  private initialTop = 0;

  constructor(containerId: string = 'owt-subtitle-overlay') {
    this.containerId = containerId;
  }

  public mount(parentContainer: HTMLElement): HTMLElement {
    let overlay = document.getElementById(this.containerId);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = this.containerId;
      overlay.style.position = 'fixed';
      overlay.style.left = '50%';
      overlay.style.bottom = '12%';
      overlay.style.transform = 'translateX(-50%)';
      overlay.style.zIndex = '2147483647';
      overlay.style.pointerEvents = 'auto';
      overlay.style.cursor = 'grab';
      overlay.style.userSelect = 'none';

      this.setupDragEvents(overlay);
      parentContainer.appendChild(overlay);
    }

    if (!overlay.shadowRoot) {
      overlay.attachShadow({ mode: 'open' });
    }

    if (overlay.parentElement !== parentContainer) {
      parentContainer.appendChild(overlay);
    }

    this.overlayElement = overlay;
    return overlay;
  }

  public updateSettings(settings: Partial<ExtensionSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /** Runtime line toggles (Alt+Z / Alt+C); re-renders the current content. */
  public setLineVisibility(visible: { original?: boolean; translated?: boolean }): void {
    this.lineVisibility = { ...this.lineVisibility, ...visible };
    if (this.lastRender) {
      this.render(this.lastRender.primary, this.lastRender.secondary, this.lastRender.options);
    }
  }

  public getLineVisibility(): { original: boolean; translated: boolean } {
    return { ...this.lineVisibility };
  }

  private getRenderTarget(): HTMLElement {
    if (!this.overlayElement) throw new Error('Overlay not mounted');
    return (this.overlayElement.shadowRoot as unknown as HTMLElement) || this.overlayElement;
  }

  public render(primaryText: string, secondaryText: string, options: OverlayRenderOptions = {}): void {
    if (!this.overlayElement) return;
    this.lastRender = { primary: primaryText, secondary: secondaryText, options };

    const target = this.getRenderTarget();
    target.innerHTML = '';

    const container = document.createElement('div');
    container.style.display = 'inline-flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.gap = '3px';
    container.style.pointerEvents = 'none';
    container.style.textAlign = 'center';

    if (options.isError) {
      container.appendChild(
        this.createLine({
          kind: 'translated',
          text: secondaryText || primaryText,
          color: '#ef4444',
          bold: true,
          fontSize: '16px',
        }),
      );
      target.appendChild(container);
      return;
    }

    const lines = composeBilingualLines(primaryText, secondaryText, this.displayMode, {
      originalFontSize: `${this.settings.subtitleOriginalFontSize || 18}px`,
      translatedFontSize: `${this.settings.subtitleTranslatedFontSize || 22}px`,
      originalColor: this.settings.subtitleOriginalColor || '#ffffff',
      translatedColor: this.settings.subtitleTranslatedColor || '#c084fc',
    }).filter((line) => (line.kind === 'original' ? this.lineVisibility.original : this.lineVisibility.translated));

    // Tokens carry whole-text offsets; locate each original line inside
    // primaryText and shift matching tokens to line-local offsets.
    let searchFrom = 0;
    for (const line of lines) {
      let lineTokens: OverlayToken[] | undefined;
      if (line.kind === 'original' && options.tokens?.length) {
        const foundAt = primaryText.indexOf(line.text, searchFrom);
        if (foundAt !== -1) {
          const lineEnd = foundAt + line.text.length;
          searchFrom = lineEnd;
          lineTokens = options.tokens
            .filter((t) => t.start >= foundAt && t.end <= lineEnd)
            .map((t) => ({ ...t, start: t.start - foundAt, end: t.end - foundAt }));
        }
      }
      container.appendChild(this.createLine(line, lineTokens));
    }

    target.appendChild(container);
  }

  public clear(): void {
    if (this.overlayElement) {
      this.lastRender = null;
      const target = this.getRenderTarget();
      target.innerHTML = '';
    }
  }

  private onMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private onMouseUpHandler: (() => void) | null = null;

  public destroy(): void {
    if (this.onMouseMoveHandler) {
      window.removeEventListener('mousemove', this.onMouseMoveHandler);
      this.onMouseMoveHandler = null;
    }
    if (this.onMouseUpHandler) {
      window.removeEventListener('mouseup', this.onMouseUpHandler);
      this.onMouseUpHandler = null;
    }
    if (this.overlayElement && this.overlayElement.parentElement) {
      this.overlayElement.parentElement.removeChild(this.overlayElement);
    }
    this.overlayElement = null;
  }

  private get displayMode(): BilingualDisplayMode {
    return (this.settings.displayMode as BilingualDisplayMode) || 'bilingual';
  }

  private createLine(spec: BilingualLine, tokens?: OverlayToken[]): HTMLElement {
    const line = document.createElement('span');
    line.style.display = 'block';
    line.style.color = spec.color;
    line.style.fontWeight = spec.bold ? '700' : '500';
    line.style.fontSize = spec.fontSize;
    line.style.lineHeight = '1.4';
    line.style.margin = '0';
    line.style.padding = '2px 10px';
    line.style.borderRadius = '4px';
    line.style.backgroundColor = 'rgba(8, 8, 8, 0.72)';
    line.style.boxSizing = 'border-box';
    line.style.textShadow = '0 2px 4px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)';
    line.dataset.kind = spec.kind;

    if (spec.kind !== 'original' || !tokens || tokens.length === 0) {
      line.textContent = spec.text;
      return line;
    }

    // Clickable token spans; gaps between tokens stay plain text. Token
    // offsets are line-local here.
    let cursor = 0;
    for (const token of tokens) {
      if (token.start > cursor) {
        line.appendChild(document.createTextNode(spec.text.slice(cursor, token.start)));
      }
      line.appendChild(this.createTokenSpan(spec.text, token));
      cursor = token.end;
    }
    if (cursor < spec.text.length) {
      line.appendChild(document.createTextNode(spec.text.slice(cursor)));
    }

    return line;
  }

  private createTokenSpan(lineText: string, token: OverlayToken): HTMLElement {
    const span = document.createElement('span');
    span.className = 'owt-token';
    span.textContent = lineText.slice(token.start, token.end);
    span.dataset.tokenId = token.id;
    span.dataset.surface = token.surface;
    span.title = '點擊查詢';
    span.style.pointerEvents = 'auto';
    span.style.cursor = 'pointer';
    span.style.borderRadius = '3px';
    span.style.transition = 'background 0.12s ease';
    span.addEventListener('mouseenter', () => {
      span.style.background = 'rgba(139, 92, 246, 0.35)';
    });
    span.addEventListener('mouseleave', () => {
      span.style.background = 'transparent';
    });
    span.addEventListener('click', (event) => {
      event.stopPropagation();
      this.overlayElement?.dispatchEvent(
        new CustomEvent('owt-token-clicked', {
          bubbles: true,
          detail: {
            tokenId: token.id,
            surface: token.surface,
            clientX: event.clientX,
            clientY: event.clientY,
          },
        }),
      );
    });
    return span;
  }

  private setupDragEvents(el: HTMLElement): void {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A' || target.tagName === 'BUTTON') return;
      if (target.classList?.contains('owt-token')) return; // token click, not drag
      this.isDragging = true;
      this.startX = e.clientX;
      this.startY = e.clientY;
      const rect = el.getBoundingClientRect();
      const parentRect = el.parentElement?.getBoundingClientRect() || document.body.getBoundingClientRect();
      this.initialLeft = rect.left - parentRect.left;
      this.initialTop = rect.top - parentRect.top;

      el.style.setProperty('transform', 'none', 'important');
      el.style.setProperty('left', `${this.initialLeft}px`, 'important');
      el.style.setProperty('top', `${this.initialTop}px`, 'important');
      el.style.setProperty('bottom', 'auto', 'important');
      el.style.cursor = 'grabbing';
      e.preventDefault();
    };

    this.onMouseMoveHandler = (e: MouseEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      el.style.setProperty('left', `${this.initialLeft + dx}px`, 'important');
      el.style.setProperty('top', `${this.initialTop + dy}px`, 'important');
    };

    this.onMouseUpHandler = () => {
      if (this.isDragging) {
        this.isDragging = false;
        el.style.cursor = 'grab';
      }
    };

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', this.onMouseMoveHandler);
    window.addEventListener('mouseup', this.onMouseUpHandler);
  }
}

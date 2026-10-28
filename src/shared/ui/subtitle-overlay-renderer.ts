import type { ExtensionSettings } from '@/core/contracts/messages';
import { composeBilingualLines, type BilingualDisplayMode, type BilingualLine } from '@/shared/subtitles/bilingual-lines';
import { learningText } from '@/shared/i18n/learning';

export interface OverlayToken {
  id: string;
  surface: string;
  start: number;
  end: number;
}

export interface OverlayRenderOptions {
  isError?: boolean;
  isPending?: boolean;
  /** Clickable tokens (whole-text offsets) for the original-language line. */
  tokens?: OverlayToken[];
}

export class SubtitleOverlayRenderer {
  private containerId: string;
  private overlayElement: HTMLElement | null = null;
  private settings: Partial<ExtensionSettings> = {};
  private lineVisibility = { original: true, translated: true };
  private layout = { bottomOffsetPx: 80, lineSpacingPx: 4 };
  private userDragged = false;
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
    const isDocumentRoot =
      parentContainer === document.body || parentContainer === document.documentElement;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = this.containerId;
      overlay.style.position = isDocumentRoot ? 'fixed' : 'absolute';
      overlay.style.left = '50%';
      overlay.style.width = 'min(86vw, 1080px)';
      overlay.style.bottom = `${this.layout.bottomOffsetPx}px`;
      overlay.style.transform = 'translateX(-50%)';
      overlay.style.zIndex = '2147483647';
      overlay.style.pointerEvents = 'none';
      overlay.style.cursor = 'grab';
      overlay.style.userSelect = 'none';
      overlay.style.background = 'transparent';
      overlay.style.border = 'none';
      overlay.style.boxShadow = 'none';

      this.setupDragEvents(overlay);
      parentContainer.appendChild(overlay);
    } else {
      overlay.style.position = isDocumentRoot ? 'fixed' : 'absolute';
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

  public updateLayout(
    layout: Partial<{ bottomOffsetPx: number; lineSpacingPx: number }>,
    options: { resetDraggedPosition?: boolean } = {},
  ): void {
    const bottom = Number(layout.bottomOffsetPx);
    const gap = Number(layout.lineSpacingPx);
    if (Number.isFinite(bottom)) this.layout.bottomOffsetPx = Math.min(240, Math.max(0, bottom));
    if (Number.isFinite(gap)) this.layout.lineSpacingPx = Math.min(40, Math.max(0, gap));

    if (this.overlayElement && (options.resetDraggedPosition || !this.userDragged)) {
      this.userDragged = false;
      this.overlayElement.style.removeProperty('top');
      this.overlayElement.style.setProperty('left', '50%', 'important');
      this.overlayElement.style.setProperty('bottom', `${this.layout.bottomOffsetPx}px`, 'important');
      this.overlayElement.style.setProperty('transform', 'translateX(-50%)', 'important');
    }
    this.refresh();
  }

  /** Repaint the currently visible cue after a live style change. */
  public refresh(): void {
    if (this.lastRender) {
      this.render(this.lastRender.primary, this.lastRender.secondary, this.lastRender.options);
    }
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
    container.style.gap = `${this.layout.lineSpacingPx}px`;
    container.style.pointerEvents = 'none';
    container.style.textAlign = 'center';
    container.style.background = 'transparent';
    container.style.width = '100%';
    container.style.position = 'relative';

    // In immersive mode, duplicate text still belongs to the translated slot.
    const lines = composeBilingualLines(this.displayMode === 'immersive' ? '' : primaryText, secondaryText, this.displayMode, {
      originalFontSize: `${this.settings.subtitleOriginalFontSize || 18}px`,
      translatedFontSize: `${this.settings.subtitleTranslatedFontSize || 22}px`,
      originalColor: this.settings.subtitleOriginalColor || '#ffffff',
      translatedColor: options.isError ? '#ef4444' : (this.settings.subtitleTranslatedColor || '#d4d4d4'),
    }).filter((line) => (line.kind === 'original' ? this.lineVisibility.original : this.lineVisibility.translated));

    if (!primaryText && !secondaryText) return;
    if (options.isPending || options.isError) container.setAttribute('aria-live', options.isError ? 'assertive' : 'polite');
    const order: Array<'original' | 'translated'> = this.displayMode === 'immersive'
      ? ['translated'] : this.displayMode === 'translation-first' ? ['translated', 'original'] : ['original', 'translated'];
    const visibleOrder = order.filter(kind => this.lineVisibility[kind]);
    if (visibleOrder.length === 2) {
      // Anchor both blocks to a shared divider. Their height can change without
      // pushing the opposite language: upper grows upward, lower grows down.
      const lowerFont = visibleOrder[1] === 'original' ? this.settings.subtitleOriginalFontSize || 18 : this.settings.subtitleTranslatedFontSize || 22;
      container.style.height = '0px';
      container.style.bottom = `${Number(lowerFont) * 1.4 + 4}px`;
    }
    let searchFrom = 0;
    for (const kind of visibleOrder) {
      const slot = document.createElement('div');
      slot.dataset.subtitleSlot = kind;
      slot.style.display = 'flex';
      slot.style.flexDirection = 'column';
      slot.style.alignItems = 'center';
      slot.style.width = '100%';
      if (visibleOrder.length === 2) {
        slot.style.position = 'absolute';
        if (kind === visibleOrder[0]) slot.style.bottom = `${this.layout.lineSpacingPx / 2}px`;
        else slot.style.top = `${this.layout.lineSpacingPx / 2}px`;
      }
      const slotLines = lines.filter(line => line.kind === kind);
      if (!slotLines.length) {
        const placeholder = this.createLine({ kind, text: '\u00a0', bold: kind === 'translated', color: 'transparent',
          fontSize: `${kind === 'original' ? this.settings.subtitleOriginalFontSize || 18 : this.settings.subtitleTranslatedFontSize || 22}px` });
        placeholder.style.visibility = 'hidden';
        placeholder.setAttribute('aria-hidden', 'true');
        slot.appendChild(placeholder);
      } else {
        for (const line of slotLines) {
          let lineTokens: OverlayToken[] | undefined;
          if (line.kind === 'original' && options.tokens?.length) {
            const foundAt = primaryText.indexOf(line.text, searchFrom);
            if (foundAt !== -1) {
              const lineEnd = foundAt + line.text.length;
              searchFrom = lineEnd;
              lineTokens = options.tokens.filter((t) => t.start >= foundAt && t.end <= lineEnd)
                .map((t) => ({ ...t, start: t.start - foundAt, end: t.end - foundAt }));
            }
          }
          const element = this.createLine(line, lineTokens);
          if (kind === 'translated' && options.isPending) element.style.opacity = '0.78';
          slot.appendChild(element);
        }
      }
      container.appendChild(slot);
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
    line.style.pointerEvents = 'auto';
    line.style.maxWidth = 'min(86vw, 1080px)';
    line.style.whiteSpace = 'normal';
    line.style.wordBreak = 'break-word';
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
    span.title = learningText(this.settings.uiLanguage, 'lookup');
    span.tabIndex = 0;
    span.setAttribute('role', 'button');
    span.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        const rect = span.getBoundingClientRect();
        span.dispatchEvent(new MouseEvent('click', { clientX: rect.left, clientY: rect.bottom }));
      }
    });
    span.style.pointerEvents = 'auto';
    span.style.cursor = 'pointer';
    span.style.borderRadius = '3px';
    span.style.transition = 'background 0.12s ease';
    span.addEventListener('mouseenter', () => {
      span.style.background = 'rgba(255, 255, 255, 0.28)';
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
      const target = (e.composedPath()[0] || e.target) as HTMLElement;
      if (target.tagName === 'A' || target.tagName === 'BUTTON') return;
      if (target.classList?.contains('owt-token')) return; // token click, not drag
      this.isDragging = true;
      this.userDragged = true;
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

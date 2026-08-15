import type { ExtensionSettings } from '@/core/contracts/messages';

export interface OverlayRenderOptions {
  isError?: boolean;
}

export class SubtitleOverlayRenderer {
  private containerId: string;
  private overlayElement: HTMLElement | null = null;
  private settings: Partial<ExtensionSettings> = {};

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

  private getRenderTarget(): HTMLElement {
    if (!this.overlayElement) throw new Error('Overlay not mounted');
    return (this.overlayElement.shadowRoot as unknown as HTMLElement) || this.overlayElement;
  }

  public render(primaryText: string, secondaryText?: string, options: OverlayRenderOptions = {}): void {
    if (!this.overlayElement) return;

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
      const errorLine = this.createLine(
        secondaryText || primaryText,
        '#ef4444',
        true,
        '16px',
      );
      container.appendChild(errorLine);
      target.appendChild(container);
      return;
    }

    const originalLines = primaryText.split('\n').filter(Boolean);
    const translatedLines = (secondaryText || '').split('\n').filter(Boolean);

    const originalFontSize = `${this.settings.subtitleOriginalFontSize || 18}px`;
    const translatedFontSize = `${this.settings.subtitleTranslatedFontSize || 22}px`;
    const originalColor = this.settings.subtitleOriginalColor || '#ffffff';
    const translatedColor = this.settings.subtitleTranslatedColor || '#c084fc';
    const displayMode = this.settings.displayMode || 'bilingual';

    if (displayMode === 'immersive') {
      translatedLines.forEach((line) =>
        container.appendChild(this.createLine(line, translatedColor, true, translatedFontSize)),
      );
    } else if (displayMode === 'translation-first') {
      translatedLines.forEach((line) =>
        container.appendChild(this.createLine(line, translatedColor, true, translatedFontSize)),
      );
      originalLines.forEach((line) =>
        container.appendChild(this.createLine(line, originalColor, false, originalFontSize)),
      );
    } else {
      // default: bilingual (original first)
      originalLines.forEach((line) =>
        container.appendChild(this.createLine(line, originalColor, false, originalFontSize)),
      );
      translatedLines.forEach((line) =>
        container.appendChild(this.createLine(line, translatedColor, true, translatedFontSize)),
      );
    }

    target.appendChild(container);
  }

  public clear(): void {
    if (this.overlayElement) {
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

  private createLine(text: string, color: string, bold: boolean, fontSize: string): HTMLElement {
    const line = document.createElement('span');
    line.style.display = 'block';
    line.style.color = color;
    line.style.fontWeight = bold ? '700' : '500';
    line.style.fontSize = fontSize;
    line.style.lineHeight = '1.4';
    line.style.margin = '0';
    line.style.padding = '2px 10px';
    line.style.borderRadius = '4px';
    line.style.backgroundColor = 'rgba(8, 8, 8, 0.72)';
    line.style.boxSizing = 'border-box';
    line.style.textShadow = '0 2px 4px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)';
    line.textContent = text;
    return line;
  }

  private setupDragEvents(el: HTMLElement): void {
    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'A' || (e.target as HTMLElement).tagName === 'BUTTON') return;
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

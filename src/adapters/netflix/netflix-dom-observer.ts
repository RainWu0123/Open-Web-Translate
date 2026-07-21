import { createLogger } from '@/shared/logger';

const logger = createLogger('NetflixDomObserver');

export type DomCueCallback = (text: string) => void;

export class NetflixDomObserver {
  private observer: MutationObserver | null = null;
  private isObserving = false;
  private lastCapturedText = '';
  private callback: DomCueCallback | null = null;

  constructor() {}

  public start(cb: DomCueCallback): void {
    this.callback = cb;
    this.isObserving = true;
    this.setupObserver();
    logger.info('Tier 3 DOM Observer started');
  }

  public stop(): void {
    this.isObserving = false;
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.lastCapturedText = '';
    this.callback = null;
    logger.info('Tier 3 DOM Observer stopped');
  }

  private setupObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver(() => {
      if (!this.isObserving) return;
      this.extractTextFromDom();
    });

    const targetNode =
      document.querySelector('.player-timedtext') ||
      document.querySelector('[data-uia="player-timedtext"]') ||
      document.body;

    if (targetNode) {
      this.observer.observe(targetNode, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      this.extractTextFromDom();
    }
  }

  private extractTextFromDom(): void {
    const timedTextNode =
      document.querySelector('.player-timedtext') ||
      document.querySelector('[data-uia="player-timedtext"]');

    if (!timedTextNode) return;

    const lines: string[] = [];
    const spans = timedTextNode.querySelectorAll('span');

    if (spans.length > 0) {
      spans.forEach((span) => {
        const text = span.textContent?.trim();
        if (text && !lines.includes(text)) {
          lines.push(text);
        }
      });
    } else {
      const directText = timedTextNode.textContent?.trim();
      if (directText) lines.push(directText);
    }

    const currentText = lines.join('\n').trim();

    if (currentText !== this.lastCapturedText) {
      this.lastCapturedText = currentText;
      if (this.callback) {
        this.callback(currentText);
      }
    }
  }
}

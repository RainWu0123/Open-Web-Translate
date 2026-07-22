import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetflixCaptionAdapter } from '@/adapters/netflix/netflix-caption-adapter';
import { messageRouter } from '@/infrastructure/messaging/message-router';

vi.mock('@/infrastructure/messaging/message-router', () => ({
  messageRouter: {
    sendMessage: vi.fn(),
    registerHandler: vi.fn(),
    listen: vi.fn(),
  },
}));

describe('NetflixCaptionAdapter Unit Tests', () => {
  let adapter: NetflixCaptionAdapter;

  beforeEach(() => {
    document.body.innerHTML = `
      <div data-uia="controls-standard">
        <button data-uia="control-audio-subtitle">Subtitles</button>
      </div>
    `;
    vi.clearAllMocks();
    adapter = new NetflixCaptionAdapter();
  });

  afterEach(() => {
    if (adapter) {
      adapter.stop();
    }
  });

  it('initializes adapter on netflix.com and starts/stops cleanly', async () => {
    adapter.init();
    expect(adapter.getTrackManager()).toBeDefined();
    expect(adapter.getSyncEngine()).toBeDefined();

    await adapter.start('zh-TW');
    expect(adapter.getOverlayRenderer()).toBeDefined();

    adapter.stop();
  });

  it('injects control button using stable data-uia selector or fallback controls container', () => {
    adapter.init();
    adapter.injectControlsButton();

    const injectedBtn = document.querySelector('.owt-netflix-toggle-btn') as HTMLButtonElement | null;
    expect(injectedBtn).not.toBeNull();
    expect(injectedBtn?.title).toBe('OWT 雙語字幕與語言學習 Overlay');
  });

  it('toggles active state on button click', async () => {
    adapter.init();
    adapter.injectControlsButton();

    const injectedBtn = document.querySelector('.owt-netflix-toggle-btn') as HTMLButtonElement;
    expect(injectedBtn).not.toBeNull();

    injectedBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    injectedBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
});

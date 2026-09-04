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

  it('injects no player button — the popup is the command center', () => {
    adapter.init();
    expect(document.querySelector('.owt-netflix-toggle-btn')).toBeNull();
  });

  it('setActive toggles the engine and getStateInfo exposes the popup surface', async () => {
    adapter.setActive(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((adapter as any).isActive).toBe(true);

    const state = adapter.getStateInfo();
    expect(Array.isArray(state.tracks)).toBe(true);
    expect(typeof state.learningMode).toBe('boolean');

    adapter.setActive(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((adapter as any).isActive).toBe(false);
  });
});

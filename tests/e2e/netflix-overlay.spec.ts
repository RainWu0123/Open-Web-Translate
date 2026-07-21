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

describe('Netflix Overlay E2E Integration Suite', () => {
  let adapter: NetflixCaptionAdapter;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.mocked(messageRouter.sendMessage).mockResolvedValue({
      targetLanguage: 'zh-Hant',
      displayMode: 'bilingual',
    } as any);

    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.netflix.com', pathname: '/watch/80000001', href: 'https://www.netflix.com/watch/80000001' },
      writable: true,
    });
  });

  afterEach(() => {
    if (adapter) {
      adapter.stop();
    }
  });

  it('injects OWT control button into player controls container using data-uia selector', () => {
    const controlsContainer = document.createElement('div');
    controlsContainer.setAttribute('data-uia', 'controls-standard');
    document.body.appendChild(controlsContainer);

    adapter = new NetflixCaptionAdapter();
    adapter.init();

    const btn = document.querySelector('.owt-netflix-toggle-btn');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain('OWT');
  });

  it('mounts open Shadow DOM host container on video container when starting adapter', async () => {
    const watchVideo = document.createElement('div');
    watchVideo.setAttribute('data-uia', 'watch-video');
    document.body.appendChild(watchVideo);

    adapter = new NetflixCaptionAdapter();
    adapter.init();
    await adapter.start();

    const host = document.getElementById('owt-netflix-overlay-host');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();
  });

  it('re-parents Shadow DOM overlay host upon fullscreenchange event', async () => {
    const watchVideo = document.createElement('div');
    watchVideo.className = 'watch-video';

    const fullscreenEl = document.createElement('div');
    fullscreenEl.className = 'fullscreen-mock';

    document.body.appendChild(watchVideo);
    document.body.appendChild(fullscreenEl);

    adapter = new NetflixCaptionAdapter();
    adapter.init();
    await adapter.start();

    // Mock fullscreenElement
    Object.defineProperty(document, 'fullscreenElement', {
      value: fullscreenEl,
      configurable: true,
      writable: true,
    });

    // Trigger fullscreenchange
    window.dispatchEvent(new Event('fullscreenchange'));

    // Fast-forward timeout in renderer
    await new Promise((resolve) => setTimeout(resolve, 150));

    const host = document.getElementById('owt-netflix-overlay-host');
    expect(host?.parentElement).toBe(fullscreenEl);
  });
});

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
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.mocked(messageRouter.sendMessage).mockResolvedValue({
      targetLanguage: 'zh-Hant',
      displayMode: 'bilingual',
    } as any);
  });

  afterEach(() => {
    if (adapter) {
      adapter.stop();
    }
  });

  it('instantiates correctly and handles init when location is not netflix.com', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'example.com', pathname: '/', href: 'https://example.com' },
      writable: true,
    });
    adapter = new NetflixCaptionAdapter();
    expect(() => adapter.init()).not.toThrow();
  });

  it('injects control button into Netflix player controls container', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.netflix.com', pathname: '/watch/123456', href: 'https://www.netflix.com/watch/123456' },
      writable: true,
    });
    adapter = new NetflixCaptionAdapter();

    const controls = document.createElement('div');
    controls.className = 'AkiraPlayerControls--bottom-controls';
    const audioSubBtn = document.createElement('button');
    audioSubBtn.setAttribute('data-uia', 'control-audio-subtitle');
    controls.appendChild(audioSubBtn);
    document.body.appendChild(controls);

    adapter.init();

    const injectedBtn = document.querySelector('.owt-netflix-toggle-btn') as HTMLButtonElement;
    expect(injectedBtn).not.toBeNull();
    expect(injectedBtn?.title).toBe('Open Web Translate (副字幕選單)');
  });
});

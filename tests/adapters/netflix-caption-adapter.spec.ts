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

describe('NetflixCaptionAdapter Integration Spec', () => {
  let adapter: NetflixCaptionAdapter;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();

    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.netflix.com', pathname: '/watch/82931358', href: 'https://www.netflix.com/watch/82931358' },
      writable: true,
    });
  });

  afterEach(() => {
    if (adapter) {
      adapter.stop();
    }
  });

  it('intercepts Netflix caption segments and renders bilingual translation', async () => {
    adapter = new NetflixCaptionAdapter();
    (messageRouter.sendMessage as any).mockResolvedValue({
      segments: [{ id: 'nf-caption', translatedText: '我是不才惡女' }],
    });

    const container = document.createElement('div');
    container.className = 'player-timedtext';
    const textContainer = document.createElement('div');
    textContainer.className = 'player-timedtext-text-container';
    const seg = document.createElement('span');
    seg.textContent = 'I am an incompetent villainess';
    textContainer.appendChild(seg);
    container.appendChild(textContainer);
    document.body.appendChild(container);

    await adapter.start('zh-Hant', 'bilingual', 18, 22, '#ffffff', '#818cf8');
    await (adapter as any).processCaptions();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seg.getAttribute('data-owt-original')).toBe('I am an incompetent villainess');
    expect(seg.textContent).toContain('I am an incompetent villainess');
    expect(seg.textContent).toContain('我是不才惡女');
  });

  it('restores native Netflix caption DOM on stop', async () => {
    adapter = new NetflixCaptionAdapter();
    (messageRouter.sendMessage as any).mockResolvedValue({
      segments: [{ id: 'nf-caption', translatedText: '我是不才惡女' }],
    });

    const container = document.createElement('div');
    container.className = 'player-timedtext';
    const seg = document.createElement('span');
    seg.textContent = 'Hello Netflix';
    container.appendChild(seg);
    document.body.appendChild(container);

    await adapter.start('zh-Hant', 'bilingual');
    await (adapter as any).processCaptions();
    await new Promise((resolve) => setTimeout(resolve, 0));

    adapter.stop();

    expect(seg.textContent).toBe('Hello Netflix');
    expect(seg.hasAttribute('data-owt-original')).toBe(false);
  });
});

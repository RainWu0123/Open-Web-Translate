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

  it('intercepts Netflix caption segments via Tier 3 DOM fallback and renders bilingual translation in Shadow DOM', async () => {
    adapter = new NetflixCaptionAdapter();
    (messageRouter.sendMessage as any).mockResolvedValue({
      segments: [{ id: 'nf_cue', text: 'I am an incompetent villainess', translatedText: '我是不才惡女' }],
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
    await new Promise((resolve) => setTimeout(resolve, 200));

    const host = document.getElementById('owt-netflix-overlay-host');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();

    const shadowContent = host?.shadowRoot?.innerHTML || '';
    expect(shadowContent).toContain('I am an incompetent villainess');
    expect(shadowContent).toContain('我是不才惡女');
  });

  it('restores native Netflix caption DOM on stop', async () => {
    adapter = new NetflixCaptionAdapter();
    (messageRouter.sendMessage as any).mockResolvedValue({
      segments: [{ id: 'nf_cue', text: 'Hello Netflix', translatedText: '你好 Netflix' }],
    });

    const container = document.createElement('div');
    container.className = 'player-timedtext';
    const seg = document.createElement('span');
    seg.textContent = 'Hello Netflix';
    container.appendChild(seg);
    document.body.appendChild(container);

    await adapter.start('zh-Hant', 'bilingual');
    await new Promise((resolve) => setTimeout(resolve, 200));

    adapter.stop();
    expect(container.style.display).not.toBe('none');
  });
});

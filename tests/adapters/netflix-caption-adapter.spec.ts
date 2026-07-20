import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetflixCaptionAdapter } from '@/adapters/netflix/netflix-caption-adapter';
import { messageRouter } from '@/infrastructure/messaging/message-router';

vi.mock('@/infrastructure/messaging/message-router', () => ({
  messageRouter: {
    sendMessage: vi.fn(),
  },
}));

const waitForTranslation = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('NetflixCaptionAdapter', () => {
  let adapter: NetflixCaptionAdapter;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.netflix.com',
        pathname: '/watch/82931358',
        href: 'https://www.netflix.com/watch/82931358',
      },
      writable: true,
    });
  });

  afterEach(() => {
    adapter?.stop();
  });

  it('renders a stable bilingual overlay without mutating Netflix caption text', async () => {
    vi.mocked(messageRouter.sendMessage).mockResolvedValue({
      segments: [{ id: 'nf-overlay', translatedText: '我是不才惡女' }],
    });

    const container = document.createElement('div');
    container.className = 'player-timedtext';
    const textContainer = document.createElement('div');
    textContainer.className = 'player-timedtext-text-container';
    textContainer.textContent = 'I am an incompetent villainess';
    container.appendChild(textContainer);
    document.body.appendChild(container);

    adapter = new NetflixCaptionAdapter();
    await adapter.start('zh-Hant', 'bilingual');
    (adapter as any).processCaptions();
    await waitForTranslation();

    const overlay = document.querySelector('#owt-netflix-overlay');
    expect(overlay?.textContent).toContain('I am an incompetent villainess');
    expect(overlay?.textContent).toContain('我是不才惡女');
    expect(textContainer.textContent).toBe('I am an incompetent villainess');
    expect(textContainer.style.visibility).toBe('hidden');
  });

  it('keeps native Netflix captions visible when stopped', async () => {
    vi.mocked(messageRouter.sendMessage).mockResolvedValue({
      segments: [{ id: 'nf-overlay', translatedText: '你好 Netflix' }],
    });

    const caption = document.createElement('div');
    caption.className = 'player-timedtext';
    caption.textContent = 'Hello Netflix';
    document.body.appendChild(caption);

    adapter = new NetflixCaptionAdapter();
    await adapter.start('zh-Hant', 'bilingual');
    (adapter as any).processCaptions();
    await waitForTranslation();
    adapter.stop();

    expect(caption.textContent).toBe('Hello Netflix');
    expect(caption.style.visibility).toBe('');
    expect(document.querySelector('#owt-netflix-overlay')?.textContent).toBe('');
  });
});

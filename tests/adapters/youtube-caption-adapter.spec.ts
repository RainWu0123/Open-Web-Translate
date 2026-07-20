import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { YouTubeCaptionAdapter } from '@/adapters/youtube/youtube-caption-adapter';
import { messageRouter } from '@/infrastructure/messaging/message-router';

vi.mock('@/infrastructure/messaging/message-router', () => ({
  messageRouter: {
    sendMessage: vi.fn(),
  },
}));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('YouTubeCaptionAdapter', () => {
  let adapter: YouTubeCaptionAdapter;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();

    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youtube.com', pathname: '/watch', search: '?v=video1', href: 'https://www.youtube.com/watch?v=video1' },
      writable: true,
    });
  });

  afterEach(() => {
    if (adapter) {
      adapter.stop();
    }
    vi.useRealTimers();
  });

  const setupPlayerDOM = (type: 'primary' | 'fallback' = 'primary') => {
    document.body.innerHTML = `
      <div id="movie_player" class="html5-video-player">
        <video class="video-stream html5-main-video"></video>
        ${
          type === 'primary'
            ? `<div class="ytp-caption-window-container" id="caption-container"></div>`
            : `<div class="caption-window" id="caption-container"><div class="caption-visual-line">Fallback</div></div>`
        }
      </div>
    `;
  };

  const updateCaptions = (texts: string[], type: 'primary' | 'fallback' = 'primary') => {
    const container = document.getElementById('caption-container');
    if (!container) return;

    if (type === 'primary') {
      container.innerHTML = texts.map((t) => `<span class="ytp-caption-segment">${t}</span>`).join('');
    } else {
      container.innerHTML = texts.map((t) => `<div class="caption-visual-line">${t}</div>`).join('');
    }
  };

  it('Explicit user activation boundary: should not start without being called', () => {
    setupPlayerDOM();
    adapter = new YouTubeCaptionAdapter();

    updateCaptions(['Hello']);
    expect((adapter as any).isActive).toBe(false);
    const seg = document.querySelector('.ytp-caption-segment');
    expect(seg?.hasAttribute('data-owt-fingerprint')).toBe(false);
  });

  it('Translates native caption segments and attaches fingerprints', async () => {
    setupPlayerDOM();
    adapter = new YouTubeCaptionAdapter();

    vi.mocked(messageRouter.sendMessage).mockResolvedValue({
      segments: [{ id: 'yt-caption', translatedText: '你好' }],
    });

    await adapter.start('zh-Hant', 'bilingual');

    updateCaptions(['Hello']);
    await wait(250); // allow observer / polling cycle and translation promise

    expect(messageRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TRANSLATE_REQUEST',
        segments: [{ id: 'yt-caption', text: 'Hello' }],
        targetLanguage: 'zh-Hant',
      })
    );

    const seg = document.querySelector('.ytp-caption-segment') as HTMLElement;
    expect(seg.getAttribute('data-owt-original')).toBe('Hello');
    expect(seg.getAttribute('data-owt-fingerprint')).toBeTruthy();
    expect(seg.textContent).toContain('Hello');
    expect(seg.textContent).toContain('你好');
  });

  it('Supports different display modes (bilingual, translation-first, immersive)', async () => {
    setupPlayerDOM();
    adapter = new YouTubeCaptionAdapter();

    vi.mocked(messageRouter.sendMessage).mockResolvedValue({
      segments: [{ id: 'yt-caption', translatedText: '你好' }],
    });

    // 1. Immersive mode
    await adapter.start('zh-Hant', 'immersive');
    updateCaptions(['Hello']);
    await wait(250);

    const segImmersive = document.querySelector('.ytp-caption-segment') as HTMLElement;
    expect(segImmersive.textContent).toBe('你好');
    expect(segImmersive.textContent).not.toContain('Hello');

    adapter.stop();

    // 2. Translation-first mode
    adapter = new YouTubeCaptionAdapter();
    await adapter.start('zh-Hant', 'translation-first');
    updateCaptions(['Hello']);
    await wait(250);

    const segTransFirst = document.querySelector('.ytp-caption-segment') as HTMLElement;
    const spans = segTransFirst.querySelectorAll('span');
    expect(spans.length).toBe(2);
    expect(spans[0].textContent).toBe('你好');
    expect(spans[1].textContent).toBe('Hello');
  });

  it('Pending request deduplication (same fingerprint)', async () => {
    setupPlayerDOM();
    adapter = new YouTubeCaptionAdapter();

    vi.mocked(messageRouter.sendMessage).mockResolvedValue({
      segments: [{ id: 'yt-caption', translatedText: '你好' }],
    });

    await adapter.start('zh-Hant', 'bilingual');
    updateCaptions(['Hello']);

    await wait(250);
    expect(messageRouter.sendMessage).toHaveBeenCalledTimes(1);

    // Trigger another processCaptions pass on the existing DOM element with fingerprint set
    await (adapter as any).processCaptions();
    await wait(100);

    // Should not fetch again because fingerprint matches
    expect(messageRouter.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('Selector fallback scenario (.caption-visual-line)', async () => {
    setupPlayerDOM('fallback');
    adapter = new YouTubeCaptionAdapter();

    vi.mocked(messageRouter.sendMessage).mockResolvedValue({
      segments: [{ id: 'yt-caption', translatedText: '備用' }],
    });

    await adapter.start('zh-Hant', 'bilingual');
    await wait(250);

    expect(messageRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TRANSLATE_REQUEST',
        segments: [{ id: 'yt-caption', text: 'Fallback' }],
      })
    );
  });

  it('Restores native DOM when stopped', async () => {
    setupPlayerDOM();
    adapter = new YouTubeCaptionAdapter();

    vi.mocked(messageRouter.sendMessage).mockResolvedValue({
      segments: [{ id: 'yt-caption', translatedText: '你好' }],
    });

    await adapter.start('zh-Hant', 'bilingual');
    updateCaptions(['Original Subtitle']);
    await wait(250);

    const seg = document.querySelector('.ytp-caption-segment') as HTMLElement;
    expect(seg.getAttribute('data-owt-original')).toBe('Original Subtitle');

    adapter.stop();

    expect(seg.hasAttribute('data-owt-original')).toBe(false);
    expect(seg.hasAttribute('data-owt-fingerprint')).toBe(false);
    expect(seg.textContent).toBe('Original Subtitle');
  });
});

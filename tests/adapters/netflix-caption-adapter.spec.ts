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
    document.body.innerHTML = `
      <div class="watch-video">
        <div class="player-timedtext"><span>I am an incompetent villainess</span></div>
        <div data-uia="controls-standard">
          <button data-uia="control-audio-subtitle">Subtitles</button>
        </div>
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

  it('intercepts Netflix caption segments via Tier 3 DOM fallback and renders bilingual translation in Shadow DOM', async () => {
    (messageRouter.sendMessage as any).mockResolvedValue({
      segments: [{ id: 'nf_cue', translatedText: '我是不才惡女' }],
    });

    adapter.init();
    await adapter.start('zh-Hant');

    // Wait until translation pipeline completes and renders into shadow root
    await vi.waitFor(
      () => {
        const host = document.getElementById('owt-netflix-overlay-host');
        const shadowContent = host?.shadowRoot?.innerHTML || '';
        const textOnly = shadowContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        expect(textOnly).toContain('我是不才惡女');
      },
      { timeout: 2000 },
    );

    const host = document.getElementById('owt-netflix-overlay-host');
    const shadowContent = host?.shadowRoot?.innerHTML || '';
    const textOnly = shadowContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(textOnly).toContain('I am an incompetent villainess');
    expect(textOnly).toContain('我是不才惡女');
  });
});

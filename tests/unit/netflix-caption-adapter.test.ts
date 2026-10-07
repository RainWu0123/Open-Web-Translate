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

  it('keeps the source subtitle visible while AI translation is pending', async () => {
    let resolveTranslation!: (value: unknown) => void;
    vi.mocked(messageRouter.sendMessage).mockImplementationOnce(
      () => new Promise((resolve) => { resolveTranslation = resolve; }) as any,
    );

    await adapter.start('zh-Hant');
    const generation = (adapter as any).routeGeneration;
    const translationPromise = (adapter as any).fetchAndRenderOverlay('Hello', generation);
    await Promise.resolve();

    const host = document.getElementById('owt-netflix-overlay-host');
    expect(host?.shadowRoot?.textContent).toContain('Hello');
    expect(host?.shadowRoot?.textContent).toContain('翻譯中');

    resolveTranslation({
      segments: [{ id: 'nf-overlay', translatedText: '你好' }],
    });
    await translationPromise;

    expect(host?.shadowRoot?.textContent).toContain('Hello');
    expect(host?.shadowRoot?.textContent).toContain('你好');
    expect(host?.shadowRoot?.textContent).not.toContain('翻譯中');
  });

  it('restores both subtitle lines when learning mode is disabled', async () => {
    await adapter.start('zh-Hant');
    (adapter as any).renderOverlay('Hello', '你好');

    const renderer = adapter.getOverlayRenderer();
    renderer.setLineVisibility({ original: false, translated: false });
    const host = document.getElementById('owt-netflix-overlay-host');
    expect(host?.shadowRoot?.textContent).not.toContain('Hello');
    expect(host?.shadowRoot?.textContent).not.toContain('你好');

    (adapter as any).learningMode.setEnabled(false);

    expect(renderer.getLineVisibility()).toEqual({ original: true, translated: true });
    expect(host?.shadowRoot?.textContent).toContain('Hello');
    expect(host?.shadowRoot?.textContent).toContain('你好');
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

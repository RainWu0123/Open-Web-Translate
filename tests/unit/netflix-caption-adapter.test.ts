import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetflixCaptionAdapter } from '@/adapters/netflix/netflix-caption-adapter';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { BRIDGE, bridgeRequest, postToMain } from '@/adapters/netflix/netflix-bridge';

vi.mock('@/adapters/netflix/netflix-bridge', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/adapters/netflix/netflix-bridge')>(),
  bridgeRequest: vi.fn(),
  postToMain: vi.fn(),
}));

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

  it('does not repeat nested native caption containers', () => {
    document.body.innerHTML = '<div class="player-timedtext"><div class="player-timedtext-text-container">First line</div><div class="player-timedtext-text-container">Second line</div></div>';
    expect((adapter as any).getNativeSubtitleTextFromDOM()).toBe('First line\nSecond line');
  });

  it('requests an existing track snapshot when enabled after page discovery', async () => {
    await adapter.start('zh-Hant');
    expect(postToMain).toHaveBeenCalledWith(BRIDGE.messageType.REQUEST_TRACKS);
  });

  it('retries track discovery in manual AI mode while playback is paused', async () => {
    vi.useFakeTimers();
    try {
      const a = adapter as any;
      a.isActive = true;
      a.selectionMode = 'manual';
      a.selectedTrackId = 'ai-translate';
      a.discoveredTracks = [];
      await a.startAiPrefetchOrFallback();
      await vi.advanceTimersByTimeAsync(4000);
      expect(postToMain).toHaveBeenCalledWith(BRIDGE.messageType.REQUEST_TRACKS);
      a.sourceLang = 'ja';
      a.discoveredTracks = [{ id: 'ja', language: 'ja', url: 'https://example.test/ja.ttml' }];
      const load = vi.spyOn(a.aiPrefetch, 'load').mockResolvedValue(true);
      await vi.advanceTimersByTimeAsync(4000);
      expect(load).toHaveBeenCalledOnce();
    } finally {
      adapter.stop();
      vi.useRealTimers();
    }
  });

  it('starts prefetch when tracks arrive after choosing AI, then reuses its cache', async () => {
    const a = adapter as any;
    a.isActive = true;
    a.sourceLang = 'ja';
    a.selectionMode = 'manual';
    a.selectedTrackId = 'ai-translate';
    a.discoveredTracks = [{ id: 'ja', language: 'ja', label: 'Japanese', url: 'https://example.test/ja.ttml' }];
    const load = vi.spyOn(a.aiPrefetch, 'load').mockResolvedValue(true);
    const matches = vi.spyOn(a.aiPrefetch, 'matches').mockReturnValue(false);
    a.reconcileTrackSelection();
    await a.aiLoading;
    expect(load).toHaveBeenCalledTimes(1);
    matches.mockReturnValue(true);
    a.reconcileTrackSelection();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('prefetches future subtitles from the actual MAIN-world track payload', async () => {
    const a = adapter as any;
    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', { value: 10.5, configurable: true });
    document.body.appendChild(video);
    a.isActive = true;
    a.sourceLang = 'auto';
    a.selectionMode = 'manual';
    a.selectedTrackId = 'ai-translate';
    a.setupMainWorldMessageListener();
    vi.mocked(bridgeRequest).mockResolvedValueOnce({ trackId: 'ja-track' });
    const fetchTrack = vi.spyOn(adapter, 'fetchTtmlXml').mockResolvedValue(
      '<tt><body><div><p begin="00:00:10.000" end="00:00:12.000">氷の上で</p><p begin="00:00:13.000" end="00:00:15.000">滑る練習をする</p></div></body></tt>',
    );
    vi.spyOn(adapter.getSyncEngine(), 'start').mockImplementation(() => {});
    vi.mocked(messageRouter.sendMessage).mockImplementation(async (request: any) => ({
      segments: request.segments.map((segment: any) => ({ id: segment.id, translatedText: `譯:${segment.text}` })),
    }) as any);

    document.dispatchEvent(new CustomEvent(BRIDGE.TRACKS_EVENT, { detail: JSON.stringify({
      source: BRIDGE.MAIN_SOURCE, type: BRIDGE.messageType.TRACKS_UPDATED, revision: 1,
      tracks: [{ trackId: 'ja-track', bcp47: 'ja', url: 'https://example.test/ja.ttml', isCC: false, candidates: [] }],
    }) }));
    await a.aiLoading;
    await Promise.resolve();
    expect(fetchTrack).toHaveBeenCalledWith('https://example.test/ja.ttml');
    expect(adapter.getStateInfo().tracks?.[0].id).toBe('ja-track');
    expect(messageRouter.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'TRANSLATE_REQUEST', sourceLanguage: 'ja',
      segments: [
        expect.objectContaining({ text: '氷の上で' }),
        expect.objectContaining({ text: '滑る練習をする' }),
      ],
    }));
  });

  it('ignores a pending source lookup after stopping and restarting the engine', async () => {
    const a = adapter as any;
    a.isActive = true;
    a.sourceLang = 'auto';
    a.discoveredTracks = [{ id: 'ja', language: 'ja', label: 'Japanese', url: 'https://example.test/ja.ttml' }];
    let resolveLookup!: (value: any) => void;
    vi.mocked(bridgeRequest).mockImplementationOnce(() => new Promise(resolve => { resolveLookup = resolve; }));
    const load = vi.spyOn(a.aiPrefetch, 'load').mockResolvedValue(true);
    const oldLoad = a.startAiPrefetchOrFallback();

    adapter.stop();
    a.isActive = true;
    a.sourceLang = 'ja';
    await a.startAiPrefetchOrFallback();
    expect(load).toHaveBeenCalledTimes(1);

    resolveLookup({ trackId: 'ja' });
    expect(await oldLoad).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['zh-Hant', '翻譯中'],
    ['en', 'Translating…'],
  ])('keeps the source subtitle visible while AI translation is pending (%s)', async (uiLanguage, pendingText) => {
    // Pin the interface locale: caption target language is independent.
    (adapter as any).onSharedSettingsApplied({ uiLanguage });
    let resolveTranslation!: (value: unknown) => void;
    vi.mocked(messageRouter.sendMessage).mockImplementationOnce(
      () => new Promise((resolve) => { resolveTranslation = resolve; }) as any,
    );

    await adapter.start('zh-Hant');
    (adapter as any).learningMode.setEnabled(true);
    const generation = (adapter as any).routeGeneration;
    // fetchAndRenderOverlay normally runs after onNewSubtitleText records the
    // active cue. Mirror that precondition so the stale-response guard accepts
    // the resolved translation instead of intentionally discarding it.
    (adapter as any).lastProcessedText = 'Hello';
    const translationPromise = (adapter as any).fetchAndRenderOverlay('Hello', generation);
    await Promise.resolve();

    const host = document.getElementById('owt-netflix-overlay-host');
    expect(host?.shadowRoot?.textContent).toContain('Hello');
    expect(host?.shadowRoot?.textContent).toContain(pendingText);
    expect(host?.shadowRoot?.querySelector('.owt-token')?.textContent).toBe('Hello');

    resolveTranslation({
      segments: [{ id: 'nf-overlay', translatedText: '你好' }],
    });
    await translationPromise;

    expect(host?.shadowRoot?.textContent).toContain('Hello');
    expect(host?.shadowRoot?.textContent).toContain('你好');
    expect(host?.shadowRoot?.textContent).not.toContain(pendingText);
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

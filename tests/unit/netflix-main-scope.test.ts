import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE } from '@/adapters/netflix/netflix-bridge';
import { hydrateNetflixTrackUrl } from '@/adapters/netflix/netflix-track-hydrator';
const runtime = vi.hoisted(() => ({ epoch: 0 }));

vi.mock('@/adapters/netflix/netflix-track-hydrator', () => ({ hydrateNetflixTrackUrl: vi.fn() }));
vi.mock('@/adapters/netflix/netflix-track-discovery', () => ({
  NetflixTrackDiscovery: class {
    start() {} rearm() {} pollOnce() { return false; }
    captureScope() { return { videoId: location.pathname.split('/').at(-1), epoch: runtime.epoch }; }
    isCurrentScope(scope: any) { return scope.videoId === this.captureScope().videoId && scope.epoch === runtime.epoch; }
    currentPlayer() { return { id: 'watch-new', player: { getTimedTextTrackList() { return []; }, setTimedTextTrack() {} } }; }
    lastPayload() { return { tracks: [], source: '', revision: 0 }; }
    bindHydratedUrl() {}
    fetchResource(_scope: any, url: string, init: any) { return fetch(url, init); }
  },
  getMainVideoPlayer: () => null, getPlayerApi: () => null,
  extractTracksFromPerformanceEntriesForDebug: () => [],
}));

describe('Netflix MAIN hydration queue scope', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('does not execute a queued old-film hydration against the next player', async () => {
    runtime.epoch = 0;
    vi.stubGlobal('location', { pathname: '/watch/100', origin: 'https://www.netflix.com' });
    vi.stubGlobal('defineUnlistedScript', (definition: any) => definition);
    let handler!: (event: MessageEvent) => Promise<void>;
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, callback: any) => {
      if (type === 'message') handler = callback;
    });
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    let finishFirst!: (result: any) => void;
    vi.mocked(hydrateNetflixTrackUrl).mockReset().mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
    const entry = await import('@/entrypoints/netflix-main');
    (entry.default as any).main();
    const command = (requestId: string) => handler({
      source: window, origin: 'https://www.netflix.com', data: {
        source: BRIDGE.CONTENT_SOURCE, type: BRIDGE.messageType.HYDRATE_TRACK,
        requestId, trackId: 'zh', expectedLanguage: 'zh-Hant', videoId: '100',
      },
    } as unknown as MessageEvent);
    const first = command('first');
    await Promise.resolve();
    const queued = command('queued');
    vi.stubGlobal('location', { pathname: '/watch/200', origin: 'https://www.netflix.com' });
    finishFirst({ ok: true, url: 'https://cdn.test/old' });
    await Promise.all([first, queued]);
    expect(hydrateNetflixTrackUrl).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'first', ok: false, reason: 'video-changed' }), 'https://www.netflix.com');
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'queued', ok: false, reason: 'video-changed' }), 'https://www.netflix.com');
  });

  it.each(['/watch/200', '/watch/100'])('rejects an old download command delivered on %s in a newer scope', async (pathname) => {
    runtime.epoch = 2;
    vi.stubGlobal('location', { pathname, origin: 'https://www.netflix.com' });
    vi.stubGlobal('defineUnlistedScript', (definition: any) => definition);
    const fetchResource = vi.fn(); vi.stubGlobal('fetch', fetchResource);
    let handler!: (event: MessageEvent) => Promise<void>;
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, callback: any) => {
      if (type === 'message') handler = callback;
    });
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    const entry = await import('@/entrypoints/netflix-main'); (entry.default as any).main();
    await handler({ source: window, origin: 'https://www.netflix.com', data: {
      source: BRIDGE.CONTENT_SOURCE, type: BRIDGE.messageType.FETCH_TTML,
      requestId: 'old-download', url: 'https://cdn.nflxvideo.net/old.ttml', videoId: '100', scopeEpoch: 0,
    } } as unknown as MessageEvent);
    expect(fetchResource).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'old-download', ok: false, reason: 'video-changed' }), 'https://www.netflix.com');
  });
});

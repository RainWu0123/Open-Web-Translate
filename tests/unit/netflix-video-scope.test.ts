import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetflixTrackDiscovery } from '@/adapters/netflix/netflix-track-discovery';

const japanese = { trackId: 'ja', bcp47: 'ja', displayName: '日本語', url: 'https://cdn.test/ja.ttml' };
const traditional = { trackId: 'zh', bcp47: 'zh-Hant', displayName: '繁體中文', url: 'https://cdn.test/zh.ttml' };
let discovery: NetflixTrackDiscovery;

function watch(id: string) {
  vi.stubGlobal('location', { pathname: `/watch/${id}`, href: `https://www.netflix.com/watch/${id}`, origin: 'https://www.netflix.com' });
}

function manifest(id: string, tracks: unknown[]) {
  return JSON.stringify({ movieId: id, timedtexttracks: tracks });
}

describe('Netflix film-scoped track discovery', () => {
  beforeEach(() => { watch('100'); });
  afterEach(() => { discovery?.stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('keeps Traditional Chinese and CC when a later player poll only reports Japanese', () => {
    discovery = new NetflixTrackDiscovery();
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    (discovery as any).emit('manifest', [japanese, { ...japanese, trackId: 'ja-cc', isClosedCaptions: true }, traditional]);
    (discovery as any).emit('cadmium_active_poll', [{ trackId: 'ja', bcp47: 'ja' }]);

    expect(discovery.lastPayload().tracks).toHaveLength(3);
    const payload = post.mock.calls.at(-1)?.[0];
    expect(payload.tracks).toContainEqual(expect.objectContaining({ trackId: 'zh', label: '繁體中文', language: 'zh-Hant', url: traditional.url }));
    expect(payload.tracks).toContainEqual(expect.objectContaining({ trackId: 'ja-cc', isCC: true }));
  });

  it('publishes label-only updates and preserves metadata during partial updates', () => {
    discovery = new NetflixTrackDiscovery();
    (discovery as any).emit('manifest', [{ ...traditional, displayName: 'zh' }]);
    const revision = discovery.lastPayload().revision;
    (discovery as any).emit('metadata', [{ trackId: 'zh', displayName: '繁體中文' }]);
    expect(discovery.lastPayload().revision).toBeGreaterThan(revision);
    expect(discovery.lastPayload().tracks[0]).toMatchObject({ label: '繁體中文', language: 'zh-Hant', url: traditional.url });
  });

  it('clears tracks on A → B → A and keeps revisions monotonic', () => {
    discovery = new NetflixTrackDiscovery();
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    (discovery as any).emit('manifest', [traditional]);
    const oldScope = discovery.captureScope();
    const revision = discovery.lastPayload().revision;
    watch('200');
    expect(discovery.lastPayload().tracks).toEqual([]);
    expect(post.mock.calls.at(-1)?.[0]).toMatchObject({ videoId: '200', tracks: [] });
    watch('100');
    expect(discovery.lastPayload().tracks).toEqual([]);
    expect(discovery.isCurrentScope(oldScope)).toBe(false);
    expect(discovery.lastPayload().revision).toBeGreaterThan(revision);
  });

  it('does not relabel an old player as the next film, and accepts a new session', () => {
    let sessions = ['watch-old'];
    const players: Record<string, any> = {
      'watch-old': { getTimedTextTrackList: () => [traditional] },
      'watch-new': { getTimedTextTrackList: () => [{ ...japanese, url: 'https://cdn.test/new-ja' }] },
    };
    vi.stubGlobal('netflix', { appContext: { state: { playerApp: { getAPI: () => ({ videoPlayer: {
      getAllPlayerSessionIds: () => sessions,
      getVideoPlayerBySessionId: (id: string) => players[id],
    } }) } } } });
    discovery = new NetflixTrackDiscovery();
    discovery.pollOnce();
    watch('200');
    discovery.pollOnce();
    expect(discovery.lastPayload().tracks).toEqual([]);
    sessions = ['watch-old', 'watch-new'];
    discovery.pollOnce();
    expect(discovery.lastPayload().tracks).toHaveLength(1);
    expect(discovery.lastPayload().tracks[0].url).toBe('https://cdn.test/new-ja');
    const scope = discovery.captureScope();
    sessions = [];
    expect(discovery.captureScope()).toEqual(scope);
    sessions = ['watch-new'];
    expect(discovery.captureScope()).toEqual(scope);
  });

  it('rejects a fetch started on the previous film before parsing its manifest', async () => {
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { resolveFetch = resolve; })));
    discovery = new NetflixTrackDiscovery();
    discovery.start();
    const old = fetch('https://www.netflix.com/manifest');
    watch('200');
    discovery.captureScope();
    resolveFetch(new Response(manifest('100', [traditional])));
    await old;
    await Promise.resolve();
    expect(discovery.lastPayload().tracks).toEqual([]);
  });

  it('rejects a response body finishing after navigation even when film A is reopened', async () => {
    let resolveBody!: (text: string) => void;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      headers: new Headers(), clone: () => ({ text: () => new Promise<string>(resolve => { resolveBody = resolve; }) }),
    })));
    discovery = new NetflixTrackDiscovery();
    discovery.start();
    await fetch('https://www.netflix.com/manifest');
    watch('200'); discovery.captureScope();
    watch('100'); discovery.captureScope();
    resolveBody(manifest('100', [traditional]));
    await Promise.resolve(); await Promise.resolve();
    expect(discovery.lastPayload().tracks).toEqual([]);
  });

  it('ignores a late XHR subtitle request from the previous film', () => {
    vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => {});
    discovery = new NetflixTrackDiscovery();
    discovery.start();
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://cdn.nflxvideo.net/old.ttml');
    Object.defineProperties(xhr, {
      status: { value: 200 }, responseType: { value: 'text' },
      responseText: { value: '<tt xml:lang="zh-Hant"><body><p>舊片</p></body></tt>' },
    });
    vi.spyOn(xhr, 'getResponseHeader').mockReturnValue('text/xml');
    watch('200'); discovery.captureScope();
    xhr.dispatchEvent(new Event('load'));
    expect(discovery.lastPayload().tracks).toEqual([]);
  });

  it('accepts identified manifests after navigation but rejects unscoped global parses', () => {
    discovery = new NetflixTrackDiscovery(); discovery.start();
    JSON.parse(manifest('100', [japanese]));
    watch('200'); discovery.captureScope();
    JSON.parse(JSON.stringify({ timedtexttracks: [traditional] }));
    JSON.parse(manifest('100', [traditional]));
    expect(discovery.lastPayload().tracks).toEqual([]);
    JSON.parse(manifest('200', [traditional]));
    expect(discovery.lastPayload().tracks[0].language).toBe('zh-Hant');
  });

  it('does not bind an old hydration URL onto a new film with the same track ID', () => {
    discovery = new NetflixTrackDiscovery();
    (discovery as any).emit('manifest', [traditional]);
    const scope = discovery.captureScope();
    watch('200'); discovery.captureScope();
    (discovery as any).emit('manifest', [{ ...traditional, url: 'https://cdn.test/new-zh' }]);
    discovery.bindHydratedUrl('zh', 'https://cdn.test/old-zh', scope);
    expect(discovery.lastPayload().tracks[0].url).toBe('https://cdn.test/new-zh');
  });

  it('notifies content immediately when MAIN history navigation switches films', () => {
    vi.spyOn(history, 'pushState').mockImplementation((_state, _unused, url) => {
      const id = String(url).split('/').at(-1)!;
      watch(id);
    });
    discovery = new NetflixTrackDiscovery(); discovery.start();
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    (discovery as any).emit('manifest', [traditional]);
    history.pushState(null, '', '/watch/200');
    expect(post.mock.calls.at(-1)?.[0]).toMatchObject({ videoId: '200', tracks: [] });
  });

  it('does not turn historical performance resources into subtitle tracks', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ name: 'https://cdn.test/old-ja.vtt', startTime: 0 }] as PerformanceEntry[]);
    discovery = new NetflixTrackDiscovery();
    discovery.pollOnce();
    expect(discovery.lastPayload().tracks).toEqual([]);
  });

  it('does not rediscover tracks from an OWT-initiated subtitle download', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<tt xml:lang="zh-Hant"><body><p>字幕</p></body></tt>', { headers: { 'content-type': 'text/xml' } })));
    discovery = new NetflixTrackDiscovery(); discovery.start();
    await discovery.fetchResource(discovery.captureScope(), 'https://cdn.nflxvideo.net/owt.ttml');
    await Promise.resolve(); await Promise.resolve();
    expect(discovery.lastPayload().tracks).toEqual([]);
  });
});

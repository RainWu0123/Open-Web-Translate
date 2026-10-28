import { afterEach, describe, expect, it, vi } from 'vitest';
import { YT_BRIDGE } from '@/adapters/youtube/youtube-bridge';

describe('YouTube MAIN subtitle request video scope', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('rejects a previous video URL before fetching or caching it', async () => {
    vi.stubGlobal('defineUnlistedScript', (definition: any) => definition);
    vi.stubGlobal('location', { search: '?v=videoB', origin: 'https://www.youtube.com' });
    const player = document.createElement('div') as any;
    player.id = 'movie_player';
    player.loadModule = () => {};
    player.getOption = (_module: string, key: string) => key === 'tracklist'
      ? [{ languageCode: 'en', vss_id: '.en', baseUrl: 'https://www.youtube.com/api/timedtext?v=videoA&lang=en' }] : null;
    document.body.appendChild(player);
    let handler!: (event: MessageEvent) => void;
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, callback: any) => { if (type === 'message') handler = callback; });
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const entry = await import('@/entrypoints/youtube-main');
    (entry.default as any).main();
    handler({ source: window, data: { source: YT_BRIDGE.CONTENT_SOURCE, type: YT_BRIDGE.messageType.FETCH_TIMEDTEXT,
      requestId: 'old-url', languageCode: 'en', baseUrl: 'https://www.youtube.com/api/timedtext?v=videoA&lang=en' } } as unknown as MessageEvent);
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'old-url', ok: false }), 'https://www.youtube.com'));
    expect(fetchMock).not.toHaveBeenCalled();
    player.remove();
  });

  it('does not cache an old video response that finishes after navigating', async () => {
    vi.stubGlobal('defineUnlistedScript', (definition: any) => definition);
    const loc = { search: '?v=videoA', origin: 'https://www.youtube.com' };
    vi.stubGlobal('location', loc);
    const player = document.createElement('div') as any;
    player.id = 'movie_player'; player.loadModule = () => {};
    player.getOption = (_module: string, key: string) => key === 'tracklist'
      ? [{ languageCode: 'en', vss_id: '.en', baseUrl: `https://www.youtube.com/api/timedtext${loc.search}&lang=en` }] : null;
    document.body.appendChild(player);
    let handler!: (event: MessageEvent) => void;
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, callback: any) => { if (type === 'message') handler = callback; });
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    let finishOld!: (response: any) => void;
    const fetchMock = vi.fn().mockImplementation((url: string) => url.includes('videoA')
      ? new Promise(resolve => { finishOld = resolve; })
      : Promise.resolve({ ok: true, text: async () => 'new video subtitles' }));
    vi.stubGlobal('fetch', fetchMock);
    const entry = await import('@/entrypoints/youtube-main');
    (entry.default as any).main();
    const request = (requestId: string) => handler({ source: window, data: { source: YT_BRIDGE.CONTENT_SOURCE,
      type: YT_BRIDGE.messageType.FETCH_TIMEDTEXT, requestId, languageCode: 'en' } } as unknown as MessageEvent);
    request('old');
    await vi.waitFor(() => expect(finishOld).toBeDefined());
    loc.search = '?v=videoB';
    request('new');
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'new', ok: true, payload: 'new video subtitles' }), 'https://www.youtube.com'));
    finishOld({ ok: true, text: async () => 'old video subtitles' });
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'old', ok: false }), 'https://www.youtube.com'));
    request('new-again');
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'new-again', ok: true, payload: 'new video subtitles' }), 'https://www.youtube.com'));
    player.remove();
  });
});

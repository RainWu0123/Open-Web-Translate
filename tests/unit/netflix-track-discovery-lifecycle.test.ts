import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetflixTrackDiscovery, extractCandidateRepresentations } from '@/adapters/netflix/netflix-track-discovery';

describe('NetflixTrackDiscovery global hook lifecycle', () => {
  it('captures an anonymous CDN XML response and preserves it on metadata-only polling', async () => {
    const xml = '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xml:lang="ja"><body><div><p begin="1s" end="2s">字幕</p></div></body></tt>';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(xml, { headers: { 'content-type': 'application/xml' } })));
    const discovery = new NetflixTrackDiscovery();
    discovery.start();
    try {
      await window.fetch('https://cdn.nflxvideo.net/?o=1');
      await new Promise(resolve => setTimeout(resolve, 20));
      const captured = discovery.lastPayload().tracks[0];
      expect(captured).toMatchObject({ language: 'ja', url: 'https://cdn.nflxvideo.net/?o=1' });
      (discovery as any).emit('cadmium_active_poll', [{ trackId: captured.id, bcp47: 'ja' }]);
      expect(discovery.lastPayload().tracks[0].url).toBe(captured.url);
    } finally { discovery.stop(); }
  });

  it('recognizes IMSC text separately from IMSC images', () => {
    expect(extractCandidateRepresentations({ ttDownloadables: {
      'imsc1.1-text': { downloadUrls: ['https://cdn.test/text'] },
      'imsc1.1-image': { downloadUrls: ['https://cdn.test/image'] },
    } }).map(c => c.isText)).toEqual([true, false]);
  });

  it('captures anonymous XML downloaded through XMLHttpRequest as an ArrayBuffer', () => {
    const originalOpen = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn());
    const discovery = new NetflixTrackDiscovery();
    discovery.start();
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'https://cdn.nflxvideo.net/?o=2');
      const bytes = new TextEncoder().encode('<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="ja"><body><p begin="1s" end="2s">字幕</p></body></tt>');
      Object.defineProperties(xhr, {
        status: { value: 200 }, responseType: { value: 'arraybuffer' },
        response: { value: bytes.buffer }, responseURL: { value: 'https://cdn.nflxvideo.net/?o=2' },
      });
      vi.spyOn(xhr, 'getResponseHeader').mockReturnValue('application/xml');
      xhr.dispatchEvent(new Event('load'));
      expect(discovery.lastPayload().tracks[0]).toMatchObject({ language: 'ja', url: 'https://cdn.nflxvideo.net/?o=2' });
    } finally {
      discovery.stop();
      originalOpen.mockRestore();
    }
  });
  it('keeps the raw player metadata stable across repeated broadcasts and excludes Off', () => {
    const discovery = new NetflixTrackDiscovery();
    const raw = { trackId: 'ja', bcp47: 'ja', displayName: '日語', rawTrackType: 'CLOSEDCAPTIONS', isNoneTrack: false };
    (discovery as any).emit('cadmium_active_poll', [{ trackId: 'off', isNoneTrack: true }, raw]);
    for (let i = 0; i < 10; i++) discovery.rebroadcast();
    const tracks = discovery.lastPayload().tracks;
    expect(tracks).toHaveLength(1);
    expect(tracks[0].rawTrack).toBe(raw);
    expect(tracks[0].rawTrack.rawTrack).toBeUndefined();
    expect(tracks[0]).toMatchObject({ label: '日語', language: 'ja', isCC: true, url: '' });
    discovery.stop();
  });
  it('preserves manifest URLs and does not assign unrelated network resources to tracks', () => {
    vi.stubGlobal('netflix', { appContext: { state: { playerApp: { getAPI: () => ({ videoPlayer: {
      getAllPlayerSessionIds: () => ['watch-1'],
      getVideoPlayerBySessionId: () => ({ getTimedTextTrackList: () => [
        { trackId: 'ja-track', language: 'ja', ttDownloadables: { simplesdh: { downloadUrls: { a: 'https://cdn.test/correct' } } } },
        { trackId: 'fr-track', language: 'fr' },
      ] }),
    } }) } } } });
    vi.stubGlobal('performance', { getEntriesByType: () => [{ name: 'https://cdn.test/unrelated.vtt' }] });
    const discovery = new NetflixTrackDiscovery();
    discovery.pollOnce();
    expect(discovery.lastPayload().tracks.map(t => t.url)).toEqual(['https://cdn.test/correct', '']);
    discovery.stop();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores page fetch and JSON.parse when discovery stops', () => {
    const originalFetch = vi.fn(async () => new Response('{}')) as unknown as typeof window.fetch;
    vi.stubGlobal('fetch', originalFetch);
    const originalJsonParse = JSON.parse;

    const discovery = new NetflixTrackDiscovery();
    discovery.start();

    expect(window.fetch).not.toBe(originalFetch);
    expect(JSON.parse).not.toBe(originalJsonParse);

    discovery.stop();

    expect(window.fetch).toBe(originalFetch);
    expect(JSON.parse).toBe(originalJsonParse);
  });
});

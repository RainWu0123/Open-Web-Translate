import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetflixCaptionAdapter } from '@/adapters/netflix/netflix-caption-adapter';

vi.mock('@/infrastructure/messaging/message-router', () => ({
  messageRouter: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    registerHandler: vi.fn(),
    listen: vi.fn(),
  },
}));

/**
 * Firefox recovery regression tests.
 *
 * Firefox has thrown DataCloneError when page-context scripts postMessage
 * certain payloads to content scripts. The recovery design mirrors every
 * TRACKS_UPDATED payload onto a CustomEvent carrying a JSON string, and the
 * TTML download must work over the MAIN-world bridge. These tests pin both
 * behaviours so the fallback channels cannot silently regress.
 */
describe('Netflix MAIN↔content bridge (Firefox fallback channels)', () => {
  let adapter: NetflixCaptionAdapter;

  // jsdom's window.postMessage enforces targetOrigin against its REAL origin,
  // so the mock must keep the real origin value (only hostname/pathname are faked).
  const realOrigin = window.location.origin;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.netflix.com',
        pathname: '/watch/82760632',
        origin: realOrigin,
        href: 'https://www.netflix.com/watch/82760632',
      },
      writable: true,
    });
    adapter = new NetflixCaptionAdapter();
    adapter.init();
  });

  afterEach(() => {
    adapter.stop();
  });

  it('receives tracks via the postMessage primary channel', () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        origin: window.location.origin,
        data: {
          channel: 'owt',
          type: 'OWT_NETFLIX_TRACKS_UPDATED',
          revision: 1,
          tracks: [{ trackId: 't1', language: 'en', bcp47: 'en', url: 'https://x/t1.dfxp' }],
        },
      }),
    );

    const state = adapter.getStateInfo();
    expect(state.discoveredTracksCount).toBe(1);
  });

  it('receives tracks via the owt:tracks-updated CustomEvent when postMessage fails (Firefox DataCloneError path)', () => {
    const payload = {
      channel: 'owt',
      type: 'OWT_NETFLIX_TRACKS_UPDATED',
      revision: 2,
      tracks: [
        { trackId: 't1', language: 'en', bcp47: 'en', url: 'https://x/t1.dfxp' },
        { trackId: 't2', language: 'zh-Hant', bcp47: 'zh-Hant', url: 'https://x/t2.dfxp' },
      ],
      source: 'JSON.parse deep intercept',
    };

    document.dispatchEvent(
      new CustomEvent('owt:tracks-updated', { detail: JSON.stringify(payload) }),
    );

    const state = adapter.getStateInfo();
    expect(state.discoveredTracksCount).toBe(2);
  });

  it('ignores malformed owt:tracks-updated payloads without throwing', () => {
    expect(() => {
      document.dispatchEvent(new CustomEvent('owt:tracks-updated', { detail: '{not-json' }));
    }).not.toThrow();
    expect(adapter.getStateInfo().discoveredTracksCount).toBe(0);
  });

  it('fetches TTML through the MAIN-world bridge when the page script answers OWT_NETFLIX_TTML_RESULT', async () => {
    const listener = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === 'OWT_NETFLIX_FETCH_TTML' && typeof data.requestId === 'string') {
        window.dispatchEvent(
          new MessageEvent('message', {
            source: window,
            origin: window.location.origin,
            data: {
              source: 'owt-netflix-main',
              type: 'OWT_NETFLIX_TTML_RESULT',
              requestId: data.requestId,
              ok: true,
              status: 200,
              detectedFormat: 'ttml',
              xml: '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="00:00:01.000" end="00:00:02.000">Hello</p></div></body></tt>',
            },
          }),
        );
      }
    };
    window.addEventListener('message', listener);

    try {
      const xml = await adapter.fetchTtmlXml('https://nflxvideo.net/ttml.dfxp');
      expect(xml).toContain('<tt');
    } finally {
      window.removeEventListener('message', listener);
    }
  });

  it('falls back to a direct fetch immediately when postMessage throws (DataCloneError path)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<tt>direct</tt>',
    });
    vi.stubGlobal('fetch', fetchMock);

    const postMessageSpy = vi
      .spyOn(window, 'postMessage')
      .mockImplementation(() => {
        // Firefox DataCloneError: postMessage rejects synchronously instead
        // of ever delivering the bridge request.
        throw new DOMException('could not be cloned', 'DataCloneError');
      });

    try {
      const xml = await adapter.fetchTtmlXml('https://nflxvideo.net/ttml.dfxp');
      expect(xml).toBe('<tt>direct</tt>');
      expect(fetchMock).toHaveBeenCalledWith('https://nflxvideo.net/ttml.dfxp');
    } finally {
      postMessageSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

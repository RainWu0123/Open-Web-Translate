import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetflixCaptionAdapter } from '@/adapters/netflix/netflix-caption-adapter';

vi.mock('@/infrastructure/messaging/message-router', () => ({
  messageRouter: {
    sendMessage: vi.fn(),
    registerHandler: vi.fn(),
    listen: vi.fn(),
  },
}));

describe('Netflix Triple Strategy Capture & State Messaging Unit Tests', () => {
  let adapter: NetflixCaptionAdapter;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    // Set hostname to netflix.com so init() proceeds
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'www.netflix.com',
        pathname: '/watch/82760632',
      },
      writable: true,
    });
    adapter = new NetflixCaptionAdapter();
  });

  afterEach(() => {
    if (adapter) {
      adapter.stop();
    }
  });

  it('returns valid state info via getStateInfo()', () => {
    const state = adapter.getStateInfo();
    expect(state).toBeDefined();
    expect(state.primaryStatus).toBeDefined();
    expect(state.secondaryStatus).toBeDefined();
    expect(state.modeLabel).toBeDefined();
  });

  it('updates discovered tracks count when OWT_NETFLIX_MANIFEST_TRACKS arrives from MAIN world', () => {
    adapter.init();

    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {
          source: 'owt-netflix-main',
          type: 'OWT_NETFLIX_MANIFEST_TRACKS',
          tracks: [
            { id: 't1', label: 'Japanese', language: 'ja', isCC: false },
            { id: 't2', label: 'Traditional Chinese', language: 'zh-Hant', isCC: false },
          ],
        },
      }),
    );

    const state = adapter.getStateInfo();
    expect(state.discoveredTracksCount).toBe(2);
  });
});

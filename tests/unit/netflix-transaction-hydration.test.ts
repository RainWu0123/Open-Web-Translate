import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetflixCaptionAdapter } from '@/adapters/netflix/netflix-caption-adapter';

vi.mock('@/infrastructure/messaging/message-router', () => ({
  messageRouter: {
    sendMessage: vi.fn(),
    registerHandler: vi.fn(),
    listen: vi.fn(),
  },
}));

describe('Netflix Transactional Hydration & Native Masking Unit Tests', () => {
  let adapter: NetflixCaptionAdapter;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    adapter = new NetflixCaptionAdapter();
  });

  afterEach(() => {
    if (adapter) {
      adapter.stop();
    }
  });

  it('hydrates tracks using manifest URL directly if available without triggering Cadmium switch', async () => {
    const track = {
      id: 'track_zh_text',
      label: 'Traditional Chinese',
      language: 'zh-Hant',
      url: 'https://cdn.netflix.com/sub/zh.xml',
      isCC: false,
      hasUrl: true,
    };

    const sampleXml = '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling"><body><div><p begin="00:00:01.000" end="00:00:03.000">你好世界</p></div></body></tt>';
    vi.spyOn(adapter as any, 'fetchTtmlXml').mockResolvedValue(sampleXml);

    const res = await adapter.hydrateTrack(track);
    expect(res.ok).toBe(true);
    expect(res.source).toBe('manifest');
    expect(res.cues?.length).toBe(1);
    expect(res.cues?.[0].text).toBe('你好世界');
  });

  it('applies visibility: hidden !important mask to native timed-text container when activated', () => {
    const nativeEl = document.createElement('div');
    nativeEl.className = 'player-timedtext';
    document.body.appendChild(nativeEl);

    (adapter as any).applyNativeSubtitleMask(true);

    const styleEl = document.getElementById('owt-hide-native-netflix-subtitles');
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain('visibility: hidden !important');

    (adapter as any).applyNativeSubtitleMask(false);
    expect(document.getElementById('owt-hide-native-netflix-subtitles')).toBeNull();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  NetflixTrackManager,
  isBitmapImsc,
  trackMatchesTargetLanguage,
} from '@/adapters/netflix/netflix-track-manager';
import mockManifestFixture from '../fixtures/netflix-manifest-bitmap.json';

describe('NetflixTrackManager Unit Tests', () => {
  let manager: NetflixTrackManager;

  beforeEach(() => {
    manager = new NetflixTrackManager();
  });

  it('correctly identifies IMSC1 Bitmap XML vs Text XML', () => {
    const bitmapXml1 = '<tt xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:profile="http://www.w3.org/ns/ttml/profile/imsc1/image"><head></head><body><div><image src="data:image/png;base64,..."/></div></body></tt>';
    const bitmapXml2 = '<tt><head></head><body><image src="http://cdn.com/sub.png"/></body></tt>';
    const textXml = '<tt xmlns:tts="http://www.w3.org/ns/ttml#styling"><head></head><body><div><p begin="00:00:01.000" end="00:00:03.000">Hello World</p></div></body></tt>';
    const bgImageXml = '<tt><head><style tts:backgroundImage="http://cdn.com/bg.png"/></head><body><p>Text</p></body></tt>';

    expect(isBitmapImsc(bitmapXml1)).toBe(true);
    expect(isBitmapImsc(bitmapXml2)).toBe(true);
    expect(isBitmapImsc(textXml)).toBe(false);
    expect(isBitmapImsc(bgImageXml)).toBe(false);
  });

  it('matches target language correctly for Chinese variants and English', () => {
    const zhTrack = { language: 'zh-Hant', label: '繁體中文' };
    const enTrack = { language: 'en', label: 'English' };

    expect(trackMatchesTargetLanguage(zhTrack, 'zh-TW')).toBe(true);
    expect(trackMatchesTargetLanguage(zhTrack, 'zh-CN')).toBe(true);
    expect(trackMatchesTargetLanguage(enTrack, 'en')).toBe(true);
    expect(trackMatchesTargetLanguage(enTrack, 'zh-TW')).toBe(false);
  });

  it('rescues IMSC1 bitmap tracks by extracting text profile URL from manifest downloadables', () => {
    const bitmapTrack = mockManifestFixture.tracks[0] as any;
    manager.setDiscoveredTracks([bitmapTrack]);

    const bestTrack = manager.findBestMatchingTrack('zh-TW');
    expect(bestTrack).toBeDefined();
    expect(bestTrack?.id).toBe('track_zh_bitmap');

    const rescuedUrl = manager.findTextFallbackUrl(bestTrack!);
    expect(rescuedUrl).toBe('https://cdn.netflix.com/sub/dfxp_text.xml');
  });

  it('transitions adapter state machine correctly', () => {
    manager.setAdapterState('discovering');
    expect(manager.getAdapterState()).toBe('discovering');

    manager.setAdapterState('loading_primary');
    expect(manager.getAdapterState()).toBe('loading_primary');

    manager.setAdapterState('overlay_ready');
    expect(manager.getAdapterState()).toBe('overlay_ready');
  });
});

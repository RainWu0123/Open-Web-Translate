import { describe, expect, it, vi } from 'vitest';
import {
  hydrateNetflixTrackUrl,
  subtitleLanguagesCompatible,
  type NetflixTimedTextPlayer,
} from '@/adapters/netflix/netflix-track-hydrator';

function resource(name: string, startTime = 100): PerformanceEntry {
  return { name, startTime, duration: 1, entryType: 'resource', toJSON: () => ({}) } as PerformanceEntry;
}

function playerWithTracks() {
  const tracks = [
    { trackId: 'en', bcp47: 'en', active: true },
    { trackId: 'zh-TW', bcp47: 'zh-TW', active: false },
    { trackId: 'ja', bcp47: 'ja', active: false },
  ];
  const player: NetflixTimedTextPlayer = {
    getTimedTextTrackList: () => tracks,
    setTimedTextTrack: vi.fn((selected: any) => {
      tracks.forEach((track) => { track.active = track === selected; });
    }),
    getCurrentTime: () => 100,
    seek: vi.fn(),
  };
  return { tracks, player };
}

describe('Netflix track hydration', () => {
  it('accepts compatible Chinese locale aliases but rejects the other script', () => {
    expect(subtitleLanguagesCompatible('zh-Hant', 'zh-TW')).toBe(true);
    expect(subtitleLanguagesCompatible('zh-Hant', 'zh')).toBe(true);
    expect(subtitleLanguagesCompatible('zh-Hant', 'zh-Hans')).toBe(false);
    expect(subtitleLanguagesCompatible('ja', 'en')).toBe(false);
  });

  it('verifies the TTML language and restores the original player track', async () => {
    const { tracks, player } = playerWithTracks();
    const url = 'https://ipv4-c001.nflxvideo.net/range/chinese-subtitle';
    let entries: PerformanceEntry[] = [];
    const result = await hydrateNetflixTrackUrl(player, 'zh-TW', 'zh-Hant', true, {
      resourceEntries: () => entries,
      wait: async () => { entries = [resource(url, performance.now())]; },
      fetchResource: vi.fn(async () => new Response(
        '<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="zh-TW"><body><div><p>字幕</p></div></body></tt>',
        { status: 200 },
      )),
    });

    expect(result).toEqual({ ok: true, url });
    expect(player.setTimedTextTrack).toHaveBeenNthCalledWith(1, tracks[1]);
    expect(player.setTimedTextTrack).toHaveBeenLastCalledWith(tracks[0]);
    expect(tracks[0].active).toBe(true);
    expect(player.seek).toHaveBeenCalledWith(100);
  });

  it('rejects an unrelated subtitle response and still restores the original track', async () => {
    const { tracks, player } = playerWithTracks();
    let entries: PerformanceEntry[] = [];
    const result = await hydrateNetflixTrackUrl(player, 'zh-TW', 'zh-Hant', false, {
      resourceEntries: () => entries,
      wait: async () => { entries = [resource('https://ipv4-c001.nflxvideo.net/range/japanese-subtitle', performance.now())]; },
      fetchResource: vi.fn(async () => new Response(
        '<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="ja"><body><div><p>字幕</p></div></body></tt>',
        { status: 200 },
      )),
    });

    expect(result).toEqual({ ok: false, reason: 'track-url-not-verified' });
    expect(tracks[0].active).toBe(true);
  });

  it('does not mutate the player when its current subtitle track is unknown', async () => {
    const { tracks, player } = playerWithTracks();
    tracks.forEach((track) => { track.active = false; });
    const result = await hydrateNetflixTrackUrl(player, 'zh-TW', 'zh-Hant', true, {
      resourceEntries: () => [],
      wait: vi.fn(async () => {}),
      fetchResource: vi.fn(),
    });

    expect(result).toEqual({ ok: false, reason: 'active-track-unknown' });
    expect(player.setTimedTextTrack).not.toHaveBeenCalled();
  });

  it('does not overwrite a third track selected while hydration is pending', async () => {
    const { tracks, player } = playerWithTracks();
    let entries: PerformanceEntry[] = [];
    await hydrateNetflixTrackUrl(player, 'zh-TW', 'zh-Hant', false, {
      resourceEntries: () => entries,
      wait: async () => {
        entries = [resource('https://ipv4-c001.nflxvideo.net/range/chinese-subtitle', performance.now())];
        tracks.forEach((track) => { track.active = track.trackId === 'ja'; });
      },
      fetchResource: vi.fn(async () => new Response(
        '<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="zh-TW"><body><div><p>字幕</p></div></body></tt>',
        { status: 200 },
      )),
    });

    expect(tracks[2].active).toBe(true);
    expect(player.setTimedTextTrack).toHaveBeenCalledTimes(1);
  });
});

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
  it('uses the player getter to switch to Traditional Chinese and restore Japanese without active flags', async () => {
    const tracks = [
      { trackId: 'T:2:1;1;ja;0;0;0;0;', bcp47: 'ja', displayName: '日語' },
      { trackId: 'T:2:0;1;zh-Hant;0;0;0;0;', bcp47: 'zh-Hant', displayName: '中文（繁體）' },
    ];
    let selected = tracks[0];
    let entries: PerformanceEntry[] = [];
    const player: NetflixTimedTextPlayer = {
      getTimedTextTrackList: () => tracks,
      getTimedTextTrack: () => ({ ...selected }),
      setTimedTextTrack: vi.fn(track => { selected = track as typeof selected; }),
    };
    const url = 'https://cdn.nflxvideo.net/traditional';
    const result = await hydrateNetflixTrackUrl(player, tracks[1].trackId, 'zh-Hant', false, {
      resourceEntries: () => entries,
      wait: async () => { entries = [resource(url, performance.now())]; },
      fetchResource: vi.fn(async () => new Response('<tt xml:lang="zh-Hant"><body><p>繁體字幕</p></body></tt>')),
    });
    expect(result).toEqual({ ok: true, url });
    expect(player.setTimedTextTrack).toHaveBeenNthCalledWith(1, tracks[1]);
    expect(player.setTimedTextTrack).toHaveBeenNthCalledWith(2, tracks[0]);
    expect(selected).toBe(tracks[0]);
  });

  it('does not overwrite the current track when the getter becomes unavailable during hydration', async () => {
    const tracks = [{ trackId: 'ja', bcp47: 'ja' }, { trackId: 'zh', bcp47: 'zh-Hant' }];
    let selected: typeof tracks[number] | null = tracks[0];
    const player: NetflixTimedTextPlayer = {
      getTimedTextTrackList: () => tracks,
      getTimedTextTrack: () => selected,
      setTimedTextTrack: vi.fn(track => { selected = track as typeof tracks[number]; }),
    };
    await hydrateNetflixTrackUrl(player, 'zh', 'zh-Hant', false, {
      resourceEntries: () => [], wait: async () => { selected = null; }, fetchResource: vi.fn(),
    });
    expect(player.setTimedTextTrack).toHaveBeenCalledTimes(1);
  });

  it('does not undo a third track selected by the viewer when the getter is available', async () => {
    const tracks = [{ trackId: 'ja' }, { trackId: 'zh' }, { trackId: 'en' }];
    let selected = tracks[0];
    const player: NetflixTimedTextPlayer = {
      getTimedTextTrackList: () => tracks,
      getTimedTextTrack: () => selected,
      setTimedTextTrack: vi.fn(track => { selected = track as typeof selected; }),
    };
    await hydrateNetflixTrackUrl(player, 'zh', 'zh-Hant', false, {
      resourceEntries: () => [], wait: async () => { selected = tracks[2]; }, fetchResource: vi.fn(),
    });
    expect(selected).toBe(tracks[2]);
    expect(player.setTimedTextTrack).toHaveBeenCalledTimes(1);
  });
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

  it('does not switch a player for a queued request from the previous film', async () => {
    const { player } = playerWithTracks();
    const result = await hydrateNetflixTrackUrl(player, 'zh-TW', 'zh-Hant', true, {
      resourceEntries: () => [], wait: vi.fn(), fetchResource: vi.fn(), isCurrent: () => false,
    });
    expect(result).toEqual({ ok: false, reason: 'video-changed' });
    expect(player.setTimedTextTrack).not.toHaveBeenCalled();
  });

  it('does not restore a previous film selection when a shared player changes film while waiting', async () => {
    const { player } = playerWithTracks();
    let current = true;
    const result = await hydrateNetflixTrackUrl(player, 'zh-TW', 'zh-Hant', false, {
      resourceEntries: () => [], wait: async () => { current = false; }, fetchResource: vi.fn(), isCurrent: () => current,
    });
    expect(result).toEqual({ ok: false, reason: 'video-changed' });
    expect(player.setTimedTextTrack).toHaveBeenCalledTimes(1);
  });

  it('does not fetch the next old-film candidate after a failed validation crosses navigation', async () => {
    const { player } = playerWithTracks();
    let current = true;
    let entries: PerformanceEntry[] = [];
    const fetchResource = vi.fn(async () => {
      current = false;
      return new Response('<tt xml:lang="ja"><body><p>wrong language</p></body></tt>');
    });
    const result = await hydrateNetflixTrackUrl(player, 'zh-TW', 'zh-Hant', false, {
      resourceEntries: () => entries,
      wait: async () => { entries = [
        resource('https://cdn.nflxvideo.net/second', performance.now()),
        resource('https://cdn.nflxvideo.net/first', performance.now() + 1),
      ]; },
      fetchResource, isCurrent: () => current,
    });
    expect(result).toEqual({ ok: false, reason: 'video-changed' });
    expect(fetchResource).toHaveBeenCalledTimes(1);
    expect(fetchResource).toHaveBeenCalledWith('https://cdn.nflxvideo.net/first', expect.any(Object));
    expect(player.setTimedTextTrack).toHaveBeenCalledTimes(1);
  });
});

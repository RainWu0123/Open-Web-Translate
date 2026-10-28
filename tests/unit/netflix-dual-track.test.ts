import { describe, expect, it, vi } from 'vitest';
import { NetflixDualTrackController, mergeSubtitleTimelines, type DualTrackHost } from '@/adapters/netflix/netflix-dual-track';
import type { DiscoveredTrack } from '@/adapters/netflix/netflix-track-manager';

const track = (id: string, language: string): DiscoveredTrack => ({
  id,
  language,
  label: language,
  url: `https://example.test/${id}.ttml`,
  isCC: false,
  hasUrl: true,
});

describe('NetflixDualTrackController selection guards', () => {
  it('splits the timeline when the translated track changes during one original cue', () => {
    const segments = mergeSubtitleTimelines(
      [{ startMs: 1000, endMs: 4000, text: 'Original' }],
      [{ startMs: 1000, endMs: 2500, text: '第一句' }, { startMs: 2500, endMs: 4000, text: '第二句' }],
    );
    expect(segments.map(cue => [cue.startMs, cue.endMs, cue.primaryText, cue.secondaryText])).toEqual([
      [1000, 2499, 'Original', '第一句'], [2500, 3999, 'Original', '第二句'],
    ]);
  });
  it('clears a translated-only subtitle when its timeline ends', async () => {
    vi.useFakeTimers();
    try {
      let cueText = '';
      let onCue!: (cue: any) => void;
      let segments: any[] = [];
      const syncEngine = {
        stop: vi.fn(), setCues: vi.fn((cues: any[]) => { segments = cues; }),
        start: vi.fn((callback: (cue: any) => void) => { onCue = callback; }),
      } as any;
      const host: DualTrackHost = {
        fetchTtml: vi.fn(async url => url),
        parseTtml: vi.fn(url => url.includes('ja.ttml')
          ? [{ startMs: 1000, endMs: 2000, text: '原文' }]
          : [{ startMs: 1000, endMs: 3000, text: '譯文' }]),
        isActive: () => true, routeGeneration: () => 1,
        renderCueLine: vi.fn(), machineTranslateCue: vi.fn(async () => {}),
        clearLine: vi.fn(), setCueText: text => { cueText = text; }, getCueText: () => cueText,
        setSecondaryCues: vi.fn(), onDualLoaded: vi.fn(), fallbackToSingle: vi.fn(async () => {}),
      };
      const controller = new NetflixDualTrackController(host, syncEngine, vi.fn());
      await controller.load(track('ja', 'ja'), track('zh', 'zh-Hant'));
      onCue(segments[1]);
      expect(host.renderCueLine).toHaveBeenCalledWith('', '譯文');
      onCue(null);
      expect(host.clearLine).toHaveBeenCalledOnce();
      controller.reset();
    } finally { vi.useRealTimers(); }
  });
  it('does not reset shared sync or fallback after a stale dual-track request rejects', async () => {
    let rejectFetch!: (error: Error) => void;
    let current = true;
    const syncEngine = { stop: vi.fn(), setCues: vi.fn(), start: vi.fn() } as any;
    const host: DualTrackHost = {
      fetchTtml: vi.fn(() => new Promise<string>((_resolve, reject) => { rejectFetch = reject; })),
      parseTtml: vi.fn(() => []),
      isActive: () => true,
      routeGeneration: () => 1,
      renderCueLine: vi.fn(),
      machineTranslateCue: vi.fn(async () => {}),
      clearLine: vi.fn(),
      setCueText: vi.fn(),
      getCueText: () => '',
      setSecondaryCues: vi.fn(),
      onDualLoaded: vi.fn(),
      fallbackToSingle: vi.fn(async () => {}),
    };
    const controller = new NetflixDualTrackController(host, syncEngine, vi.fn());
    const loading = controller.load(track('en', 'en'), track('zh', 'zh-Hant'), () => current);
    current = false;
    rejectFetch(new Error('old request failed'));

    await expect(loading).resolves.toBe(false);
    expect(syncEngine.stop).not.toHaveBeenCalled();
    expect(host.fallbackToSingle).not.toHaveBeenCalled();
  });
});

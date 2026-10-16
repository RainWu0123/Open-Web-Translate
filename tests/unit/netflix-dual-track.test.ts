import { describe, expect, it, vi } from 'vitest';
import { NetflixDualTrackController, type DualTrackHost } from '@/adapters/netflix/netflix-dual-track';
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

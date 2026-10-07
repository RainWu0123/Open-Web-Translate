import { describe, expect, it, vi } from 'vitest';
import { NetflixAiPrefetchController } from '@/adapters/netflix/netflix-ai-prefetch';
import type { SubtitleCue } from '@/shared/subtitles/ttml-parser';
import type { DiscoveredTrack } from '@/adapters/netflix/netflix-track-manager';

class FakeSyncEngine {
  cues: SubtitleCue[] = [];
  callback: ((cue: SubtitleCue | null, videoMs: number) => void) | null = null;

  setCues(cues: SubtitleCue[]) {
    this.cues = cues;
  }

  start(cb: (cue: SubtitleCue | null, videoMs: number) => void) {
    this.callback = cb;
  }

  stop() {
    this.callback = null;
  }

  emit(index: number, videoMs: number) {
    this.callback?.(this.cues[index] ?? null, videoMs);
  }
}

function makeCues(count: number): SubtitleCue[] {
  return Array.from({ length: count }, (_, index) => ({
    startMs: index * 2500,
    endMs: index * 2500 + 2200,
    text: `Line ${index}`,
  }));
}

function makeTrack(): DiscoveredTrack {
  return {
    id: 'ja-track',
    label: '日本語',
    language: 'ja',
    url: 'https://example.test/subtitles.ttml',
    isCC: false,
    hasUrl: true,
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('NetflixAiPrefetchController', () => {
  it('loads the full source timeline but translates only a nearby batch', async () => {
    const sync = new FakeSyncEngine();
    const cues = makeCues(100);
    const translateBatch = vi.fn(async (segments: Array<{ id: string; text: string }>) =>
      segments.map((segment) => ({ id: segment.id, translatedText: `譯:${segment.text}` })),
    );
    const renderCueLine = vi.fn();

    const controller = new NetflixAiPrefetchController(
      {
        fetchTtml: vi.fn().mockResolvedValue('<tt/>'),
        parseTtml: vi.fn().mockReturnValue(cues),
        isActive: () => true,
        routeGeneration: () => 7,
        currentVideoMs: () => 25_000,
        targetLanguage: () => 'zh-Hant',
        translateBatch,
        renderCueLine,
        clearLine: vi.fn(),
        onTimelineChanged: vi.fn(),
      },
      sync as any,
    );

    await expect(controller.load(makeTrack())).resolves.toBe(true);
    await flushAsyncWork();

    expect(controller.timeline()).toHaveLength(100);
    expect(translateBatch).toHaveBeenCalled();
    const firstBatch = translateBatch.mock.calls[0][0];
    expect(firstBatch.length).toBeGreaterThan(1);
    expect(firstBatch.length).toBeLessThanOrEqual(40);
    expect(firstBatch.some((segment: { text: string }) => segment.text === 'Line 10')).toBe(true);

    sync.emit(10, 25_000);
    expect(renderCueLine).toHaveBeenLastCalledWith('Line 10', '譯:Line 10', 'ready');
  });

  it('reprioritizes around a seek instead of waiting for earlier subtitles', async () => {
    const sync = new FakeSyncEngine();
    const cues = makeCues(120);
    const translatedIds = new Set<string>();
    const translateBatch = vi.fn(async (segments: Array<{ id: string; text: string }>) => {
      for (const segment of segments) translatedIds.add(segment.id);
      return segments.map((segment) => ({ id: segment.id, translatedText: `T:${segment.text}` }));
    });

    const controller = new NetflixAiPrefetchController(
      {
        fetchTtml: vi.fn().mockResolvedValue('<tt/>'),
        parseTtml: vi.fn().mockReturnValue(cues),
        isActive: () => true,
        routeGeneration: () => 3,
        currentVideoMs: () => 0,
        targetLanguage: () => 'en',
        translateBatch,
        renderCueLine: vi.fn(),
        clearLine: vi.fn(),
        onTimelineChanged: vi.fn(),
      },
      sync as any,
    );

    await controller.load(makeTrack());
    await flushAsyncWork();
    const callsBeforeSeek = translateBatch.mock.calls.length;

    sync.emit(80, 200_000);
    await flushAsyncWork();

    expect(translateBatch.mock.calls.length).toBeGreaterThan(callsBeforeSeek);
    const seekBatch = translateBatch.mock.calls.at(-1)?.[0] ?? [];
    expect(seekBatch.some((segment: { text: string }) => segment.text === 'Line 80')).toBe(true);
  });

  it('ignores completed work after the route generation changes', async () => {
    const sync = new FakeSyncEngine();
    const cues = makeCues(20);
    let generation = 1;
    let resolveBatch!: (value: Array<{ id: string; translatedText: string }>) => void;
    const translateBatch = vi.fn(
      (segments: Array<{ id: string; text: string }>) =>
        new Promise<Array<{ id: string; translatedText: string }>>((resolve) => {
          resolveBatch = resolve;
        }),
    );
    const renderCueLine = vi.fn();

    const controller = new NetflixAiPrefetchController(
      {
        fetchTtml: vi.fn().mockResolvedValue('<tt/>'),
        parseTtml: vi.fn().mockReturnValue(cues),
        isActive: () => true,
        routeGeneration: () => generation,
        currentVideoMs: () => 0,
        targetLanguage: () => 'zh-Hant',
        translateBatch,
        renderCueLine,
        clearLine: vi.fn(),
        onTimelineChanged: vi.fn(),
      },
      sync as any,
    );

    await controller.load(makeTrack());
    await Promise.resolve();
    generation = 2;
    resolveBatch(
      (translateBatch.mock.calls[0][0] as Array<{ id: string; text: string }>).map((segment) => ({
        id: segment.id,
        translatedText: `old:${segment.text}`,
      })),
    );
    await flushAsyncWork();

    sync.emit(0, 0);
    expect(renderCueLine).not.toHaveBeenCalledWith('Line 0', 'old:Line 0', 'ready');
  });
});

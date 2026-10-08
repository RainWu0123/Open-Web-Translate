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
  it('replenishes ahead during ordinary playback before reaching the original buffer boundary', async () => {
    const sync = new FakeSyncEngine();
    const translateBatch = vi.fn(async (segments: Array<{ id: string; text: string }>) =>
      segments.map(s => ({ id: s.id, translatedText: `T:${s.text}` })));
    const renderCueLine = vi.fn();
    const controller = new NetflixAiPrefetchController({
      fetchTtml: async () => '<tt/>', parseTtml: () => makeCues(120), isActive: () => true,
      routeGeneration: () => 1, currentVideoMs: () => 0, targetLanguage: () => 'zh-Hant',
      translateBatch, renderCueLine, clearLine: vi.fn(), onTimelineChanged: vi.fn(),
    }, sync as any);
    await controller.load(makeTrack());
    await flushAsyncWork();
    const initialCalls = translateBatch.mock.calls.length;
    for (let index = 0; index <= 20; index++) {
      sync.emit(index, index * 2500);
      await flushAsyncWork();
    }
    expect(translateBatch.mock.calls.slice(initialCalls).flatMap(call => call[0]).some(s => s.text === 'Line 48')).toBe(true);
    expect(renderCueLine.mock.calls.every(call => call[2] === 'ready')).toBe(true);
    controller.reset();
  });
  it('sends both surrounding dialogue and title before those subtitles appear', async () => {
    const sync = new FakeSyncEngine();
    const translateBatch = vi.fn(async (segments: any[]) => segments.map(s => ({ id: s.id, translatedText: `T:${s.text}` })));
    document.title = 'Medalist';
    const controller = new NetflixAiPrefetchController({
      fetchTtml: async () => '<tt/>', parseTtml: () => makeCues(100), isActive: () => true,
      routeGeneration: () => 1, currentVideoMs: () => 25000, targetLanguage: () => 'zh-Hant',
      translateBatch, renderCueLine: vi.fn(), clearLine: vi.fn(), onTimelineChanged: vi.fn(),
    }, sync as any);
    await controller.load(makeTrack()); await flushAsyncWork();
    const request = (translateBatch.mock.calls as any)[0];
    expect(request[4].title).toBe('Medalist');
    expect(request[4].previousText).toContain('Line 6');
    expect(request[4].nextText).toContain('Line 14');
    expect(request[0].map((s: any) => s.text)).toEqual(['Line 10', 'Line 11', 'Line 12', 'Line 13']);
    expect(controller.matches(makeTrack(), 'zh-Hant')).toBe(true);
    expect(controller.matches(makeTrack(), 'en')).toBe(false);
    controller.reset();
  });

  it('rejects stale translations after reloading the same track in the same episode', async () => {
    const sync = new FakeSyncEngine();
    let finishOld!: (value: any) => void;
    const translateBatch = vi.fn().mockImplementationOnce(() => new Promise(r => { finishOld = r; }))
      .mockImplementation(async (segments: any[]) => segments.map(s => ({ id: s.id, translatedText: `new:${s.text}` })));
    const renderCueLine = vi.fn();
    const controller = new NetflixAiPrefetchController({
      fetchTtml: async () => '<tt/>', parseTtml: () => makeCues(10), isActive: () => true,
      routeGeneration: () => 1, currentVideoMs: () => 0, targetLanguage: () => 'zh-Hant',
      translateBatch, renderCueLine, clearLine: vi.fn(), onTimelineChanged: vi.fn(),
    }, sync as any);
    await controller.load(makeTrack()); await controller.load(makeTrack()); await flushAsyncWork();
    finishOld([{ id: 'nf-ai-1-0', translatedText: 'stale' }]); await flushAsyncWork();
    sync.emit(0, 0);
    expect(renderCueLine).toHaveBeenLastCalledWith('Line 0', 'new:Line 0', 'ready');
    controller.reset();
  });

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
    expect(firstBatch.length).toBeLessThanOrEqual(4);
    expect(firstBatch[0].text).toBe('Line 10');
    expect(firstBatch.some((segment: { text: string }) => segment.text === 'Line 0')).toBe(false);
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
    const batchesAfterSeek = translateBatch.mock.calls.slice(callsBeforeSeek).map((call) => call[0]);
    expect(batchesAfterSeek.some((batch) => batch.some((segment: { text: string }) => segment.text === 'Line 80'))).toBe(true);
    expect(batchesAfterSeek[0]).toHaveLength(4);
  });

  it('waits for the real playback position when the video element is not ready', async () => {
    const sync = new FakeSyncEngine();
    const translateBatch = vi.fn(async (segments: Array<{ id: string; text: string }>) =>
      segments.map((segment) => ({ id: segment.id, translatedText: `T:${segment.text}` })),
    );
    const controller = new NetflixAiPrefetchController(
      {
        fetchTtml: vi.fn().mockResolvedValue('<tt/>'),
        parseTtml: vi.fn().mockReturnValue(makeCues(120)),
        isActive: () => true,
        routeGeneration: () => 4,
        currentVideoMs: () => null,
        targetLanguage: () => 'zh-Hant',
        translateBatch,
        renderCueLine: vi.fn(),
        clearLine: vi.fn(),
        onTimelineChanged: vi.fn(),
      },
      sync as any,
    );

    await controller.load(makeTrack());
    await flushAsyncWork();
    expect(translateBatch).not.toHaveBeenCalled();

    sync.emit(80, 200_000);
    await flushAsyncWork();
    expect(translateBatch.mock.calls[0][0].map((segment) => segment.text)).toEqual([
      'Line 80', 'Line 81', 'Line 82', 'Line 83',
    ]);
  });

  it('shrinks a failed urgent batch to the current cue before continuing', async () => {
    const sync = new FakeSyncEngine();
    const translateBatch = vi.fn()
      .mockRejectedValueOnce(new Error('[gemini-provider] request timed out after 15000ms'))
      .mockImplementation(async (segments: Array<{ id: string; text: string }>) =>
        segments.map((segment) => ({ id: segment.id, translatedText: `T:${segment.text}` })),
      );
    const renderCueLine = vi.fn();
    const controller = new NetflixAiPrefetchController(
      {
        fetchTtml: vi.fn().mockResolvedValue('<tt/>'),
        parseTtml: vi.fn().mockReturnValue(makeCues(30)),
        isActive: () => true,
        routeGeneration: () => 5,
        currentVideoMs: () => 25_000,
        targetLanguage: () => 'zh-Hant',
        translateBatch,
        renderCueLine,
        clearLine: vi.fn(),
        onTimelineChanged: vi.fn(),
      },
      sync as any,
    );

    await controller.load(makeTrack());
    sync.emit(10, 25_000);
    await flushAsyncWork();

    expect(translateBatch.mock.calls[0][0]).toHaveLength(4);
    expect(translateBatch.mock.calls[1][0].map((segment: { text: string }) => segment.text)).toEqual(['Line 10']);
    expect(renderCueLine).toHaveBeenLastCalledWith('Line 10', 'T:Line 10', 'ready');
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

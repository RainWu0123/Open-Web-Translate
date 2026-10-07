import type { SubtitleCue } from '@/shared/subtitles/ttml-parser';
import type { DiscoveredTrack } from './netflix-track-manager';
import { NetflixSyncEngine } from './netflix-sync-engine';
import { createLogger } from '@/shared/logger';

const logger = createLogger('NetflixAiPrefetch');

type AiCue = SubtitleCue & {
  id: string;
  index: number;
};

export type AiPrefetchRenderState = 'ready' | 'pending' | 'error';

export interface NetflixAiPrefetchHost {
  fetchTtml(url: string): Promise<string>;
  parseTtml(xml: string): SubtitleCue[];
  isActive(): boolean;
  routeGeneration(): number;
  currentVideoMs(): number;
  targetLanguage(): string;
  translateBatch(
    segments: Array<{ id: string; text: string }>,
    sourceLanguage: string,
    targetLanguage: string,
    generation: number,
  ): Promise<Array<{ id: string; translatedText: string }>>;
  renderCueLine(primaryText: string, secondaryText: string, state: AiPrefetchRenderState): void;
  clearLine(): void;
  onTimelineChanged(): void;
}

export class NetflixAiPrefetchController {
  private active = false;
  private sourceTrackId = '';
  private sourceLanguage = 'auto';
  private cues: AiCue[] = [];
  private translations = new Map<string, string>();
  private pending = new Set<string>();
  private currentCue: AiCue | null = null;
  private lastCueIndex = -1;
  private prefetchedUntilIndex = -1;
  private clearGraceTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly cueLimit = 40;
  private readonly windowMs = 90_000;
  private readonly refillThreshold = 15;
  private readonly clearGraceMs = 1200;

  constructor(
    private host: NetflixAiPrefetchHost,
    private syncEngine: NetflixSyncEngine,
  ) {}

  public isActive(): boolean {
    return this.active;
  }

  public timeline(): Array<{ startMs: number; endMs: number }> {
    return this.cues.map((cue) => ({ startMs: cue.startMs, endMs: cue.endMs }));
  }

  public getSourceLanguage(): string {
    return this.sourceLanguage;
  }

  public getTranslatedCount(): number {
    return this.translations.size;
  }

  public reset(): void {
    this.stop();
    this.sourceTrackId = '';
    this.sourceLanguage = 'auto';
    this.cues = [];
    this.translations.clear();
    this.pending.clear();
    this.prefetchedUntilIndex = -1;
    this.lastCueIndex = -1;
  }

  public stop(): void {
    this.active = false;
    this.currentCue = null;
    if (this.clearGraceTimer !== null) {
      clearTimeout(this.clearGraceTimer);
      this.clearGraceTimer = null;
    }
    this.syncEngine.stop();
  }

  /**
   * Load the complete source subtitle track, then translate only the playback
   * neighbourhood. The full timing track is available immediately; translated
   * text is filled into an in-memory cue cache in rolling batches.
   */
  public async load(track: DiscoveredTrack): Promise<boolean> {
    const generation = this.host.routeGeneration();
    this.reset();

    try {
      const xml = await this.host.fetchTtml(track.url);
      if (!this.host.isActive() || this.host.routeGeneration() !== generation) return false;

      const parsed = this.host.parseTtml(xml);
      if (parsed.length === 0) throw new Error('empty source track');

      this.cues = parsed.map((cue, index) => ({
        ...cue,
        id: `nf-ai-${generation}-${index}`,
        index,
      }));
      this.sourceTrackId = String(track.id);
      this.sourceLanguage = track.language || 'auto';
      this.active = true;

      this.syncEngine.setCues(this.cues);
      this.syncEngine.start((rawCue, videoMs) => {
        this.onCueChange(rawCue as AiCue | null, videoMs);
      });
      this.host.onTimelineChanged();

      const anchor = this.findAnchorIndex(this.host.currentVideoMs());
      if (anchor >= 0) void this.prefetchWindow(anchor, true);

      logger.info('AI subtitle prefetch mode active', {
        sourceTrackId: this.sourceTrackId,
        sourceLanguage: this.sourceLanguage,
        cues: this.cues.length,
        anchor,
      });
      return true;
    } catch (error) {
      logger.warn('Failed to start AI subtitle prefetch mode', error);
      this.reset();
      return false;
    }
  }

  private onCueChange(rawCue: AiCue | null, _videoMs: number): void {
    if (!this.active || !this.host.isActive()) return;

    if (!rawCue) {
      this.currentCue = null;
      if (this.clearGraceTimer === null) {
        this.clearGraceTimer = setTimeout(() => {
          this.clearGraceTimer = null;
          if (!this.currentCue) this.host.clearLine();
        }, this.clearGraceMs);
      }
      return;
    }

    if (this.clearGraceTimer !== null) {
      clearTimeout(this.clearGraceTimer);
      this.clearGraceTimer = null;
    }

    const cue = rawCue;
    const previousIndex = this.lastCueIndex;
    this.currentCue = cue;
    this.lastCueIndex = cue.index;

    const translated = this.translations.get(cue.id);
    if (translated) {
      this.host.renderCueLine(cue.text, translated, 'ready');
    } else {
      this.host.renderCueLine(cue.text, '翻譯中…', 'pending');
    }

    const jumped = previousIndex >= 0 && Math.abs(cue.index - previousIndex) > this.refillThreshold;
    if (!translated && !this.pending.has(cue.id)) {
      void this.prefetchWindow(cue.index, true);
      return;
    }

    if (jumped || cue.index >= this.prefetchedUntilIndex - this.refillThreshold) {
      void this.prefetchWindow(cue.index, jumped);
    }
  }

  private async prefetchWindow(anchorIndex: number, prioritizeCurrent: boolean): Promise<void> {
    if (!this.active || anchorIndex < 0 || anchorIndex >= this.cues.length) return;

    const generation = this.host.routeGeneration();
    const trackId = this.sourceTrackId;
    const startIndex = prioritizeCurrent ? Math.max(0, anchorIndex - 3) : anchorIndex;
    const startMs = this.cues[startIndex]?.startMs ?? 0;

    let endExclusive = startIndex;
    while (
      endExclusive < this.cues.length &&
      endExclusive - startIndex < this.cueLimit &&
      this.cues[endExclusive].startMs - startMs <= this.windowMs
    ) {
      endExclusive += 1;
    }

    this.prefetchedUntilIndex = Math.max(this.prefetchedUntilIndex, endExclusive - 1);

    const missing = this.cues
      .slice(startIndex, endExclusive)
      .filter((cue) => !this.translations.has(cue.id) && !this.pending.has(cue.id));

    if (missing.length === 0) return;

    for (const cue of missing) this.pending.add(cue.id);

    try {
      const translated = await this.host.translateBatch(
        missing.map((cue) => ({ id: cue.id, text: cue.text })),
        this.sourceLanguage,
        this.host.targetLanguage(),
        generation,
      );

      if (
        !this.active ||
        !this.host.isActive() ||
        this.host.routeGeneration() !== generation ||
        this.sourceTrackId !== trackId
      ) {
        return;
      }

      for (const result of translated) {
        if (result.translatedText?.trim()) {
          this.translations.set(result.id, result.translatedText);
        }
      }

      if (this.currentCue) {
        const currentTranslation = this.translations.get(this.currentCue.id);
        if (currentTranslation) {
          this.host.renderCueLine(this.currentCue.text, currentTranslation, 'ready');
        }
      }

      logger.debug('AI subtitle batch prefetched', {
        requested: missing.length,
        translated: translated.length,
        translatedTotal: this.translations.size,
        windowStart: startIndex,
        windowEnd: endExclusive - 1,
      });
    } catch (error) {
      logger.warn('AI subtitle prefetch batch failed', error);
      if (this.currentCue && missing.some((cue) => cue.id === this.currentCue?.id)) {
        this.host.renderCueLine(this.currentCue.text, '翻譯失敗，將於下一段重試', 'error');
      }
    } finally {
      for (const cue of missing) this.pending.delete(cue.id);
    }
  }

  private findAnchorIndex(currentMs: number): number {
    if (this.cues.length === 0) return -1;

    let low = 0;
    let high = this.cues.length - 1;
    let firstAfter = this.cues.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const cue = this.cues[mid];

      if (currentMs >= cue.startMs && currentMs <= cue.endMs) return mid;

      if (cue.startMs > currentMs) {
        firstAfter = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return Math.min(firstAfter, this.cues.length - 1);
  }
}

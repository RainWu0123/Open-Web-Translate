import type { SubtitleCue } from '@/shared/subtitles/ttml-parser';
import type { DiscoveredTrack } from './netflix-track-manager';
import { NetflixSyncEngine } from './netflix-sync-engine';
import { createLogger } from '@/shared/logger';
import type { TranslationContext } from '@/core/contracts/translation';
import { translate, type TranslationKey } from '@/shared/i18n';

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
  currentVideoMs(): number | null;
  targetLanguage(): string;
  translateBatch(
    segments: Array<{ id: string; text: string }>,
    sourceLanguage: string,
    targetLanguage: string,
    generation: number,
    context?: TranslationContext,
  ): Promise<Array<{ id: string; translatedText: string }>>;
  renderCueLine(primaryText: string, secondaryText: string, state: AiPrefetchRenderState): void;
  clearLine(): void;
  onTimelineChanged(): void;
  /** Use the configured UI locale, not the subtitle target language. */
  getStatusText?: (key: TranslationKey) => string;
}

export class NetflixAiPrefetchController {
  private active = false;
  private epoch = 0;
  private loadedTarget = '';
  private sourceTrackId = '';
  private sourceLanguage = 'auto';
  private cues: AiCue[] = [];
  private translations = new Map<string, string>();
  private pending = new Set<string>();
  private currentCue: AiCue | null = null;
  private lastCueIndex = -1;
  private priorityAnchorIndex = -1;
  private prefetchWindowEpoch = 0;
  private clearGraceTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly urgentCueLimit = 4;
  private readonly backgroundCueLimit = 8;
  private readonly charLimit = 3_500;
  private readonly windowMs = 90_000;
  private readonly seekThreshold = 6;
  private readonly clearGraceMs = 1200;

  constructor(
    private host: NetflixAiPrefetchHost,
    private syncEngine: NetflixSyncEngine,
  ) {}

  private status(key: TranslationKey): string {
    return this.host.getStatusText?.(key) ?? translate(undefined, key);
  }

  public isActive(): boolean {
    return this.active;
  }

  public matches(track: DiscoveredTrack, target: string): boolean {
    return this.active && this.sourceTrackId === String(track.id) && this.loadedTarget === target;
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
    this.priorityAnchorIndex = -1;
    this.prefetchWindowEpoch += 1;
    this.lastCueIndex = -1;
  }

  public stop(): void {
    this.epoch += 1;
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
    const epoch = this.epoch;
    const target = this.host.targetLanguage();

    try {
      const xml = await this.host.fetchTtml(track.url);
      if (epoch !== this.epoch || !this.host.isActive() || this.host.routeGeneration() !== generation || this.host.targetLanguage() !== target) return false;

      const parsed = this.host.parseTtml(xml);
      if (parsed.length === 0) throw new Error('empty source track');

      this.cues = [...parsed].sort((a, b) => a.startMs - b.startMs).map((cue, index) => ({
        ...cue,
        id: `nf-ai-${generation}-${index}`,
        index,
      }));
      this.sourceTrackId = String(track.id);
      this.sourceLanguage = track.language || 'auto';
      this.loadedTarget = target;
      this.active = true;

      this.syncEngine.setCues(this.cues);
      this.syncEngine.start((rawCue, videoMs) => {
        this.onCueChange(rawCue as AiCue | null, videoMs);
      });
      this.host.onTimelineChanged();

      const currentMs = this.host.currentVideoMs();
      const anchor = currentMs === null ? -1 : this.findAnchorIndex(currentMs);
      if (anchor >= 0) void this.prefetchWindow(anchor, { prioritizeCurrent: true });

      logger.info('AI subtitle prefetch mode active', {
        sourceTrackId: this.sourceTrackId,
        sourceLanguage: this.sourceLanguage,
        cues: this.cues.length,
        anchor,
      });
      return true;
    } catch (error) {
      if (epoch !== this.epoch) return false;
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
      this.host.renderCueLine(cue.text, this.status('subtitle.translatingLine'), 'pending');
    }

    const jumped = previousIndex >= 0 && Math.abs(cue.index - previousIndex) > this.seekThreshold;
    if (!translated && !this.pending.has(cue.id)) {
      void this.prefetchWindow(cue.index, { prioritizeCurrent: true });
      return;
    }

    if (jumped) {
      void this.prefetchWindow(cue.index, { prioritizeCurrent: true });
    } else if (this.pending.size === 0) {
      // Move the lookahead with playback, before the initial buffer runs out.
      const next = this.cues.findIndex((candidate) => candidate.index > cue.index &&
        candidate.startMs <= cue.startMs + 60_000 && !this.translations.has(candidate.id));
      if (next >= 0) void this.prefetchWindow(next, {
        prioritizeCurrent: false,
        horizonEndMs: cue.startMs + this.windowMs,
      });
    }
  }

  private async prefetchWindow(
    anchorIndex: number,
    options: {
      prioritizeCurrent: boolean;
      horizonEndMs?: number;
      windowEpoch?: number;
      batchLimit?: number;
      allowRescue?: boolean;
    },
  ): Promise<void> {
    if (!this.active || anchorIndex < 0 || anchorIndex >= this.cues.length) return;

    const { prioritizeCurrent } = options;
    if (prioritizeCurrent && this.priorityAnchorIndex !== anchorIndex) {
      this.priorityAnchorIndex = anchorIndex;
      this.prefetchWindowEpoch += 1;
    }
    const windowEpoch = options.windowEpoch ?? this.prefetchWindowEpoch;
    if (!prioritizeCurrent && windowEpoch !== this.prefetchWindowEpoch) return;

    const generation = this.host.routeGeneration();
    const epoch = this.epoch;
    const trackId = this.sourceTrackId;
    const target = this.loadedTarget;
    if (this.host.targetLanguage() !== target) return;
    const startIndex = anchorIndex;
    const startMs = this.cues[startIndex]?.startMs ?? 0;
    const horizonEndMs = options.horizonEndMs ?? startMs + this.windowMs;
    const cueLimit = options.batchLimit ?? (prioritizeCurrent ? this.urgentCueLimit : this.backgroundCueLimit);

    let endExclusive = startIndex;
    let chars = 0;
    while (
      endExclusive < this.cues.length &&
      endExclusive - startIndex < cueLimit &&
      this.cues[endExclusive].startMs <= horizonEndMs
    ) {
      const nextChars = this.cues[endExclusive].text.length;
      if (endExclusive > startIndex && chars + nextChars > this.charLimit) break;
      chars += nextChars;
      endExclusive += 1;
    }

    const batch = this.cues.slice(startIndex, endExclusive);
    const batchHasPending = batch.some((cue) => this.pending.has(cue.id));
    const missing = batch
      .filter((cue) => !this.translations.has(cue.id) && !this.pending.has(cue.id));

    if (missing.length === 0) {
      if (!batchHasPending) this.continuePrefetch(endExclusive, horizonEndMs, windowEpoch);
      return;
    }

    for (const cue of missing) this.pending.add(cue.id);
    let succeeded = false;
    let rescueIndex = -1;

    try {
      const translated = await this.host.translateBatch(
        missing.map((cue) => ({ id: cue.id, text: cue.text })),
        this.sourceLanguage,
        target,
        generation,
        {
          title: document.querySelector('[data-uia="video-title"]')?.textContent?.trim() || document.title,
          previousText: this.cues.slice(Math.max(0, startIndex - 8), startIndex).map(c => c.text).join('\n'),
          nextText: this.cues.slice(endExclusive, endExclusive + 8).map(c => c.text).join('\n'),
          previous: this.cues.slice(Math.max(0, startIndex - 8), startIndex)
            .filter(c => this.translations.has(c.id))
            .map(c => ({ source: c.text, translation: this.translations.get(c.id)! })),
        },
      );

      if (
        !this.active ||
        epoch !== this.epoch ||
        !this.host.isActive() ||
        this.host.routeGeneration() !== generation ||
        this.sourceTrackId !== trackId ||
        this.loadedTarget !== target ||
        this.host.targetLanguage() !== target
      ) {
        return;
      }

      // Never cache a result ID that did not belong to this exact batch.
      const requestedIds = new Set(missing.map(cue => cue.id));
      for (const result of translated) {
        if (requestedIds.has(result.id) && result.translatedText?.trim()) {
          this.translations.set(result.id, result.translatedText);
        }
      }

      succeeded = true;
      if (prioritizeCurrent && (options.allowRescue ?? true)) {
        rescueIndex = missing.find((cue) => !this.translations.has(cue.id))?.index ?? -1;
      }

      if (this.currentCue) {
        const currentTranslation = this.translations.get(this.currentCue.id);
        if (currentTranslation) {
          this.host.renderCueLine(this.currentCue.text, currentTranslation, 'ready');
        } else if (rescueIndex < 0 && missing.some(cue => cue.id === this.currentCue?.id)) {
          // A successful HTTP response may still omit a requested subtitle.
          this.host.renderCueLine(this.currentCue.text, this.status('subtitle.prefetchUnavailable'), 'error');
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
      if (epoch !== this.epoch || this.host.targetLanguage() !== target) return;
      logger.warn('AI subtitle prefetch batch failed', error);
      if (prioritizeCurrent && (options.allowRescue ?? true) && cueLimit > 1) rescueIndex = anchorIndex;
      if (this.currentCue && missing.some((cue) => cue.id === this.currentCue?.id)) {
        this.host.renderCueLine(this.currentCue.text,
          rescueIndex >= 0 ? this.status('subtitle.prefetchRetrying') : this.status('subtitle.prefetchUnavailable'),
          rescueIndex >= 0 ? 'pending' : 'error');
      }
    } finally {
      if (epoch === this.epoch) for (const cue of missing) this.pending.delete(cue.id);
    }

    if (
      !this.active ||
      epoch !== this.epoch ||
      this.host.routeGeneration() !== generation ||
      this.sourceTrackId !== trackId ||
      this.loadedTarget !== target ||
      this.host.targetLanguage() !== target ||
      windowEpoch !== this.prefetchWindowEpoch
    ) return;

    if (rescueIndex >= 0) {
      void this.prefetchWindow(rescueIndex, {
        prioritizeCurrent: true,
        horizonEndMs,
        windowEpoch,
        batchLimit: 1,
        allowRescue: false,
      });
      return;
    }

    if (succeeded) this.continuePrefetch(endExclusive, horizonEndMs, windowEpoch);
  }

  private continuePrefetch(nextIndex: number, horizonEndMs: number, windowEpoch: number): void {
    if (
      !this.active ||
      windowEpoch !== this.prefetchWindowEpoch ||
      nextIndex >= this.cues.length ||
      this.cues[nextIndex].startMs > horizonEndMs
    ) return;

    void this.prefetchWindow(nextIndex, {
      prioritizeCurrent: false,
      horizonEndMs,
      windowEpoch,
    });
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

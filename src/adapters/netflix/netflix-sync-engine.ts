import { SubtitleCue } from '@/shared/subtitles/ttml-parser';
import { createLogger } from '@/shared/logger';

const logger = createLogger('NetflixSyncEngine');

export type CueChangeCallback = (cue: SubtitleCue | null, videoMs: number) => void;

export class NetflixSyncEngine {
  private cues: SubtitleCue[] = [];
  private videoEl: HTMLVideoElement | null = null;
  private isRunning = false;
  private rafId: number | null = null;
  private currentCue: SubtitleCue | null = null;
  private onCueChangeCb: CueChangeCallback | null = null;

  constructor() {}

  public setCues(cues: SubtitleCue[]): void {
    // Assert/Ensure cues are sorted by startMs asc
    this.cues = [...cues].sort((a, b) => a.startMs - b.startMs);
    this.currentCue = null;
  }

  public getCues(): SubtitleCue[] {
    return this.cues;
  }

  public setVideoElement(video: HTMLVideoElement | null): void {
    if (this.videoEl === video) return;
    if (this.videoEl) {
      this.videoEl.removeEventListener('timeupdate', this.onTimeUpdate);
    }
    this.videoEl = video;
    if (this.videoEl) {
      this.videoEl.addEventListener('timeupdate', this.onTimeUpdate);
    }
  }

  public start(onCueChange: CueChangeCallback): void {
    this.onCueChangeCb = onCueChange;
    this.isRunning = true;

    // Attach to video if present
    if (!this.videoEl) {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      if (video) this.setVideoElement(video);
    }

    this.tick();
    logger.debug('Sync engine started');
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.videoEl) {
      this.videoEl.removeEventListener('timeupdate', this.onTimeUpdate);
      this.videoEl = null;
    }
    this.currentCue = null;
    logger.debug('Sync engine stopped');
  }

  private onTimeUpdate = (): void => {
    if (!this.isRunning || !this.videoEl) return;
    this.syncOnce(Math.floor(this.videoEl.currentTime * 1000));
  };

  private tick = (): void => {
    if (!this.isRunning) return;

    if (!this.videoEl || !document.contains(this.videoEl)) {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      if (video) this.setVideoElement(video);
    }

    if (this.videoEl) {
      this.syncOnce(Math.floor(this.videoEl.currentTime * 1000));
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  public syncOnce(currentMs: number): void {
    const hit = this.binarySearchCue(currentMs);

    if (hit !== this.currentCue) {
      this.currentCue = hit ?? null;
      if (this.onCueChangeCb) {
        this.onCueChangeCb(this.currentCue, currentMs);
      }
    }
  }

  /**
   * Binary search cue matching currentMs.
   * Assumes this.cues is sorted by startMs ascending.
   */
  public binarySearchCue(currentMs: number): SubtitleCue | undefined {
    if (this.cues.length === 0) return undefined;

    let low = 0;
    let high = this.cues.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const cue = this.cues[mid];

      if (currentMs >= cue.startMs && currentMs <= cue.endMs) {
        return cue;
      }

      if (currentMs < cue.startMs) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return undefined;
  }
}

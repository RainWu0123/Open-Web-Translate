/**
 * Sentence controller — the per-sentence control loop of the learning mode
 * (Language Reactor's core): replay this sentence, step to the previous /
 * next one, slow down / speed up, toggle each subtitle line, and
 * auto-pause at sentence end.
 *
 * Interface: attach() / detach() / setTimeline(). Everything else
 * (hotkeys, auto-pause state machine, speed) is implementation.
 *
 * The timeline is supplied by the host adapter as cue boundaries in video
 * milliseconds; without a timeline only speed and line toggles work.
 */
import { createLogger } from '@/shared/logger';

const logger = createLogger('SentenceController');

export interface SentenceTimelineEntry {
  startMs: number;
  endMs: number;
}

export interface SentenceControllerHooks {
  /** Cue boundaries in video-ms; empty array = timeline unavailable. */
  getTimeline(): SentenceTimelineEntry[];
  /** Show/hide the original (target-language) line. */
  setLineVisibility(visible: { original?: boolean; translated?: boolean }): void;
  /** Auto-pause enabled state lives with the host's settings. */
  isAutoPauseEnabled(): boolean;
}

const SPEED_STEPS = [0.5, 0.75, 0.9, 1.0, 1.25, 1.5];

export class SentenceController {
  private video: HTMLVideoElement | null = null;
  private attached = false;
  private autoPauseArmed = false;
  private currentSpeedIndex = SPEED_STEPS.indexOf(1.0);
  private lineVisibility = { original: true, translated: true };

  constructor(private hooks: SentenceControllerHooks) {}

  public attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.video = document.querySelector('video');
    document.addEventListener('keydown', this.onKeyDown);
    if (this.video) {
      this.video.addEventListener('timeupdate', this.onTimeUpdate);
      this.video.addEventListener('play', this.onPlay);
      this.video.addEventListener('seeking', this.onSeeking);
    }
    logger.debug('Sentence controller attached');
  }

  public detach(): void {
    if (!this.attached) return;
    this.attached = false;
    document.removeEventListener('keydown', this.onKeyDown);
    if (this.video) {
      this.video.removeEventListener('timeupdate', this.onTimeUpdate);
      this.video.removeEventListener('play', this.onPlay);
      this.video.removeEventListener('seeking', this.onSeeking);
    }
    this.video = null;
    this.autoPauseArmed = false;
    if (this.currentSpeedIndex !== SPEED_STEPS.indexOf(1.0)) {
      this.setSpeed(1.0);
    }
  }

  /** Call when the active timeline changes (track loaded / navigation). */
  public setTimeline(): void {
    this.autoPauseArmed = false;
  }

  // ── actions ────────────────────────────────────────────────────────

  public replaySentence(): void {
    const entry = this.activeEntry();
    if (!this.video || !entry) return;
    this.seekTo(entry.startMs);
  }

  public previousSentence(): void {
    const entry = this.activeEntry();
    if (!this.video) return;
    const timeline = this.hooks.getTimeline();
    if (!entry) {
      // In a gap: jump to the last cue that started before now.
      const before = timeline.filter((c) => c.startMs <= this.videoMs());
      if (before.length > 0) this.seekTo(before[before.length - 1].startMs);
      return;
    }
    const idx = timeline.indexOf(entry);
    this.seekTo(idx > 0 ? timeline[idx - 1].startMs : entry.startMs);
  }

  public nextSentence(): void {
    const entry = this.activeEntry();
    if (!this.video) return;
    const timeline = this.hooks.getTimeline();
    if (!entry) {
      const next = timeline.find((c) => c.startMs > this.videoMs());
      if (next) this.seekTo(next.startMs);
      return;
    }
    const idx = timeline.indexOf(entry);
    if (idx >= 0 && idx < timeline.length - 1) {
      this.seekTo(timeline[idx + 1].startMs);
    } else {
      // Last cue: jump just past its end.
      this.seekTo(entry.endMs + 10);
    }
  }

  public setSpeed(rate: number): void {
    if (!this.video) return;
    this.video.playbackRate = rate;
    const idx = SPEED_STEPS.indexOf(rate);
    if (idx >= 0) this.currentSpeedIndex = idx;
    logger.debug('Playback rate', rate);
  }

  public stepSpeed(direction: -1 | 1): void {
    const next = Math.min(SPEED_STEPS.length - 1, Math.max(0, this.currentSpeedIndex + direction));
    this.setSpeed(SPEED_STEPS[next]);
  }

  public toggleLine(line: 'original' | 'translated'): void {
    this.lineVisibility[line] = !this.lineVisibility[line];
    this.hooks.setLineVisibility({ ...this.lineVisibility });
  }

  // ── internals ──────────────────────────────────────────────────────

  private videoMs(): number {
    return this.video ? Math.round(this.video.currentTime * 1000) : 0;
  }

  private seekTo(ms: number): void {
    if (!this.video) return;
    this.video.currentTime = ms / 1000;
    // A seek within the same cue would not re-fire our cue-change path by
    // itself; nudge play state so the host's timeupdate logic re-renders.
    if (this.video.paused && this.wasAutoPaused) {
      void this.video.play().catch(() => {});
    }
  }

  private wasAutoPaused = false;

  private activeEntry(): SentenceTimelineEntry | null {
    const ms = this.videoMs();
    return this.hooks.getTimeline().find((c) => ms >= c.startMs && ms < c.endMs) ?? null;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    // Don't hijack typing in inputs.
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    switch (event.code) {
      case 'KeyQ':
        this.stepSpeed(-1);
        event.preventDefault();
        break;
      case 'KeyE':
        this.stepSpeed(1);
        event.preventDefault();
        break;
      case 'KeyA':
        this.previousSentence();
        event.preventDefault();
        break;
      case 'KeyD':
        this.nextSentence();
        event.preventDefault();
        break;
      case 'KeyS':
        this.replaySentence();
        event.preventDefault();
        break;
      case 'KeyZ':
        this.toggleLine('original');
        event.preventDefault();
        break;
      case 'KeyC':
        this.toggleLine('translated');
        event.preventDefault();
        break;
      default:
        break;
    }
  };

  private onPlay = (): void => {
    this.wasAutoPaused = false;
  };

  private onSeeking = (): void => {
    this.autoPauseArmed = true;
  };

  private onTimeUpdate = (): void => {
    if (!this.video || !this.hooks.isAutoPauseEnabled() || this.video.paused) return;

    const entry = this.activeEntry();
    if (!entry) {
      this.autoPauseArmed = true; // gap → arm for the next cue
      return;
    }
    const remainingMs = entry.endMs - this.videoMs();
    if (this.autoPauseArmed && remainingMs <= 250) {
      this.autoPauseArmed = false;
      this.wasAutoPaused = true;
      this.video.pause();
    } else if (remainingMs > 250) {
      this.autoPauseArmed = true;
    }
  };
}

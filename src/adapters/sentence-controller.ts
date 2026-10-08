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
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { translate } from '@/shared/i18n';
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
  private toolbar: HTMLElement | null = null;
  private initialRate = 1;
  private previousEntry: SentenceTimelineEntry | null = null;
  private autoPauseArmed = false;
  private currentSpeedIndex = SPEED_STEPS.indexOf(1.0);
  private lineVisibility = { original: true, translated: true };

  constructor(private hooks: SentenceControllerHooks) {}

  public attach(): void {
    if (this.attached && this.video === document.querySelector('video')) return;
    if (this.attached) this.detach();
    this.attached = true;
    this.video = document.querySelector('video');
    if (!this.video) { this.attached = false; return; }
    this.initialRate = this.video.playbackRate;
    this.mountToolbar();
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
    document.removeEventListener('fullscreenchange', this.placeToolbar);
    this.toolbar?.remove();
    this.toolbar = null;
    this.previousEntry = null;
    if (this.video) {
      this.video.removeEventListener('timeupdate', this.onTimeUpdate);
      this.video.removeEventListener('play', this.onPlay);
      this.video.removeEventListener('seeking', this.onSeeking);
    }
    if (this.video && this.currentSpeedIndex !== SPEED_STEPS.indexOf(1.0)) {
      this.video.playbackRate = this.initialRate;
    }
    this.video = null;
    this.autoPauseArmed = false;
    this.wasAutoPaused = false;
    this.currentSpeedIndex = SPEED_STEPS.indexOf(1.0);
    this.lineVisibility = { original: true, translated: true };
  }

  /** Call when the active timeline changes (track loaded / navigation). */
  public setTimeline(): void {
    this.autoPauseArmed = false;
    this.previousEntry = null;
    this.updateToolbar();
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
    const idx = timeline.findIndex(c => c.startMs === entry.startMs && c.endMs === entry.endMs);
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
    const idx = timeline.findIndex(c => c.startMs === entry.startMs && c.endMs === entry.endMs);
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

  private placeToolbar = (): void => {
    if (this.toolbar) (document.fullscreenElement || document.body).appendChild(this.toolbar);
  };

  private mountToolbar(): void {
    this.toolbar = document.createElement('div');
    this.toolbar.id = 'owt-learning-controls';
    const root = this.toolbar.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { position:fixed; left:50%; bottom:18px; transform:translateX(-50%); z-index:2147483599; }
      nav { display:flex; gap:4px; padding:5px; border-radius:24px; background:rgba(18,18,22,.9); color:white; font:13px system-ui; box-shadow:0 3px 18px #0004; max-width:calc(100vw - 24px); }
      button { background:none; border:0; border-radius:18px; color:inherit; padding:8px 10px; font:inherit; white-space:nowrap; cursor:pointer; }
      button:hover, button:focus-visible { background:#ffffff20; outline:2px solid #aaa; outline-offset:-2px; }
      button:disabled { opacity:.4; cursor:default; }
      button[aria-pressed=false] { opacity:.55; }
    `;
    root.appendChild(style);
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Subtitle learning controls');
    const actions = [
      ['learning.previous', () => this.previousSentence(), 'Alt+A'],
      ['learning.replay', () => this.replaySentence(), 'Alt+S'],
      ['learning.next', () => this.nextSentence(), 'Alt+D'],
      ['learning.original', () => this.toggleLine('original'), 'Alt+Z'],
      ['learning.translation', () => this.toggleLine('translated'), 'Alt+C'],
    ] as const;
    for (const [key, action, shortcut] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.key = key;
      button.textContent = translate('auto', key);
      button.title = shortcut;
      button.setAttribute('aria-keyshortcuts', shortcut);
      button.onclick = () => { action(); this.updateToolbar(); };
      nav.appendChild(button);
    }
    root.appendChild(nav);
    this.placeToolbar();
    document.addEventListener('fullscreenchange', this.placeToolbar);
    this.updateToolbar();
    void SettingsStorage.get().then(settings => {
      for (const [key] of actions) {
        const button = root.querySelector<HTMLElement>(`[data-key="${key}"]`);
        if (button) button.textContent = translate(settings.uiLanguage || 'auto', key);
      }
    }).catch(() => {});
  }

  private updateToolbar(): void {
    const buttons = this.toolbar?.shadowRoot?.querySelectorAll('button');
    if (!buttons) return;
    const timeline = this.hooks.getTimeline();
    const ms = this.videoMs();
    buttons[0].disabled = !timeline.some(c => c.startMs <= ms);
    buttons[1].disabled = !this.activeEntry();
    buttons[2].disabled = !timeline.some(c => c.startMs > ms);
    buttons[3].setAttribute('aria-pressed', String(this.lineVisibility.original));
    buttons[4].setAttribute('aria-pressed', String(this.lineVisibility.translated));
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
    if (this.video.paused) {
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
    this.previousEntry = null;
  };

  private onTimeUpdate = (): void => {
    this.updateToolbar();
    if (!this.video || !this.hooks.isAutoPauseEnabled() || this.video.paused) {
      this.previousEntry = null;
      return;
    }

    const entry = this.activeEntry();
    const previous = this.previousEntry;
    this.previousEntry = entry;
    if (previous && this.autoPauseArmed && this.videoMs() >= previous.endMs) {
      this.autoPauseArmed = false;
      this.wasAutoPaused = true;
      this.video.pause();
      return;
    }
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

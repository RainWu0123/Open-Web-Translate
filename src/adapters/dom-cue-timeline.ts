/**
 * DOM cue timeline builder — the AI-mode fallback timeline.
 *
 * In pure AI mode there is no downloaded track, so the SentenceController
 * has no cue boundaries and its hotkeys (replay / prev / next / auto-pause)
 * would be inert. This builder observes the DOM-scraped subtitle line as it
 * changes and turns each appearance into a synthetic cue: startMs = when
 * the line appeared, endMs = when the next line appeared (or the clear).
 *
 * Interface: open · closeAll · reset · timeline.
 */

export interface DomCueTimelineEntry {
  startMs: number;
  endMs: number;
}

interface OpenEntry {
  text: string;
  startMs: number;
}

export class DomCueTimelineBuilder {
  private closed: DomCueTimelineEntry[] = [];
  private openEntry: OpenEntry | null = null;

  constructor(private maxEntries = 200) {}

  /** A subtitle line became visible at videoMs. */
  public open(text: string, atMs: number): void {
    if (this.openEntry && this.openEntry.text === text) return; // duplicate render
    this.closeOpen(atMs);
    this.openEntry = { text, startMs: atMs };
  }

  /** The subtitle area went blank (e.g. grace-period clear) at videoMs. */
  public closeAll(atMs: number): void {
    this.closeOpen(atMs);
  }

  /** Navigation / mode switch: forget everything. */
  public reset(): void {
    this.closed = [];
    this.openEntry = null;
  }

  public timeline(): DomCueTimelineEntry[] {
    // Snapshot: the still-open entry has no trustworthy end yet.
    return [...this.closed];
  }

  private closeOpen(atMs: number): void {
    if (!this.openEntry) return;
    const endMs = Math.max(atMs, this.openEntry.startMs + 1);
    this.closed.push({ startMs: this.openEntry.startMs, endMs });
    if (this.closed.length > this.maxEntries) {
      this.closed.splice(0, this.closed.length - this.maxEntries);
    }
    this.openEntry = null;
  }
}

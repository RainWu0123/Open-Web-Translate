/**
 * Netflix dual-track controller — owns the dual native track mode.
 *
 * Downloads both tracks, pairs cues by maximum time overlap (cue-aligner),
 * and drives rendering from video.currentTime through the sync engine.
 * All pairing state (primary cues, pairings, identity map) lives here.
 *
 * Interface: selectPrimary · load · stop · reset · isActive · timeline ·
 *            primaryLang.
 */
import { createLogger } from '@/shared/logger';
import { alignCueTracks, type CuePairing } from '@/shared/subtitles/cue-aligner';
import type { SubtitleCue } from '@/shared/subtitles/ttml-parser';
import { BRIDGE, bridgeRequest } from './netflix-bridge';
import { NetflixSyncEngine } from './netflix-sync-engine';
import { trackMatchesTargetLanguage, type DiscoveredTrack } from './netflix-track-manager';

const logger = createLogger('NetflixDualTrack');

/** Parser cue enriched with identity/language for pairing. */
export type DualCue = SubtitleCue & { id: string; lang: string };

export interface DualTrackHost {
  fetchTtml(url: string): Promise<string>;
  parseTtml(xml: string): SubtitleCue[];
  isActive(): boolean;
  routeGeneration(): number;
  renderCueLine(primaryText: string, secondaryText: string): void;
  machineTranslateCue(text: string, generation: number): Promise<void>;
  clearLine(): void;
  setCueText(text: string): void;
  getCueText(): string;
  setSecondaryCues(cues: SubtitleCue[]): void;
  onDualLoaded(): void;
  fallbackToSingle(secondary: DiscoveredTrack): Promise<void>;
}

export class NetflixDualTrackController {
  private active = false;
  private primaryCues: DualCue[] = [];
  private pairings: CuePairing<DualCue, DualCue>[] = [];
  private pairingByPrimary = new Map<DualCue, CuePairing<DualCue, DualCue>>();
  private primaryLang = 'auto';

  constructor(
    private host: DualTrackHost,
    private syncEngine: NetflixSyncEngine,
    private onTimelineChanged: () => void,
  ) {}

  public isActive(): boolean {
    return this.active;
  }

  public timeline(): Array<{ startMs: number; endMs: number }> {
    return this.primaryCues.map((c) => ({ startMs: c.startMs, endMs: c.endMs }));
  }

  public getPrimaryLang(): string {
    return this.primaryLang;
  }

  public reset(): void {
    this.stop();
    this.primaryCues = [];
    this.pairings = [];
    this.pairingByPrimary.clear();
    this.primaryLang = 'auto';
  }

  public stop(): void {
    this.active = false;
    this.syncEngine.stop();
  }

  /**
   * Picks the learning-language (primary) track for dual mode. Prefers the
   * track the player is CURRENTLY displaying — asking the MAIN world beats
   * heuristics when several non-target tracks exist (e.g. EN + FR subs) —
   * and falls back to the first non-target track with a URL.
   */
  public async selectPrimary(
    discovered: DiscoveredTrack[],
    native: DiscoveredTrack,
    targetLang: string,
  ): Promise<DiscoveredTrack | undefined> {
    const candidates = discovered.filter(
      (t) => t.url && t.id !== native.id && !trackMatchesTargetLanguage(t, targetLang),
    );
    if (candidates.length === 0) return undefined;

    try {
      const result = await bridgeRequest<{ trackId: string }>(
        BRIDGE.messageType.GET_ACTIVE_TRACK,
        {},
        2000,
      );
      const activeId = result?.trackId ? String(result.trackId) : '';
      if (activeId) {
        // The bridge id may be the cadmium trackId, bcp47, or language;
        // match against all three of each candidate.
        const byActive = candidates.find(
          (t) =>
            String(t.id) === activeId ||
            String(t.rawTrack?.trackId ?? '') === activeId ||
            String(t.language) === activeId ||
            activeId.toLowerCase().startsWith(String(t.language).toLowerCase()),
        );
        // Never let the active pick be the translation track itself.
        if (byActive && byActive.id !== native.id) return byActive;
      }
    } catch {
      // bridge unavailable — heuristic stands
    }

    return candidates[0];
  }

  /**
   * Loads BOTH native tracks and pairs cues by maximum time overlap:
   * primary = the video's original language (learning language, tokenized,
   * timeline source), secondary = the target language. Rendering is then
   * driven by video.currentTime via the sync engine instead of DOM
   * scraping, which is what keeps the two lines correctly paired.
   */
  public async load(primaryTrack: DiscoveredTrack, secondaryTrack: DiscoveredTrack): Promise<void> {
    try {
      const [primaryXml, secondaryXml] = await Promise.all([
        this.host.fetchTtml(primaryTrack.url),
        this.host.fetchTtml(secondaryTrack.url),
      ]);
      const primaryCues = this.host
        .parseTtml(primaryXml)
        .map((c, i): DualCue => ({ ...c, lang: primaryTrack.language, id: `p${i}` }));
      const secondaryCues = this.host
        .parseTtml(secondaryXml)
        .map((c, i): DualCue => ({ ...c, lang: secondaryTrack.language, id: `s${i}` }));
      if (primaryCues.length === 0 || secondaryCues.length === 0) {
        throw new Error('empty track');
      }

      this.primaryCues = primaryCues;
      this.host.setSecondaryCues(secondaryCues);
      this.pairings = alignCueTracks(primaryCues, secondaryCues);
      this.pairingByPrimary = new Map(this.pairings.map((p) => [p.primary, p]));
      this.primaryLang = primaryTrack.language;
      this.active = true;
      this.host.setCueText('');

      logger.info('Dual native track mode active', {
        primary: primaryTrack.language,
        secondary: secondaryTrack.language,
        pairs: this.pairings.length,
        overlapped: this.pairings.filter((p) => p.secondary).length,
      });

      this.startSyncEngine();
    } catch (error) {
      this.reset();
      logger.warn('Dual track load failed, falling back to single native track', error);
      await this.host.fallbackToSingle(secondaryTrack);
      return;
    }
    this.host.onDualLoaded();
  }

  private startSyncEngine(): void {
    const byIdentity = new Map<SubtitleCue, DualCue>(
      this.primaryCues.map((c) => [c as SubtitleCue, c]),
    );
    this.syncEngine.setCues(this.primaryCues);
    this.syncEngine.start((rawCue) => {
      const cue = rawCue ? byIdentity.get(rawCue) ?? (rawCue as DualCue) : null;
      if (!this.host.isActive() || !this.active) return;
      if (!cue) {
        if (this.host.getCueText() !== '') {
          this.host.setCueText('');
          this.host.clearLine();
        }
        return;
      }
      const pairing = this.pairingByPrimary.get(cue);
      const secondaryText = pairing?.secondary?.text ?? '';
      if (cue.text === this.host.getCueText()) return;
      this.host.setCueText(cue.text);
      if (!cue.text && !secondaryText) return;
      if (secondaryText) {
        this.host.renderCueLine(cue.text, secondaryText);
      } else {
        // No paired native line: machine-translate this cue.
        void this.host.machineTranslateCue(cue.text, this.host.routeGeneration());
      }
    });
    this.onTimelineChanged();
  }
}

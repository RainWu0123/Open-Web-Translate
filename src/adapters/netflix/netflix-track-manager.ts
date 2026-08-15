import { SubtitleCue, parseNetflixTtmlDetailed } from '@/shared/subtitles/ttml-parser';
import { createLogger } from '@/shared/logger';
import { NETFLIX_PREFERRED_TEXT_PROFILES, isSubtitleResourceUrl } from './netflix-track-constants';

const logger = createLogger('NetflixTrackManager');

export type AdapterState =
  | 'idle'
  | 'discovering'
  | 'loading_primary'
  | 'loading_secondary'
  | 'overlay_ready'
  | 'native_hidden'
  | 'degraded_ai'
  | 'failed_restore_native';

export type TrackLoadState =
  | 'unrequested'
  | 'requested'
  | 'waiting_network'
  | 'parsed'
  | 'failed'
  | 'cancelled';

export interface HydrationResult {
  ok: boolean;
  source?: 'manifest' | 'network';
  trackKey?: string;
  cues?: SubtitleCue[];
  reason?: 'timeout' | 'track-not-found' | 'api-unavailable';
  detectedFormat?: string;
}

export interface DiscoveredTrack {
  id: string;
  label: string;
  language: string;
  url: string;
  isCC: boolean;
  hasUrl: boolean;
  rawTrack?: Record<string, unknown>;
  downloadables?: Record<string, { isImage: boolean; downloadUrls: string[]; urls: string[] }>;
  candidates?: { profile: string; url: string; isText: boolean }[];
}

export function isBitmapImsc(xml: string): boolean {
  return (
    /ttp:profile[^>]*imsc1\/image/i.test(xml) ||
    /<body[^>]*>[\s\S]{0,200}<image[\s/>]/i.test(xml) ||
    /imageType=/i.test(xml)
  );
}

export function trackMatchesTargetLanguage(
  track: { language: string; label: string },
  targetLang: string,
): boolean {
  const lang = (track.language || '').toLowerCase().replace(/_/g, '-');
  const label = (track.label || '').toLowerCase();
  const target = (targetLang || '').toLowerCase().replace(/_/g, '-');
  const targetPrefix = target.split('-')[0];

  if (!targetPrefix) return false;

  // Chinese family: zh-Hant / zh-Hans / cmn / yue / 中文 / 繁體 / 简体
  if (targetPrefix === 'zh' || target.startsWith('cmn') || target.startsWith('yue')) {
    const isChineseLang =
      lang.startsWith('zh') ||
      lang.startsWith('cmn') ||
      lang.startsWith('yue') ||
      lang.includes('hant') ||
      lang.includes('hans') ||
      lang.includes('cht') ||
      lang.includes('chs');
    const isChineseLabel =
      label.includes('中文') ||
      label.includes('chinese') ||
      label.includes('mandarin') ||
      label.includes('cantonese') ||
      label.includes('繁體') ||
      label.includes('繁体') ||
      label.includes('简体') ||
      label.includes('簡體') ||
      label.includes('國語') ||
      label.includes('国语') ||
      label.includes('粵語') ||
      label.includes('粤语');
    return isChineseLang || isChineseLabel;
  }

  if (lang.startsWith(targetPrefix)) return true;
  if (label.includes(targetPrefix)) return true;
  return false;
}

export interface INetflixTrackManager {
  getAdapterState(): AdapterState;
  setAdapterState(state: AdapterState): void;
  setDiscoveredTracks(tracks: DiscoveredTrack[]): void;
  getDiscoveredTracks(): DiscoveredTrack[];
  subscribeTracks(listener: (tracks: DiscoveredTrack[]) => void): () => void;
  findPrimaryTrack(currentNativeTrackId?: string, preferredLanguage?: string): DiscoveredTrack | undefined;
  findBestMatchingTrack(targetLang?: string): DiscoveredTrack | undefined;
  findTextFallbackUrl(track: DiscoveredTrack): string | null;
  startPerformanceObserver(): void;
  stopPerformanceObserver(): void;
}

export class NetflixTrackManager implements INetflixTrackManager {
  private adapterState: AdapterState = 'idle';
  private discoveredTracks: DiscoveredTrack[] = [];
  private targetLang: string = 'zh-Hant';
  private listeners: Set<(tracks: DiscoveredTrack[]) => void> = new Set();
  private observer: PerformanceObserver | null = null;

  constructor() {
    this.startPerformanceObserver();
  }

  public getAdapterState(): AdapterState {
    return this.adapterState;
  }

  public setAdapterState(state: AdapterState): void {
    this.adapterState = state;
    logger.info(`Adapter state transitioned to: ${state}`);
  }

  public setDiscoveredTracks(tracks: DiscoveredTrack[]): void {
    this.discoveredTracks = tracks;
    this.notifyListeners();
  }

  public getDiscoveredTracks(): DiscoveredTrack[] {
    return this.discoveredTracks;
  }

  public subscribeTracks(listener: (tracks: DiscoveredTrack[]) => void): () => void {
    this.listeners.add(listener);
    if (this.discoveredTracks.length > 0) {
      listener(this.discoveredTracks);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.discoveredTracks);
      } catch (err) {
        logger.error('Error in track listener', err);
      }
    }
  }

  public setTargetLanguage(lang: string): void {
    this.targetLang = lang;
  }

  public findPrimaryTrack(currentNativeTrackId?: string, preferredLanguage?: string): DiscoveredTrack | undefined {
    const isNoneTrack = (id?: string) => !id || id.includes('NONE') || id === 'off';

    if (currentNativeTrackId && !isNoneTrack(currentNativeTrackId)) {
      const match = this.discoveredTracks.find((t) => t.id === currentNativeTrackId);
      if (match) return match;
    }

    const targetMatch = this.discoveredTracks.find((t) =>
      trackMatchesTargetLanguage(t, preferredLanguage || this.targetLang),
    );
    if (targetMatch) return targetMatch;

    return (
      this.discoveredTracks.find((t) => !isNoneTrack(t.id)) ??
      this.discoveredTracks[0]
    );
  }

  public findBestMatchingTrack(targetLang: string = this.targetLang): DiscoveredTrack | undefined {
    return this.discoveredTracks.find((t) => trackMatchesTargetLanguage(t, targetLang));
  }

  /**
   * Rescue IMSC1 bitmap track by finding text-based profile in manifest downloadables.
   */
  public findTextFallbackUrl(track: DiscoveredTrack): string | null {
    if (track.candidates && track.candidates.length > 0) {
      const textCandidate = track.candidates.find(c => c.isText);
      if (textCandidate) return textCandidate.url;
    }

    if (!track.downloadables) return null;

    for (const profileName of NETFLIX_PREFERRED_TEXT_PROFILES) {
      const entry = track.downloadables[profileName];
      if (entry && !entry.isImage) {
        const url = entry.downloadUrls?.[0] || entry.urls?.[0];
        if (url) return url;
      }
    }

    for (const [profileName, entry] of Object.entries(track.downloadables)) {
      if (!entry.isImage) {
        const url = entry.downloadUrls?.[0] || entry.urls?.[0];
        if (url) return url;
      }
    }

    return null;
  }

  /**
   * Non-invasive PerformanceObserver to capture loaded subtitle resource URLs
   * without overriding global XMLHttpRequest or fetch APIs.
   */
  public startPerformanceObserver(): void {
    if (typeof PerformanceObserver === 'undefined') return;
    if (this.observer) return;

    try {
      this.observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const newTrackUrls: string[] = [];

        for (const entry of entries) {
          if (isSubtitleResourceUrl(entry.name)) {
            newTrackUrls.push(entry.name);
          }
        }

        if (newTrackUrls.length > 0) {
          logger.info(`PerformanceObserver captured ${newTrackUrls.length} subtitle URLs`);
          this.hydratePerformanceTracks(newTrackUrls);
        }
      });

      this.observer.observe({ entryTypes: ['resource'] });
    } catch {
      // Ignore if resource observation not allowed
    }
  }

  public stopPerformanceObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  private hydratePerformanceTracks(urls: string[]): void {
    let updated = false;
    const currentTracks = [...this.discoveredTracks];

    for (const url of urls) {
      const existing = currentTracks.find((t) => t.url === url);
      if (!existing) {
        currentTracks.push({
          id: `perf_${currentTracks.length + 1}`,
          label: `Captured Track ${currentTracks.length + 1}`,
          language: 'auto',
          url,
          isCC: false,
          hasUrl: true,
        });
        updated = true;
      }
    }

    if (updated) {
      this.setDiscoveredTracks(currentTracks);
    }
  }
}

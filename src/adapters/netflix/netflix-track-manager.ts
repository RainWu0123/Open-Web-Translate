import { SubtitleCue, parseNetflixTtmlDetailed } from '@/shared/subtitles/ttml-parser';
import { createLogger } from '@/shared/logger';

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
}

export interface DiscoveredTrack {
  id: string;
  label: string;
  language: string;
  url: string;
  isCC: boolean;
  hasUrl: boolean;
  rawTrack?: any;
  downloadables?: Record<string, { isImage: boolean; downloadUrls: string[]; urls: string[] }>;
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

export class NetflixTrackManager {
  private adapterState: AdapterState = 'idle';
  private discoveredTracks: DiscoveredTrack[] = [];
  private targetLang: string = 'zh-Hant';

  constructor() {}

  public getAdapterState(): AdapterState {
    return this.adapterState;
  }

  public setAdapterState(state: AdapterState): void {
    this.adapterState = state;
    logger.info(`Adapter state transitioned to: ${state}`);
  }

  public setDiscoveredTracks(tracks: DiscoveredTrack[]): void {
    this.discoveredTracks = tracks;
  }

  public getDiscoveredTracks(): DiscoveredTrack[] {
    return this.discoveredTracks;
  }

  public setTargetLanguage(lang: string): void {
    this.targetLang = lang;
  }

  public findPrimaryTrack(): DiscoveredTrack | undefined {
    // Find active native audio/subtitle track or first text track
    return this.discoveredTracks[0];
  }

  public findBestMatchingTrack(targetLang: string = this.targetLang): DiscoveredTrack | undefined {
    return this.discoveredTracks.find((t) => trackMatchesTargetLanguage(t, targetLang));
  }

  /**
   * Rescue IMSC1 bitmap track by finding text-based profile in manifest downloadables.
   */
  public findTextFallbackUrl(track: DiscoveredTrack): string | null {
    if (!track.downloadables) return null;

    const PREFERRED_PROFILES = [
      'dfxp-ls-sdh',
      'simplesdh',
      'webvtt-lssdh',
      'dfxp-teletext-dfxp-ls-sdh',
      'dfxp-ls',
    ];

    for (const profileName of PREFERRED_PROFILES) {
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
}

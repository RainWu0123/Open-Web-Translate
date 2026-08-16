/**
 * Netflix track discovery engine (MAIN world).
 *
 * Deep module behind a four-method interface: start · stop · rearm ·
 * pollOnce (plus lastPayload for diagnostics). Its implementation owns the
 * whole "triple strategy":
 * - JSON.parse hook (substring-gated, self-disarming once URL-bearing
 *   tracks are captured, re-armed on rearm())
 * - fetch clone hook for /manifest and /cadmium/ responses
 * - 2s Cadmium player poller with idle shutdown
 * - performance-entry capture and perf/cadmium hydration
 * - single normalization + fingerprint + revision + bridge broadcast
 *
 * All shared mutable state (captured tracks, fingerprint, revision, hook
 * flags) is private to this class.
 */
import { createLogger } from '@/shared/logger';
import { BRIDGE, postToContent } from './netflix-bridge';
import {
  NETFLIX_PREFERRED_TEXT_PROFILES,
  looksLikeTrackUrl,
  isSubtitleResourceUrl,
} from './netflix-track-constants';

const logger = createLogger('NetflixTrackDiscovery');

export interface TrackCandidate {
  profile: string;
  url: string;
  isText: boolean;
}

/** Strictly JSON-serializable track shape that crosses the bridge. */
export interface DiscoveredTrackPayload {
  trackId: string;
  language: string;
  bcp47: string;
  url: string;
  isCC: boolean;
  profile: string;
  candidates: TrackCandidate[];
}

const POLL_INTERVAL_MS = 2000;
/** Stop polling after this many consecutive ticks with no tracks (10 min). */
const POLL_MAX_IDLE_TICKS = 300;

// ── Cadmium player access ────────────────────────────────────────────

export function getPlayerApi(): any {
  try {
    return (window as any).netflix?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
  } catch {
    return null;
  }
}

export function getMainVideoPlayer(api?: any): { id: string; player: any } | null {
  const videoPlayerApi = api || getPlayerApi();
  if (!videoPlayerApi) return null;

  try {
    const sessionIds = videoPlayerApi.getAllPlayerSessionIds?.() || [];
    const watchSessionId = sessionIds.find((id: string) => id.startsWith('watch-'));
    const targetSessionId = watchSessionId || sessionIds[0];

    if (!targetSessionId) return null;
    const player = videoPlayerApi.getVideoPlayerBySessionId(targetSessionId);
    return player ? { id: targetSessionId, player } : null;
  } catch {
    return null;
  }
}

// ── Raw track / URL extraction ───────────────────────────────────────

function getUrlsFromEntry(entry: any): string[] {
  if (!entry) return [];
  const urls: string[] = [];

  const raw = entry.downloadUrls || entry.urls || entry.url;
  if (typeof raw === 'string' && raw.startsWith('http')) {
    urls.push(raw);
  } else if (Array.isArray(raw)) {
    for (const u of raw) {
      if (typeof u === 'string' && u.startsWith('http')) {
        urls.push(u);
      } else if (u && typeof u === 'object') {
        const inner = u.url || u.downloadUrl;
        if (typeof inner === 'string' && inner.startsWith('http')) urls.push(inner);
      }
    }
  } else if (raw && typeof raw === 'object') {
    for (const u of Object.values(raw)) {
      if (typeof u === 'string' && u.startsWith('http')) {
        urls.push(u);
      } else if (u && typeof u === 'object') {
        const inner = (u as any).url || (u as any).downloadUrl;
        if (typeof inner === 'string' && inner.startsWith('http')) urls.push(inner);
      }
    }
  }

  return urls;
}

function findUrlsInObject(obj: any, depth = 0, maxDepth = 6): string[] {
  let urls: string[] = [];
  if (!obj || depth > maxDepth || typeof obj !== 'object') return urls;

  for (const key of Object.keys(obj)) {
    try {
      const val = obj[key];
      if (typeof val === 'string') {
        if (looksLikeTrackUrl(val)) {
          urls.push(val);
        }
      } else if (val && typeof val === 'object') {
        urls = urls.concat(findUrlsInObject(val, depth + 1, maxDepth));
      }
    } catch {}
  }
  return [...new Set(urls)];
}

export function extractTrackUrlUniversal(t: any): string {
  if (!t) return '';

  const directUrls = getUrlsFromEntry(t);
  if (directUrls.length > 0) return directUrls[0];

  const downloadables = t.ttDownloadables || t.downloadables || t.rawTrack?.ttDownloadables || t.rawTrack?.downloadables;
  if (downloadables && typeof downloadables === 'object') {
    for (const prof of NETFLIX_PREFERRED_TEXT_PROFILES) {
      const entry = downloadables[prof];
      if (entry) {
        const urls = getUrlsFromEntry(entry);
        if (urls.length > 0) return urls[0];
      }
    }

    for (const [prof, entry] of Object.entries(downloadables as Record<string, any>)) {
      if (entry && !entry.isImage && !prof.includes('imsc')) {
        const urls = getUrlsFromEntry(entry);
        if (urls.length > 0) return urls[0];
      }
    }

    for (const entry of Object.values(downloadables as Record<string, any>)) {
      if (entry) {
        const urls = getUrlsFromEntry(entry);
        if (urls.length > 0) return urls[0];
      }
    }
  }

  const hiddenUrls = findUrlsInObject(t.rawTrack || t);
  if (hiddenUrls.length > 0) {
    const textUrl = hiddenUrls.find((u) => isSubtitleResourceUrl(u));
    return textUrl || hiddenUrls[0];
  }

  if (t.rawTrack && t.rawTrack !== t) {
    return extractTrackUrlUniversal(t.rawTrack);
  }

  return '';
}

export function extractCandidateRepresentations(t: any): TrackCandidate[] {
  if (!t || typeof t !== 'object') return [];
  const candidates: TrackCandidate[] = [];

  const downloadables = t.ttDownloadables || t.downloadables || t.rawTrack?.ttDownloadables || t.rawTrack?.downloadables;
  if (downloadables && typeof downloadables === 'object') {
    for (const [prof, entry] of Object.entries(downloadables as Record<string, any>)) {
      if (entry) {
        const urls = getUrlsFromEntry(entry);
        if (urls.length > 0) {
          const isText = !entry.isImage && !prof.includes('imsc');
          candidates.push({ profile: prof, url: urls[0], isText });
        }
      }
    }
  }

  if (candidates.length === 0) {
    const url = extractTrackUrlUniversal(t);
    if (url) {
      candidates.push({ profile: 'unknown', url, isText: true });
    }
  }

  return candidates;
}

/** Raw Cadmium track list; normalization happens once, in emit(). */
function extractRawCadmiumTracks(): any[] {
  const playerObj = getMainVideoPlayer();
  if (!playerObj?.player) return [];

  const player = playerObj.player;
  if (typeof player.getTimedTextTrackList !== 'function') return [];

  try {
    return player.getTimedTextTrackList() || [];
  } catch {
    return [];
  }
}

export function extractTracksFromPerformanceEntriesForDebug(): any[] {
  return extractTracksFromPerformanceEntries();
}

function extractTracksFromPerformanceEntries(): any[] {
  try {
    const entries = performance.getEntriesByType('resource');
    const timedTextEntries = entries.filter((e) => isSubtitleResourceUrl(e.name));
    if (timedTextEntries.length === 0) return [];

    return timedTextEntries.map((e, idx) => ({
      trackId: `perf_track_${idx}`,
      languageDescription: `Captured Track ${idx + 1}`,
      language: 'auto',
      url: e.name,
      isClosedCaptions: false,
    }));
  } catch {
    return [];
  }
}

// ── The engine ───────────────────────────────────────────────────────

export class NetflixTrackDiscovery {
  constructor() {
    // The patched window.fetch cannot see `this`; route its finds through a
    // module-level hook point bound at construction.
    emitFromFetch = (tracks: any[]) => this.emit('fetch response clone', tracks);
  }

  private capturedTracksStore: any[] = [];
  private lastCaptureSource = 'none';
  private tracksRevision = 0;
  private lastTracksFingerprint = '';
  private pollerTimer: ReturnType<typeof setInterval> | null = null;
  private pollerIdleTicks = 0;
  private jsonParseHookInstalled = false;
  private originalJsonParse: typeof JSON.parse | null = null;
  private fetchHookInstalled = false;

  /** Diagnostic snapshot for __OWT_DEBUG__. */
  public lastPayload(): { tracks: any[]; source: string; revision: number } {
    return { tracks: this.capturedTracksStore, source: this.lastCaptureSource, revision: this.tracksRevision };
  }

  public start(): void {
    this.installManifestJsonHook();
    this.installNetworkHooks();
    this.startPoller();
  }

  public stop(): void {
    this.uninstallManifestJsonHook();
    this.stopPoller();
  }

  /** Re-arm discovery after navigation invalidated previous captures. */
  public rearm(): void {
    this.installManifestJsonHook();
    this.startPoller();
  }

  /** Force re-broadcast of the current store at a fresh revision. */
  public rebroadcast(): void {
    if (this.capturedTracksStore.length > 0) {
      this.emit('re-query', this.capturedTracksStore, true);
    }
  }

  public pollOnce(): boolean {
    try {
      const tracks = extractRawCadmiumTracks();
      const perfTracks = extractTracksFromPerformanceEntries();

      if (tracks.length > 0 && perfTracks.length > 0) {
        const hydratedTracks = tracks.map((t, idx) => {
          const hasOwnUrl =
            Boolean(t.url) || getUrlsFromEntry(t.ttDownloadables || t.downloadables).length > 0;
          if (!hasOwnUrl) {
            const langKey = String(t.bcp47 || t.language || '').toLowerCase();
            const idKey = String(t.trackId || t.id || '').toLowerCase();
            const matchedPerf =
              perfTracks.find(
                (p) =>
                  (langKey && p.url.toLowerCase().includes(langKey)) ||
                  (idKey && p.url.toLowerCase().includes(idKey)),
              ) || perfTracks[idx % perfTracks.length];
            if (matchedPerf) {
              return { ...t, url: matchedPerf.url };
            }
          }
          return t;
        });
        this.emit('cadmium_perf_hydrated', hydratedTracks);
        return true;
      } else if (perfTracks.length > 0) {
        this.emit('performance_network_log', perfTracks);
        return true;
      } else if (tracks.length > 0) {
        this.emit('cadmium_active_poll', tracks);
        return true;
      }
    } catch (err) {
      logger.warn('[discovery] poll tick failed', err);
    }
    return false;
  }

  /**
   * Bind tracks captured from a hydration network match back onto the store
   * (used by the HYDRATE_TRACK command handler).
   */
  public bindHydratedUrl(trackId: string, capturedUrl: string): void {
    if (!capturedUrl || this.capturedTracksStore.length === 0) return;
    const updatedTracks = this.capturedTracksStore.map((t) => {
      if (
        String(t.id) === String(trackId) ||
        String(t.rawTrack?.trackId) === String(trackId) ||
        String(t.language) === String(trackId)
      ) {
        return { ...t, url: capturedUrl };
      }
      return t;
    });
    this.emit('hydration_network_bind', updatedTracks, true);
  }

  // ── emit: single normalization + fingerprint + broadcast ──────────

  private emit(sourceLabel: string, tracks: any[], force: boolean = false): void {
    if (!tracks || tracks.length === 0) return;

    const normalizedTracks = tracks.map((t: any) => {
      const candidates = extractCandidateRepresentations(t);
      const bestCandidate = candidates.find((c) => c.isText) || candidates[0];
      const url = bestCandidate ? bestCandidate.url : '';
      return {
        id: t.id ?? t.trackId ?? t.language,
        label: t.label || t.languageDescription || t.language,
        language: t.language || t.bcp47 || 'unknown',
        url,
        isCC: Boolean(t.isCC || t.isClosedCaptions || t.isCaption),
        rawTrack: t,
        downloadables: t.downloadables || t.ttDownloadables,
        candidates,
      };
    });

    const fingerprint = normalizedTracks
      .map((t) => `${t.id}:${t.language}:${Boolean(t.url)}`)
      .sort()
      .join('|');

    if (!force && fingerprint === this.lastTracksFingerprint) return;

    this.lastTracksFingerprint = fingerprint;
    this.tracksRevision += 1;
    this.capturedTracksStore = normalizedTracks;
    this.lastCaptureSource = sourceLabel;

    const tracksWithUrl = normalizedTracks.filter((t) => Boolean(t.url)).length;
    logger.info(
      `[Step 2 Publish] Captured ${normalizedTracks.length} tracks via ${sourceLabel} ` +
      `(With URLs: ${tracksWithUrl}, Revision: ${this.tracksRevision})`,
    );

    // Strictly JSON-serializable payload only — the bridge mirrors it as a
    // JSON string for Firefox, so page objects must never cross.
    const safeTracks: DiscoveredTrackPayload[] = normalizedTracks.map((t) => ({
      trackId: String(t.id),
      language: String(t.language),
      bcp47: String(t.language),
      url: typeof t.url === 'string' ? t.url : '',
      isCC: Boolean(t.isCC),
      profile: t.candidates?.length > 0 ? t.candidates[0].profile : 'unknown',
      candidates: t.candidates,
    }));

    postToContent(BRIDGE.messageType.TRACKS_UPDATED, {
      channel: 'owt',
      revision: this.tracksRevision,
      tracks: safeTracks,
      // captureSource describes where tracks came from; 'source' is the
      // bridge's routing tag and must stay reserved.
      captureSource: sourceLabel,
    });

    // Mission accomplished: stop burning CPU once text tracks with real
    // download URLs are in hand.
    if (tracksWithUrl > 0) {
      this.uninstallManifestJsonHook();
      this.stopPoller();
    }
  }

  // ── hooks ──────────────────────────────────────────────────────────

  private findTimedTextTracks(obj: any, depth = 0): any[] | null {
    if (!obj || typeof obj !== 'object' || depth > 5) return null;
    if (Array.isArray(obj.timedtexttracks) && obj.timedtexttracks.length > 0) {
      return obj.timedtexttracks;
    }
    if (Array.isArray(obj.tracks) && obj.tracks.length > 0 && obj.tracks[0]?.ttDownloadables) {
      return obj.tracks;
    }
    for (const key of Object.keys(obj)) {
      if (obj[key] && typeof obj[key] === 'object') {
        const found = this.findTimedTextTracks(obj[key], depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  private installManifestJsonHook(): void {
    if (this.jsonParseHookInstalled) return;
    this.jsonParseHookInstalled = true;
    this.originalJsonParse = JSON.parse;
    JSON.parse = (text: string, reviver?: (key: string, value: any) => any) => {
      const result = this.originalJsonParse!.call(this, text, reviver);

      try {
        // Cheap substring gate BEFORE the deep walk: Netflix pages call
        // JSON.parse constantly, and almost no payload contains manifests.
        if (
          typeof text === 'string' &&
          text.includes('timedtexttracks') &&
          result &&
          typeof result === 'object'
        ) {
          const tracks = this.findTimedTextTracks(result);
          if (tracks && tracks.length > 0) {
            logger.debug('[Manifest Deep Intercept] Found tracks in JSON.parse', tracks.length);
            this.emit('JSON.parse deep intercept', tracks);
          }
        }
      } catch {
        // ignore parsing error
      }

      return result;
    };
  }

  private uninstallManifestJsonHook(): void {
    if (!this.jsonParseHookInstalled || !this.originalJsonParse) return;
    JSON.parse = this.originalJsonParse;
    this.originalJsonParse = null;
    this.jsonParseHookInstalled = false;
    logger.debug('[Manifest JSON.parse hook restored]');
  }

  private installNetworkHooks(): void {
    if (this.fetchHookInstalled) return;
    this.fetchHookInstalled = true;
    const originalFetch = window.fetch;
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      const response = await originalFetch.call(this, input, init);

      try {
        const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (urlStr.includes('/manifest') || urlStr.includes('/cadmium/')) {
          const clone = response.clone();
          clone.text().then((text) => {
            try {
              if (!text.includes('timedtexttracks')) return;
              const data = JSON.parse(text);
              const tracks = data?.timedtexttracks || data?.result?.timedtexttracks || data?.value?.timedtexttracks;
              if (Array.isArray(tracks) && tracks.length > 0) {
                logger.debug('[Manifest fetch clone] Found tracks', tracks.length);
                void discoveryEmitFromFetch(tracks);
              }
            } catch {}
          }).catch(() => {});
        }
      } catch {}

      return response;
    };
  }

  private stopPoller(): void {
    if (this.pollerTimer !== null) {
      clearInterval(this.pollerTimer);
      this.pollerTimer = null;
      logger.debug('[Cadmium poller stopped]', { source: this.lastCaptureSource, idleTicks: this.pollerIdleTicks });
    }
  }

  private startPoller(): void {
    if (this.pollerTimer !== null) return;
    this.pollerIdleTicks = 0;
    this.pollerTimer = setInterval(() => {
      const foundSomething = this.pollOnce();
      if (foundSomething) {
        this.pollerIdleTicks = 0;
        return;
      }
      this.pollerIdleTicks += 1;
      if (this.pollerIdleTicks >= POLL_MAX_IDLE_TICKS) {
        logger.debug('[Cadmium poller idle timeout — stopping until next REQUEST_TRACKS]');
        this.stopPoller();
      }
    }, POLL_INTERVAL_MS);
  }
}

// Hook point for the patched window.fetch (installed per instance).
let emitFromFetch: ((tracks: any[]) => void) | null = null;
function discoveryEmitFromFetch(tracks: any[]): void {
  emitFromFetch?.(tracks);
}

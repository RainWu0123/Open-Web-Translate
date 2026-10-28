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
  netflixVideoId,
} from './netflix-track-constants';

const logger = createLogger('NetflixTrackDiscovery');
// Internal response parsing must not run our global manifest interception hook.
const parseJson = JSON.parse;

export interface NetflixCaptureScope { videoId: string; epoch: number }

export interface TrackCandidate {
  profile: string;
  url: string;
  isText: boolean;
}

/** Strictly JSON-serializable track shape that crosses the bridge. */
export interface DiscoveredTrackPayload {
  trackId: string;
  label: string;
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

export function getMainVideoPlayer(api?: any, excludedSessions = new Set<string>()): { id: string; player: any } | null {
  const videoPlayerApi = api || getPlayerApi();
  if (!videoPlayerApi) return null;

  try {
    const sessionIds = (videoPlayerApi.getAllPlayerSessionIds?.() || []).filter((id: string) => !excludedSessions.has(id));
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
      if (entry && !entry.isImage && !/imsc.*(?:image|bitmap)/i.test(prof)) {
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
          const isText = !entry.isImage && !/imsc.*(?:image|bitmap)/i.test(prof);
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
function extractRawCadmiumTracks(playerObj = getMainVideoPlayer()): any[] {
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

function extractTracksFromPerformanceEntries(since = 0): any[] {
  try {
    const entries = performance.getEntriesByType('resource');
    const timedTextEntries = entries.filter((e) => e.startTime >= since && isSubtitleResourceUrl(e.name));
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
//
// Interoperability / provenance note:
// This module observes runtime objects and network responses exposed by the
// Netflix web player in the user's browser. It contains no Netflix source
// code and is not based on a Netflix SDK. These private runtime surfaces are
// brittle by nature and may change without notice.

export class NetflixTrackDiscovery {
  private videoId = netflixVideoId();
  private scopeEpoch = 0;
  private playerSessionId = getMainVideoPlayer()?.id || '';
  private retiredSessions = new Set<string>();
  private navigationCleanup: (() => void) | null = null;
  private capturedTracksStore: any[] = [];
  private lastCaptureSource = 'none';
  private tracksRevision = 0;
  private lastTracksFingerprint = '';
  private pollerTimer: ReturnType<typeof setInterval> | null = null;
  private pollerIdleTicks = 0;
  private jsonParseHookInstalled = false;
  private originalJsonParse: typeof JSON.parse | null = null;
  private fetchHookInstalled = false;
  private originalFetch: typeof window.fetch | null = null;
  private patchedFetch: typeof window.fetch | null = null;
  private originalXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
  private patchedXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;

  /** Diagnostic snapshot for __OWT_DEBUG__. */
  public lastPayload(): { tracks: any[]; source: string; revision: number } {
    this.captureScope();
    return { tracks: this.capturedTracksStore, source: this.lastCaptureSource, revision: this.tracksRevision };
  }

  public captureScope(): NetflixCaptureScope {
    const nextVideoId = netflixVideoId();
    if (nextVideoId !== this.videoId) {
      if (this.playerSessionId) this.retiredSessions.add(this.playerSessionId);
      this.playerSessionId = '';
      this.videoId = nextVideoId;
      this.resetScope();
    }
    const session = getMainVideoPlayer(undefined, this.retiredSessions)?.id;
    if (session && !this.retiredSessions.has(session)) {
      if (this.playerSessionId && this.playerSessionId !== session) this.resetScope();
      this.playerSessionId = session;
    }
    return { videoId: this.videoId, epoch: this.scopeEpoch };
  }

  public isCurrentScope(scope: NetflixCaptureScope): boolean {
    const current = this.captureScope();
    return current.videoId === scope.videoId && current.epoch === scope.epoch;
  }

  /** During navigation Netflix can expose the previous player's list briefly. */
  public currentPlayer(): { id: string; player: any } | null {
    this.captureScope();
    const current = getMainVideoPlayer(undefined, this.retiredSessions);
    return current && !this.retiredSessions.has(current.id) ? current : null;
  }

  /** OWT downloads are consumers, not evidence that Netflix selected a track. */
  public fetchResource(scope: NetflixCaptureScope, url: string, init?: RequestInit): Promise<Response> {
    if (!this.isCurrentScope(scope)) return Promise.reject(new Error('video-changed'));
    const fetchResource = this.originalFetch ?? window.fetch;
    return fetchResource.call(window, url, init);
  }

  private resetScope(): void {
    this.scopeEpoch += 1;
    this.capturedTracksStore = [];
    this.lastTracksFingerprint = '';
    this.lastCaptureSource = 'video changed';
    this.publish();
  }

  public start(): void {
    if (!this.navigationCleanup) {
      const onNavigation = () => { this.captureScope(); this.rearm(); };
      window.addEventListener('popstate', onNavigation);
      window.addEventListener('hashchange', onNavigation);
      const restorers: Array<() => void> = [];
      for (const method of ['pushState', 'replaceState'] as const) {
        const original = history[method];
        const patched = function(this: History, ...args: Parameters<typeof original>) {
          const result = original.apply(this, args);
          onNavigation();
          return result;
        };
        history[method] = patched;
        restorers.push(() => { if (history[method] === patched) history[method] = original; });
      }
      this.navigationCleanup = () => {
        window.removeEventListener('popstate', onNavigation);
        window.removeEventListener('hashchange', onNavigation);
        restorers.reverse().forEach(restore => restore());
      };
    }
    this.installManifestJsonHook();
    this.installNetworkHooks();
    this.startPoller();
  }

  public stop(): void {
    this.scopeEpoch += 1;
    this.navigationCleanup?.();
    this.navigationCleanup = null;
    this.uninstallManifestJsonHook();
    this.uninstallNetworkHooks();
    this.stopPoller();
  }

  /** Re-arm discovery after navigation invalidated previous captures. */
  public rearm(): void {
    this.captureScope();
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
      const player = this.currentPlayer();
      const tracks = player ? extractRawCadmiumTracks(player) : [];
      // Resource URLs alone do not identify a language, CC variant or film.
      // Only verified response bodies / explicit manifest URLs may bind them.
      if (tracks.length > 0) {
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
  public bindHydratedUrl(trackId: string, capturedUrl: string, scope = this.captureScope()): void {
    if (!this.isCurrentScope(scope)) return;
    if (!capturedUrl || this.capturedTracksStore.length === 0) return;
    const updatedTracks = this.capturedTracksStore.map((t) => {
      if (
        String(t.id) === String(trackId) || String(t.trackId) === String(trackId) ||
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
    this.captureScope();
    if (!tracks || tracks.length === 0) return;
    const byId = new Map(this.capturedTracksStore.map(track => [String(track.id), track]));
    for (const t of tracks.filter((track: any) => !track.isNoneTrack && !track.rawTrack?.isNoneTrack)) {
      const id = t.id ?? t.trackId ?? t.language;
      if (id == null) continue;
      const existing = byId.get(String(id));
      const foundCandidates = extractCandidateRepresentations(t);
      const candidates: TrackCandidate[] = foundCandidates.length ? foundCandidates : existing?.candidates || [];
      const bestCandidate = candidates.find((c) => c.isText) || candidates[0];
      const url = bestCandidate ? bestCandidate.url : '';
      byId.set(String(id), {
        id,
        label: t.label || t.displayName || t.languageDescription || existing?.label || t.language || t.bcp47,
        language: t.language || t.bcp47 || existing?.language || 'unknown',
        url,
        isCC: Boolean(t.isCC || t.isClosedCaptions || t.isCaption || t.rawTrackType === 'CLOSEDCAPTIONS' || existing?.isCC),
        rawTrack: t.rawTrack || t,
        downloadables: t.downloadables || t.ttDownloadables || existing?.downloadables,
        candidates,
      });
    }
    const normalizedTracks = [...byId.values()];

    const fingerprint = normalizedTracks
      .map((t) => JSON.stringify([t.id, t.language, t.label, t.url, t.isCC, t.candidates]))
      .sort()
      .join('|');

    if (!force && fingerprint === this.lastTracksFingerprint) return;

    this.lastTracksFingerprint = fingerprint;
    this.capturedTracksStore = normalizedTracks;
    this.lastCaptureSource = sourceLabel;

    const tracksWithUrl = normalizedTracks.filter((t) => Boolean(t.url)).length;
    logger.info(
      `[Step 2 Publish] Captured ${normalizedTracks.length} tracks via ${sourceLabel} ` +
      `(With URLs: ${tracksWithUrl}, Revision: ${this.tracksRevision})`,
    );

    // Strictly JSON-serializable payload only — the bridge mirrors it as a
    // JSON string for Firefox, so page objects must never cross.
    this.publish();
  }

  private publish(): void {
    this.tracksRevision += 1;
    const safeTracks: DiscoveredTrackPayload[] = this.capturedTracksStore.map((t) => ({
      trackId: String(t.id),
      label: String(t.label || t.language),
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
      videoId: this.videoId,
      scopeEpoch: this.scopeEpoch,
      tracks: safeTracks,
      // captureSource describes where tracks came from; 'source' is the
      // bridge's routing tag and must stay reserved.
      captureSource: this.lastCaptureSource,
    });

  }

  // ── hooks ──────────────────────────────────────────────────────────

  private findTimedTextTracks(obj: any, depth = 0, inheritedVideoId = ''): { tracks: any[]; videoId: string } | null {
    if (!obj || typeof obj !== 'object' || depth > 5) return null;
    const videoId = String(obj.videoId ?? obj.movieId ?? obj.viewableId ?? inheritedVideoId);
    if (Array.isArray(obj.timedtexttracks) && obj.timedtexttracks.length > 0) {
      return { tracks: obj.timedtexttracks, videoId };
    }
    if (Array.isArray(obj.tracks) && obj.tracks.length > 0 && obj.tracks[0]?.ttDownloadables) {
      return { tracks: obj.tracks, videoId };
    }
    for (const key of Object.keys(obj)) {
      if (obj[key] && typeof obj[key] === 'object') {
        const found = this.findTimedTextTracks(obj[key], depth + 1, videoId);
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
          (text.includes('timedtexttracks') || text.includes('ttDownloadables')) &&
          result &&
          typeof result === 'object'
        ) {
          const scope = this.captureScope();
          const found = this.findTimedTextTracks(result);
          // A global parse has no request provenance. After navigation only
          // a manifest identifying the current film is safe to accept.
          if (found && (found.videoId === scope.videoId || (!found.videoId && scope.epoch === 0))) {
            this.emit('JSON.parse deep intercept', found.tracks);
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
    this.originalFetch = originalFetch;
    const patchedFetch: typeof window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const scope = this.captureScope();
      const response = await originalFetch.call(window, input, init);

      try {
        if (!this.fetchHookInstalled || !this.isCurrentScope(scope)) return response;
        const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const mime = response.headers.get('content-type') || '';
        const subtitleResponse = urlStr.includes('nflxvideo.net') && /xml|vtt|text\/plain/i.test(mime);
        if (subtitleResponse || urlStr.includes('/manifest') || urlStr.includes('/cadmium/')) {
          const clone = response.clone();
          clone.text().then((text) => {
            try {
              if (!this.fetchHookInstalled || !this.isCurrentScope(scope)) return;
              if (subtitleResponse) {
                this.captureSubtitleDocument(urlStr, text);
                return;
              }
              if (!text.includes('timedtexttracks')) return;
              const found = this.findTimedTextTracks(parseJson(text));
              if (found && (!found.videoId || found.videoId === scope.videoId)) {
                this.emit('fetch response clone', found.tracks);
              }
            } catch {}
          }).catch(() => {});
        }
      } catch {}

      return response;
    };
    this.patchedFetch = patchedFetch;
    window.fetch = patchedFetch;

    const discovery = this;
    const originalOpen = XMLHttpRequest.prototype.open;
    this.originalXhrOpen = originalOpen;
    const patchedOpen = function(this: XMLHttpRequest, ...args: Parameters<typeof originalOpen>) {
      const scope = discovery.captureScope();
      const url = String(args[1]);
      this.addEventListener('load', function() {
        if (!discovery.fetchHookInstalled || !discovery.isCurrentScope(scope) || !url.includes('nflxvideo.net')) return;
        try {
          const mime = this.getResponseHeader('content-type') || '';
          if (this.status >= 200 && this.status < 300 && /xml|vtt|text\/plain/i.test(mime)) {
            const text = this.responseType === 'arraybuffer' && this.response
              ? new TextDecoder().decode(this.response)
              : this.responseType === 'document' && this.responseXML
                ? new XMLSerializer().serializeToString(this.responseXML)
                : !this.responseType || this.responseType === 'text' ? this.responseText : '';
            if (text) discovery.captureSubtitleDocument(this.responseURL || url, text);
          }
        } catch { /* Binary media responses must not be read as text. */ }
      }, { once: true });
      return originalOpen.apply(this, args);
    } as typeof originalOpen;
    this.patchedXhrOpen = patchedOpen;
    XMLHttpRequest.prototype.open = patchedOpen;
  }

  private captureSubtitleDocument(url: string, text: string): void {
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    const root = xml.documentElement;
    if (root.localName !== 'tt' || xml.getElementsByTagName('parsererror').length > 0 ||
        xml.getElementsByTagNameNS('*', 'p').length === 0) return;
    const language = root.getAttribute('xml:lang') || root.getAttribute('lang') || 'auto';
    const player = this.currentPlayer();
    const playerTracks = player ? extractRawCadmiumTracks(player).filter(t => !t.isNoneTrack) : [];
    const match = playerTracks.find(t => (t.bcp47 || t.language) === language);
    const id = String(match?.trackId || match?.id || `captured-${language}`);
    const others = this.capturedTracksStore.filter(t => String(t.id) !== id);
    this.emit('subtitle response body', [...others, {
      ...match, id, language, url,
      candidates: [{ profile: 'imsc-text', url, isText: true }],
    }]);
  }

  private uninstallNetworkHooks(): void {
    if (!this.fetchHookInstalled) return;

    // Avoid clobbering another library's patch if it replaced fetch after us.
    if (this.patchedFetch && window.fetch === this.patchedFetch && this.originalFetch) {
      window.fetch = this.originalFetch;
    }

    this.originalFetch = null;
    if (this.patchedXhrOpen && XMLHttpRequest.prototype.open === this.patchedXhrOpen && this.originalXhrOpen) {
      XMLHttpRequest.prototype.open = this.originalXhrOpen;
    }
    this.originalXhrOpen = null;
    this.patchedXhrOpen = null;
    this.patchedFetch = null;
    this.fetchHookInstalled = false;
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

import { detectSubtitleFormat, extractTextFromMp4Segment } from './netflix-subtitle-format';
import { extractTrackUrlUniversal } from './netflix-track-discovery';
import { looksLikeTrackUrl } from './netflix-track-constants';

type TrackRecord = Record<string, any>;

export interface NetflixTimedTextPlayer {
  getTimedTextTrackList(): TrackRecord[];
  setTimedTextTrack(track: TrackRecord): void;
  getCurrentTime?(): number;
  seek?(time: number): void;
}

export interface TrackHydrationResult {
  ok: boolean;
  url?: string;
  reason?: string;
}

export interface TrackHydrationDependencies {
  resourceEntries: () => PerformanceEntry[];
  fetchResource: typeof fetch;
  wait: (ms: number) => Promise<void>;
}

const ACTIVE_FLAGS = ['active', 'current', 'isSelected', 'isCurrentSubtitle'] as const;

function trackIdentity(track: TrackRecord | null | undefined): string {
  if (!track) return '';
  return String(track.trackId ?? track.id ?? track.bcp47 ?? track.language ?? '');
}

function findActiveTrack(list: TrackRecord[]): TrackRecord | null {
  return list.find((track) => ACTIVE_FLAGS.some((flag) => track?.[flag] === true)) ?? null;
}

function normalizeLanguage(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
}

export function subtitleLanguagesCompatible(expectedValue: unknown, actualValue: unknown): boolean {
  const expected = normalizeLanguage(expectedValue);
  const actual = normalizeLanguage(actualValue);
  if (!expected || !actual) return false;
  if (expected === actual || expected.startsWith(`${actual}-`) || actual.startsWith(`${expected}-`)) return true;

  const expectedBase = expected.split('-')[0];
  const actualBase = actual.split('-')[0];
  if (expectedBase !== actualBase) return false;
  if (expectedBase !== 'zh') return true;

  const script = (language: string): 'hant' | 'hans' | 'generic' => {
    if (/(?:^|-)(?:hant|tw|hk|mo|cht)(?:-|$)/.test(language)) return 'hant';
    if (/(?:^|-)(?:hans|cn|sg|chs)(?:-|$)/.test(language)) return 'hans';
    return 'generic';
  };
  const expectedScript = script(expected);
  const actualScript = script(actual);
  return expectedScript === 'generic' || actualScript === 'generic' || expectedScript === actualScript;
}

async function candidateDeclaresLanguage(
  url: string,
  expectedLanguage: string,
  fetchResource: typeof fetch,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetchResource(url, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const format = detectSubtitleFormat(bytes);
    if (format !== 'ttml') return false;
    const text = extractTextFromMp4Segment(bytes) || new TextDecoder('utf-8').decode(bytes);
    const declared = text.match(/<(?:(?:\w+):)?tt\b[^>]*\bxml:lang=["']([^"']+)["']/i)?.[1] ?? '';
    return subtitleLanguagesCompatible(expectedLanguage, declared);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Activates one Netflix timed-text track only long enough to discover and
 * verify its signed TTML URL. The prior player track is restored in a finally
 * block, unless the user changed to a third track while hydration was running.
 */
export async function hydrateNetflixTrackUrl(
  player: NetflixTimedTextPlayer,
  trackId: string,
  expectedLanguage: string,
  performSeek: boolean,
  dependencies: TrackHydrationDependencies,
): Promise<TrackHydrationResult> {
  const initialList = player.getTimedTextTrackList() || [];
  const target = initialList.find((track) =>
    [track.trackId, track.id, track.bcp47, track.language].some((value) => String(value ?? '') === trackId),
  );
  if (!target) return { ok: false, reason: 'track-not-found' };

  const explicitUrl = extractTrackUrlUniversal(target);
  if (explicitUrl) return { ok: true, url: explicitUrl };

  const original = findActiveTrack(initialList);
  // Mutating the player is unsafe when its current selection cannot be
  // identified: there would be no truthful way to restore the source line.
  if (!original) return { ok: false, reason: 'active-track-unknown' };
  const originalIdentity = trackIdentity(original);
  const targetIdentity = trackIdentity(target);
  const baseline = new Set(dependencies.resourceEntries().map((entry) => entry.name));
  const startedAt = performance.now();

  try {
    player.setTimedTextTrack(target);
    if (performSeek && typeof player.seek === 'function') {
      const currentTime = Number(player.getCurrentTime?.() ?? -1);
      if (currentTime >= 0) player.seek(currentTime);
    }
    await dependencies.wait(650);

    const candidates = dependencies.resourceEntries()
      .filter((entry) => entry.startTime >= startedAt - 50 && !baseline.has(entry.name) && looksLikeTrackUrl(entry.name))
      .sort((a, b) => b.startTime - a.startTime);
    for (const candidate of candidates) {
      if (await candidateDeclaresLanguage(candidate.name, expectedLanguage, dependencies.fetchResource)) {
        return { ok: true, url: candidate.name };
      }
    }
    return { ok: false, reason: 'track-url-not-verified' };
  } finally {
    if (original && originalIdentity && originalIdentity !== targetIdentity) {
      const current = findActiveTrack(player.getTimedTextTrackList() || []);
      // Restore only while our temporary target is still active. A third
      // identity means the user changed Netflix's own subtitle selector.
      if (!current || trackIdentity(current) === targetIdentity) {
        player.setTimedTextTrack(original);
      }
    }
  }
}

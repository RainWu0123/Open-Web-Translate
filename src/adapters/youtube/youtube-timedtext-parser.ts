import type { SubtitleCue } from '@/shared/subtitles/ttml-parser';
import { normalizeSubtitleCueText } from '@/shared/utils/subtitle-text';

interface YouTubeJson3Seg {
  utf8?: string;
  tOffsetMs?: number;
}

interface YouTubeJson3Event {
  tStartMs?: number;
  dDurationMs?: number;
  aAppend?: number;
  segs?: YouTubeJson3Seg[];
}

interface YouTubeJson3Payload {
  events?: YouTubeJson3Event[];
}

const SENTENCE_END_RE = /[.!?。！？…♪♫”"'\])»）」』】》]\s*$/;
const SPEAKER_START_RE = /^(-|--|—|\[|\(|（|♪|♫|>>)/;
const CJK_CHAR_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
const ABBREV_BEFORE_DOT_RE =
  /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr|vs|etc|No|Fig|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|U\.S|U\.K|e\.g|i\.e)|(?:^|\s)[A-Z])$/i;

const MAX_MERGED_DURATION_MS = 14_000;
const MAX_MERGE_GAP_MS = 1_200;
const MAX_LATIN_CHARS = 220;
const MAX_CJK_CHARS = 90;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

function normalizeCueText(raw: string): string {
  return normalizeSubtitleCueText(raw);
}

function joinSentenceFragments(left: string, right: string): string {
  return normalizeSubtitleCueText(`${left}\n${right}`);
}

/**
 * Splits a single raw cue when YouTube places the end of Sentence A and the
 * beginning of Sentence B inside the same timed event (e.g.,
 * "referring to the attack as quote alleged. Part of the").
 */
function splitCueAtSentenceBoundaries(cue: SubtitleCue): SubtitleCue[] {
  const text = cue.text.trim();
  if (!text) return [];

  const parts: string[] = [];
  const boundaryRe = /([.!?。！？…]+['"”’)\]}）」』】》]*)(?:\s+|(?=[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boundaryRe.exec(text)) !== null) {
    const punct = match[1];
    const splitAfter = match.index + match[0].length;
    if (splitAfter >= text.length) break;

    const beforePunct = text.slice(lastIndex, match.index).trim();
    const afterText = text.slice(splitAfter).trim();
    if (!beforePunct || !afterText) continue;

    if (punct.startsWith('.') && ABBREV_BEFORE_DOT_RE.test(beforePunct)) {
      continue;
    }

    const segmentText = text.slice(lastIndex, match.index + punct.length).trim();
    if (segmentText) {
      parts.push(segmentText);
      lastIndex = splitAfter;
    }
  }

  if (parts.length === 0) {
    return [cue];
  }

  const tail = text.slice(lastIndex).trim();
  if (tail) parts.push(tail);
  if (parts.length <= 1) return [cue];

  const totalChars = Math.max(1, parts.reduce((sum, p) => sum + p.length, 0));
  const totalDuration = Math.max(parts.length * 150, cue.endMs - cue.startMs);

  const result: SubtitleCue[] = [];
  let cursorMs = cue.startMs;
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    const shareMs = isLast
      ? Math.max(150, cue.endMs - cursorMs)
      : Math.max(150, Math.round((parts[i].length / totalChars) * totalDuration));
    const endMs = isLast ? Math.max(cursorMs + 150, cue.endMs) : cursorMs + shareMs;
    result.push({
      startMs: cursorMs,
      endMs,
      text: parts[i],
    });
    cursorMs = endMs;
  }

  return result;
}

/**
 * Deduplicate and coalesce fragmented or ASR rolling cues into complete timed sentences.
 */
export function coalesceYouTubeCues(rawCues: SubtitleCue[]): SubtitleCue[] {
  if (rawCues.length === 0) return [];

  const sorted = [...rawCues]
    .map((cue) => ({
      startMs: Math.max(0, Math.round(cue.startMs)),
      endMs: Math.max(Math.round(cue.startMs) + 150, Math.round(cue.endMs)),
      text: normalizeCueText(cue.text),
    }))
    .filter((cue) => cue.text.length > 0)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  if (sorted.length === 0) return [];

  // 1. Clamp overlapping rollup window durations so each fragment reflects its active speech interval
  // and drop exact/prefix duplicates emitted by YouTube ASR rollup lines.
  const deduplicated: SubtitleCue[] = [];
  for (const cue of sorted) {
    const prev = deduplicated[deduplicated.length - 1];
    if (prev) {
      if (prev.text === cue.text && Math.abs(cue.startMs - prev.startMs) <= 2000) {
        prev.endMs = Math.max(prev.endMs, cue.endMs);
        continue;
      }
      // If YouTube repeats the previous line as a prefix of the new rollup event at nearly the same timestamp
      if (
        cue.startMs - prev.startMs <= 600 &&
        cue.text.length > prev.text.length &&
        cue.text.toLowerCase().startsWith(prev.text.toLowerCase())
      ) {
        prev.text = cue.text;
        prev.endMs = Math.max(prev.endMs, cue.endMs);
        continue;
      }
      if (prev.endMs > cue.startMs) {
        prev.endMs = Math.max(prev.startMs + 120, cue.startMs);
      }
    }
    deduplicated.push({ ...cue });
  }

  // 1b. Split any event that contains an internal sentence boundary (e.g., "...alleged. Part of the")
  // so the trailing start of the next sentence merges forward instead of hanging on the previous cue.
  const sentenceAlignedPieces: SubtitleCue[] = [];
  for (const cue of deduplicated) {
    sentenceAlignedPieces.push(...splitCueAtSentenceBoundaries(cue));
  }

  // 2. Merge consecutive fragments into complete timed sentences.
  const coalesced: SubtitleCue[] = [];
  for (const cue of sentenceAlignedPieces) {
    const current = coalesced[coalesced.length - 1];
    if (!current) {
      coalesced.push({ ...cue });
      continue;
    }

    const gapMs = Math.max(0, cue.startMs - current.endMs);
    const combinedText = joinSentenceFragments(current.text, cue.text);
    const hasCjk = CJK_CHAR_RE.test(combinedText);
    const maxChars = hasCjk ? MAX_CJK_CHARS : MAX_LATIN_CHARS;
    const mergedDuration = cue.endMs - current.startMs;

    const shouldMerge =
      !SENTENCE_END_RE.test(current.text) &&
      !SPEAKER_START_RE.test(cue.text) &&
      gapMs <= MAX_MERGE_GAP_MS &&
      combinedText.length <= maxChars &&
      mergedDuration <= MAX_MERGED_DURATION_MS;

    if (shouldMerge) {
      current.text = combinedText;
      current.endMs = Math.max(current.endMs, cue.endMs);
    } else {
      coalesced.push({ ...cue });
    }
  }

  // 3. Final pass: guarantee strictly non-overlapping intervals for binary search in SyncEngine.
  for (let i = 0; i < coalesced.length - 1; i++) {
    const curr = coalesced[i];
    const next = coalesced[i + 1];
    if (curr.endMs >= next.startMs) {
      curr.endMs = Math.max(curr.startMs + 80, next.startMs - 1);
    }
  }

  return coalesced;
}

function preserveNativeCues(rawCues: SubtitleCue[]): SubtitleCue[] {
  const cues = [...rawCues].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const result: SubtitleCue[] = [];
  for (const cue of cues) {
    const previous = result[result.length - 1];
    if (previous && previous.endMs > cue.startMs) {
      if (previous.startMs === cue.startMs) result.pop();
      else previous.endMs = cue.startMs;
    }
    result.push({ ...cue });
  }
  return result;
}

function parseJson3TimedText(payload: YouTubeJson3Payload, preserveTiming = false): SubtitleCue[] {
  const events = Array.isArray(payload.events) ? payload.events : [];
  const rawCues: SubtitleCue[] = [];

  for (const event of events) {
    if (!event || typeof event.tStartMs !== 'number' || !Array.isArray(event.segs)) continue;
    const rawText = event.segs
      .map((seg) => (typeof seg?.utf8 === 'string' ? seg.utf8 : ''))
      .join('');
    const text = normalizeCueText(rawText);
    if (!text) continue;

    const startMs = Math.max(0, Math.round(event.tStartMs));
    const durationMs =
      typeof event.dDurationMs === 'number' && event.dDurationMs > 0
        ? Math.round(event.dDurationMs)
        : 2500;
    const previous = rawCues[rawCues.length - 1];
    const visibleText = preserveTiming && event.aAppend && previous && previous.endMs > startMs
      ? normalizeCueText(`${previous.text} ${text}`) : text;
    rawCues.push({
      startMs,
      endMs: startMs + durationMs,
      text: visibleText,
    });
  }

  return preserveTiming ? preserveNativeCues(rawCues) : coalesceYouTubeCues(rawCues);
}

function parseXmlTimedText(xml: string, preserveTiming = false): SubtitleCue[] {
  const rawCues: SubtitleCue[] = [];

  // Format 1: <text start="1.23" dur="4.56">...</text> (seconds)
  const textRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null;
  while ((match = textRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const body = match[2];
    const startMatch = /\bstart\s*=\s*["']([0-9.]+)["']/i.exec(attrs);
    if (!startMatch) continue;
    const durMatch = /\bdur\s*=\s*["']([0-9.]+)["']/i.exec(attrs);
    const startMs = Math.round(parseFloat(startMatch[1]) * 1000);
    const durMs = durMatch ? Math.round(parseFloat(durMatch[1]) * 1000) : 2500;
    const text = normalizeCueText(decodeHtmlEntities(body.replace(/<[^>]+>/g, ' ')));
    if (text && Number.isFinite(startMs)) {
      rawCues.push({
        startMs,
        endMs: startMs + Math.max(150, durMs),
        text,
      });
    }
  }

  if (rawCues.length > 0) {
    return preserveTiming ? preserveNativeCues(rawCues) : coalesceYouTubeCues(rawCues);
  }

  // Format 2: <p t="1230" d="4560">...</p> (milliseconds, srv3)
  const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  while ((match = pRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const body = match[2];
    const tMatch = /\bt\s*=\s*["'](\d+)["']/i.exec(attrs);
    if (!tMatch) continue;
    const dMatch = /\bd\s*=\s*["'](\d+)["']/i.exec(attrs);
    const startMs = parseInt(tMatch[1], 10);
    const durMs = dMatch ? parseInt(dMatch[1], 10) : 2500;
    const text = normalizeCueText(decodeHtmlEntities(body.replace(/<[^>]+>/g, '')));
    if (text && Number.isFinite(startMs)) {
      rawCues.push({
        startMs,
        endMs: startMs + Math.max(150, durMs),
        text,
      });
    }
  }

  return preserveTiming ? preserveNativeCues(rawCues) : coalesceYouTubeCues(rawCues);
}

/**
 * Parse a YouTube timedtext response (JSON3 or XML) into coalesced sentence-level SubtitleCues.
 */
export function parseYouTubeTimedText(payload: string, options: { preserveTiming?: boolean } = {}): SubtitleCue[] {
  const trimmed = payload?.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as YouTubeJson3Payload;
      return parseJson3TimedText(parsed, options.preserveTiming);
    } catch {
      return [];
    }
  }

  if (trimmed.startsWith('<')) {
    return parseXmlTimedText(trimmed, options.preserveTiming);
  }

  return [];
}

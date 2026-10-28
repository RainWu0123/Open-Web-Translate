/**
 * TTML/DFXP parser implemented against the W3C Timed Text specifications.
 *
 * Specification references:
 * - https://www.w3.org/TR/ttml1/
 * - https://www.w3.org/TR/ttml2/
 *
 * This parser is original project code; the URLs above document the format
 * semantics and namespace/time-expression conventions it interoperates with.
 */
import { normalizeSubtitleCueText } from '@/shared/utils/subtitle-text';

export interface SubtitleCue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface TtmlParseDiagnostics {
  xmlBytes: number;
  parseError: string | null;
  timeBase: string;
  frameRate: number;
  tickRate: number;
  paragraphCount: number;
  cueCount: number;
  firstCueMs: number | null;
  lastCueMs: number | null;
}

export interface TtmlParseResult {
  cues: SubtitleCue[];
  diagnostics: TtmlParseDiagnostics;
}

const TTML_NS = 'http://www.w3.org/ns/ttml';
const TTS_NS = 'http://www.w3.org/ns/ttml#styling';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const TTP_NS = 'http://www.w3.org/ns/ttml#parameter';

/**
 * Parse Netflix TTML/DFXP XML into timed cues.
 * Must be namespace-aware: Netflix often uses TTML namespaces where
 * simple querySelectorAll('p') misses elements.
 */
export function parseNetflixTtmlDetailed(xmlText: string): TtmlParseResult {
  const cues: SubtitleCue[] = [];
  const diagnostics: TtmlParseDiagnostics = {
    xmlBytes: new TextEncoder().encode(xmlText).length,
    parseError: null,
    timeBase: 'unknown',
    frameRate: 25,
    tickRate: 1000,
    paragraphCount: 0,
    cueCount: 0,
    firstCueMs: null,
    lastCueMs: null,
  };

  const timeToMs = (timeStr: string): number => {
    if (!timeStr) return 0;
    const raw = timeStr.trim();

    // TTML offset-time: 1.5s / 250ms / 75f / 120t.
    const offsetMatch = raw.match(/^(-?\d+(?:\.\d+)?)(h|m|s|ms|f|t)$/i);
    if (offsetMatch) {
      const value = Number(offsetMatch[1]);
      const unit = offsetMatch[2].toLowerCase();
      if (!Number.isFinite(value)) return 0;
      if (unit === 'h') return Math.round(value * 3600_000);
      if (unit === 'm') return Math.round(value * 60_000);
      if (unit === 's') return Math.round(value * 1000);
      if (unit === 'ms') return Math.round(value);
      if (unit === 'f') return Math.round((value / diagnostics.frameRate) * 1000);
      if (unit === 't') return Math.round((value / diagnostics.tickRate) * 1000);
    }

    if (raw.startsWith('#')) {
      const n = parseFloat(raw.slice(1));
      return Number.isFinite(n) ? Math.round(n) : 0;
    }

    const parts = raw.split(':');
    if (parts.length === 4) {
      const h = parseFloat(parts[0]) || 0;
      const m = parseFloat(parts[1]) || 0;
      const s = parseFloat(parts[2]) || 0;
      const f = parseFloat(parts[3]) || 0;
      return Math.round((h * 3600 + m * 60 + s + f / diagnostics.frameRate) * 1000);
    }
    if (parts.length === 3) {
      const h = parseFloat(parts[0]) || 0;
      const m = parseFloat(parts[1]) || 0;
      const s = parseFloat(parts[2]) || 0;
      return Math.round((h * 3600 + m * 60 + s) * 1000);
    }
    if (parts.length === 1) {
      const n = parseFloat(parts[0]);
      return Number.isFinite(n) ? Math.round(n * 1000) : 0;
    }
    return 0;
  };

  const getAttr = (el: Element, name: string): string => {
    return (
      el.getAttribute(name) ||
      el.getAttributeNS(null, name) ||
      el.getAttributeNS(TTS_NS, name) ||
      el.getAttributeNS(XML_NS, name) ||
      el.getAttribute(`tts:${name}`) ||
      el.getAttribute(`xml:${name}`) ||
      ''
    );
  };

  const collectPElements = (doc: Document): Element[] => {
    const found: Element[] = [];
    const seen = new Set<Element>();

    const pushAll = (list: ArrayLike<Element>) => {
      for (let i = 0; i < list.length; i++) {
        const el = list[i];
        if (!seen.has(el)) {
          seen.add(el);
          found.push(el);
        }
      }
    };

    try {
      pushAll(doc.getElementsByTagNameNS(TTML_NS, 'p'));
    } catch {
      // ignore
    }

    pushAll(doc.getElementsByTagName('p'));

    try {
      const all = doc.getElementsByTagName('*');
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        if (el.localName === 'p' || el.tagName === 'p' || /:p$/i.test(el.tagName)) {
          if (!seen.has(el)) {
            seen.add(el);
            found.push(el);
          }
        }
      }
    } catch {
      // ignore
    }

    return found;
  };

  const extractText = (el: Element): string => {
    const parts: string[] = [];

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent ?? '';
        if (t) parts.push(t);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as Element;
      const name = (element.localName || element.tagName || '').toLowerCase();
      if (name === 'br') {
        parts.push('\n');
        return;
      }
      if (name === 'rt' || name === 'rp') {
        return;
      }
      const rubyRole = getAttr(element, 'ruby').toLowerCase();
      if (rubyRole === 'text' || rubyRole === 'delimiter') {
        return;
      }
      for (let i = 0; i < element.childNodes.length; i++) {
        walk(element.childNodes[i]);
      }
    };

    walk(el);
    return normalizeSubtitleCueText(parts.join(''));
  };

  if (!xmlText || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(xmlText) || (!xmlText.includes('<') && !xmlText.includes('>'))) {
    diagnostics.parseError = 'Non-XML binary content';
    return { cues: [], diagnostics };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const tt = doc.documentElement;

    const readRootAttr = (name: string): string =>
      tt?.getAttribute(name) ||
      tt?.getAttributeNS(TTP_NS, name) ||
      tt?.getAttribute(`ttp:${name}`) ||
      '';

    diagnostics.timeBase = readRootAttr('timeBase') || 'media';
    const frameRate = Number(readRootAttr('frameRate'));
    const tickRate = Number(readRootAttr('tickRate'));
    if (Number.isFinite(frameRate) && frameRate > 0) diagnostics.frameRate = frameRate;
    if (Number.isFinite(tickRate) && tickRate > 0) diagnostics.tickRate = tickRate;

    const parseError = doc.getElementsByTagName('parsererror')[0];
    if (parseError && collectPElements(doc).length === 0) {
      diagnostics.parseError = parseError.textContent?.trim() || 'XML parsererror';
      console.warn('[OWT-TTML] XML parse error', diagnostics.parseError);
      return { cues: [], diagnostics };
    }

    const pElements = collectPElements(doc);
    diagnostics.paragraphCount = pElements.length;

    pElements.forEach((p) => {
      const begin = getAttr(p, 'begin');
      const end = getAttr(p, 'end');
      const dur = getAttr(p, 'dur');
      const text = extractText(p);

      if (!begin || !text) return;

      const startMs = timeToMs(begin);
      let endMs = end ? timeToMs(end) : 0;
      if (!endMs && dur) {
        endMs = startMs + timeToMs(dur);
      }
      if (endMs <= startMs) {
        endMs = startMs + 2000;
      }

      cues.push({ startMs, endMs, text });
    });
  } catch (err) {
    diagnostics.parseError = err instanceof Error ? err.message : String(err);
    console.warn('[OWT-TTML] Failed to parse TTML:', err);
  }

  const processed = postProcessTimedCues(cues);

  diagnostics.cueCount = processed.length;
  diagnostics.firstCueMs = processed[0]?.startMs ?? null;
  diagnostics.lastCueMs = processed.at(-1)?.endMs ?? null;
  return { cues: processed, diagnostics };
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
const DIALOGUE_MARKER_RE = /^(?:[-–—―•]|>>|[（(\[][^）)\]]+[）)\]])/;
const SENTENCE_TERMINAL_RE = /[.!?。！？…♪♫”"'\])»）」』】》]\s*$/;
const CJK_INCOMPLETE_END_RE = /[はがをにでとへのもやからまでよりっててでりしく、，]$/;
const LATIN_INCOMPLETE_END_RE =
  /(?:,|\b(?:the|a|an|to|of|in|on|for|with|at|by|from|into|about|as|that|which|who|whom|whose|where|when|while|and|or|but|because|if|than|is|are|was|were|be|been|has|have|had|will|would|can|could|should))\s*$/i;

function shouldCoalesceTimedCues(prev: SubtitleCue, next: SubtitleCue): boolean {
  const gapMs = Math.max(0, next.startMs - prev.endMs);
  if (gapMs > 350) return false;
  if (DIALOGUE_MARKER_RE.test(next.text)) return false;
  if (SENTENCE_TERMINAL_RE.test(prev.text)) return false;

  const mergedDuration = next.endMs - prev.startMs;
  if (mergedDuration > 12_000) return false;

  const combined = normalizeSubtitleCueText(`${prev.text}\n${next.text}`);
  const maxChars = CJK_RE.test(combined) ? 72 : 180;
  if (combined.length > maxChars) return false;

  if (CJK_RE.test(prev.text)) {
    return CJK_INCOMPLETE_END_RE.test(prev.text.trim());
  }

  return /^[a-z]/.test(next.text.trim()) || LATIN_INCOMPLETE_END_RE.test(prev.text.trim());
}

function postProcessTimedCues(rawCues: SubtitleCue[]): SubtitleCue[] {
  if (rawCues.length === 0) return [];

  const sorted = [...rawCues]
    .map((c) => ({
      startMs: c.startMs,
      endMs: c.endMs,
      text: normalizeSubtitleCueText(c.text),
    }))
    .filter((c) => c.text.length > 0)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  // 1. Merge simultaneous cues (e.g. two <p> tags at the same timestamp) and clamp overlaps
  const deoverlapped: SubtitleCue[] = [];
  for (const cue of sorted) {
    const prev = deoverlapped[deoverlapped.length - 1];
    if (prev) {
      if (Math.abs(cue.startMs - prev.startMs) <= 200) {
        if (prev.text !== cue.text && !prev.text.includes(cue.text)) {
          prev.text = normalizeSubtitleCueText(`${prev.text}\n${cue.text}`);
        }
        prev.endMs = Math.max(prev.endMs, cue.endMs);
        continue;
      }
      if (prev.endMs > cue.startMs) {
        prev.endMs = Math.max(prev.startMs + 150, cue.startMs - 20);
      }
    }
    deoverlapped.push({ ...cue });
  }

  // 2. Coalesce consecutive cues when a single sentence is split across two adjacent cues
  const coalesced: SubtitleCue[] = [];
  for (const cue of deoverlapped) {
    const prev = coalesced[coalesced.length - 1];
    if (prev && shouldCoalesceTimedCues(prev, cue)) {
      prev.text = normalizeSubtitleCueText(`${prev.text}\n${cue.text}`);
      prev.endMs = Math.max(prev.endMs, cue.endMs);
    } else {
      coalesced.push({ ...cue });
    }
  }

  // 3. Smooth micro-gaps and ensure human-readable continuity ("連段")
  for (let i = 0; i < coalesced.length; i++) {
    const cur = coalesced[i];
    const next = coalesced[i + 1];
    const duration = cur.endMs - cur.startMs;

    const maxAllowedEnd = next ? Math.max(cur.startMs + 150, next.startMs - 20) : cur.startMs + 2500;

    if (duration < 1000) {
      cur.endMs = Math.min(cur.startMs + 1200, Math.max(cur.endMs, maxAllowedEnd));
    }

    if (next && next.startMs > cur.endMs && next.startMs - cur.endMs <= 250) {
      cur.endMs = next.startMs - 20;
    }

    if (next && cur.endMs >= next.startMs) {
      cur.endMs = Math.max(cur.startMs + 80, next.startMs - 1);
    }
  }

  return coalesced;
}

/** Backward-compatible API for existing adapters. */
export function parseNetflixTtml(xmlText: string): SubtitleCue[] {
  if (xmlText.trimStart().startsWith('WEBVTT')) {
    const timestamp = (value: string): number => {
      const parts = value.split(':').map(Number);
      return parts.reduce((total, part) => total * 60 + part, 0) * 1000;
    };
    const cues: SubtitleCue[] = [];
    for (const block of xmlText.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
      const lines = block.split('\n');
      if (/^(WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0].trim())) continue;
      const index = lines.findIndex(line => line.includes('-->'));
      if (index < 0) continue;
      const timing = lines[index].match(/^\s*((?:\d+:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}\.\d{3})/);
      if (!timing) continue;
      const element = document.createElement('div');
      element.innerHTML = lines.slice(index + 1).join('\n').replace(/<[^>]*>/g, '');
      const text = normalizeSubtitleCueText(element.textContent || '');
      const startMs = timestamp(timing[1]);
      const endMs = timestamp(timing[2]);
      if (text && endMs > startMs) cues.push({ startMs, endMs, text });
    }
    return postProcessTimedCues(cues);
  }
  return parseNetflixTtmlDetailed(xmlText).cues;
}

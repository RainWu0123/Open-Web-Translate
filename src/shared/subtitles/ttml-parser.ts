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
      for (let i = 0; i < element.childNodes.length; i++) {
        walk(element.childNodes[i]);
      }
    };

    walk(el);
    return parts
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  };

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

  const sorted = cues.sort((a, b) => a.startMs - b.startMs);
  diagnostics.cueCount = sorted.length;
  diagnostics.firstCueMs = sorted[0]?.startMs ?? null;
  diagnostics.lastCueMs = sorted.at(-1)?.endMs ?? null;
  return { cues: sorted, diagnostics };
}

/** Backward-compatible API for existing adapters. */
export function parseNetflixTtml(xmlText: string): SubtitleCue[] {
  return parseNetflixTtmlDetailed(xmlText).cues;
}

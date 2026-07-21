export interface SubtitleCue {
  startMs: number;
  endMs: number;
  text: string;
}

const TTML_NS = 'http://www.w3.org/ns/ttml';
const TTS_NS = 'http://www.w3.org/ns/ttml#styling';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/**
 * Parse Netflix TTML/DFXP XML into timed cues.
 * Must be namespace-aware: Netflix often uses TTML namespaces where
 * simple querySelectorAll('p') misses elements.
 */
export function parseNetflixTtml(xmlText: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];

  const timeToMs = (timeStr: string): number => {
    if (!timeStr) return 0;
    const raw = timeStr.trim();

    // Frames: HH:MM:SS:FF (assume 1000/fps ≈ treat FF as centiseconds-ish → frames at 25fps common)
    // Prefer clock-time with fraction first.
    // Formats: HH:MM:SS.mmm | HH:MM:SS:FF | SS.mmm | #t ticks
    if (raw.startsWith('#')) {
      // Media tick timebase — Netflix rarely uses this; treat as ms if bare number after #
      const n = parseFloat(raw.slice(1));
      return Number.isFinite(n) ? Math.round(n) : 0;
    }

    const parts = raw.split(':');
    if (parts.length === 4) {
      // HH:MM:SS:FF — assume 25 fps unless we have better metadata
      const h = parseFloat(parts[0]) || 0;
      const m = parseFloat(parts[1]) || 0;
      const s = parseFloat(parts[2]) || 0;
      const f = parseFloat(parts[3]) || 0;
      return Math.round((h * 3600 + m * 60 + s + f / 25) * 1000);
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

    // Namespace-aware first
    try {
      pushAll(doc.getElementsByTagNameNS(TTML_NS, 'p'));
    } catch {
      // ignore
    }

    // Local-name fallback for documents without correct namespace URI
    pushAll(doc.getElementsByTagName('p'));

    // Some Netflix packs nest under different prefixes
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
    // Preserve <br/> as newlines; collapse other whitespace carefully.
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

    // Bail on hard parse errors with zero elements
    const parseError = doc.getElementsByTagName('parsererror')[0];
    if (parseError && collectPElements(doc).length === 0) {
      console.warn('[OWT-TTML] XML parse error', parseError.textContent);
      return [];
    }

    const pElements = collectPElements(doc);

    pElements.forEach((p) => {
      const begin = getAttr(p, 'begin');
      const end = getAttr(p, 'end');
      const text = extractText(p);

      if (begin && end && text) {
        cues.push({
          startMs: timeToMs(begin),
          endMs: timeToMs(end),
          text,
        });
      }
    });
  } catch (err) {
    console.warn('[OWT-TTML] Failed to parse TTML:', err);
  }

  return cues.sort((a, b) => a.startMs - b.startMs);
}

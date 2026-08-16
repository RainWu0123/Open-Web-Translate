/**
 * Netflix subtitle format detection.
 *
 * Netflix serves subtitle tracks as raw TTML, WebVTT, or text embedded in
 * MP4 segments (midx/moof boxes). This module owns byte-sniffing and text
 * extraction; callers only see 'webvtt' | 'ttml' | 'mp4-timed-text' |
 * 'unknown' and a best-effort text document.
 */

export function readAsciiPrefix(bytes: Uint8Array, length = 32): string {
  return [...bytes.slice(0, length)]
    .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
    .join('');
}

function hasControlBytes(str: string): boolean {
  return /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(str);
}

export function extractTextFromMp4Segment(bytes: Uint8Array): string | null {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const rawString = decoder.decode(bytes);

  const ttmlDocs: string[] = [];
  let searchIdx = 0;

  while (searchIdx < rawString.length) {
    let startIdx = rawString.indexOf('<?xml', searchIdx);
    const altStart1 = rawString.indexOf('<tt', searchIdx);
    const altStart2 = rawString.indexOf('<smpte:tt', searchIdx);

    const candidates = [startIdx, altStart1, altStart2].filter((idx) => idx !== -1);
    if (candidates.length === 0) break;
    startIdx = Math.min(...candidates);

    let endTag = '';
    const prefix = rawString.substring(startIdx, startIdx + 15);
    if (prefix.startsWith('<?xml') || prefix.startsWith('<tt')) {
      endTag = '</tt>';
    } else if (prefix.startsWith('<smpte:tt')) {
      endTag = '</smpte:tt>';
    }

    let endIdx = rawString.indexOf(endTag, startIdx);
    if (endIdx === -1 && endTag === '</tt>') {
      endIdx = rawString.indexOf('</smpte:tt>', startIdx);
      if (endIdx !== -1) endTag = '</smpte:tt>';
    }

    if (endIdx !== -1) {
      let doc = rawString.substring(startIdx, endIdx + endTag.length);
      if (!hasControlBytes(doc)) {
        doc = doc.replace(/<\?xml[^>]*\?>/g, '').trim();
        ttmlDocs.push(doc);
      }
      searchIdx = endIdx + endTag.length;
    } else {
      break;
    }
  }

  if (ttmlDocs.length > 0) {
    if (ttmlDocs.length === 1) return ttmlDocs[0];
    return `<root>\n${ttmlDocs.join('\n')}\n</root>`;
  }

  const vttStart = rawString.indexOf('WEBVTT');
  if (vttStart !== -1) {
    const candidate = rawString.substring(vttStart);
    if (!hasControlBytes(candidate)) {
      return candidate;
    }
  }

  return null;
}

export type SubtitleFormat = 'webvtt' | 'ttml' | 'mp4-timed-text' | 'unknown';

export function detectSubtitleFormat(bytes: Uint8Array): SubtitleFormat {
  const magic = readAsciiPrefix(bytes, 4096);
  const isMp4Container =
    magic.includes('midx') ||
    magic.includes('moof') ||
    magic.includes('mfhd') ||
    magic.includes('mdat') ||
    magic.includes('styp') ||
    magic.includes('SUBS');

  const prefix = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(0, 512))
    .trimStart();

  if (prefix.startsWith('WEBVTT')) return 'webvtt';
  if (prefix.startsWith('<?xml') || prefix.startsWith('<tt') || prefix.includes('<tt ')) return 'ttml';

  const extractedText = extractTextFromMp4Segment(bytes);
  if (extractedText) {
    return extractedText.includes('WEBVTT') ? 'webvtt' : 'ttml';
  }

  if (isMp4Container) {
    return 'mp4-timed-text';
  }

  return 'unknown';
}

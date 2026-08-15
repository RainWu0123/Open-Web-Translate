import { describe, it, expect } from 'vitest';
import { parseNetflixTtmlDetailed } from '@/shared/subtitles/ttml-parser';

// Minimal implementation of detectSubtitleFormat to reproduce & test
function readAsciiPrefix(bytes: Uint8Array, length = 32) {
  return [...bytes.slice(0, length)]
    .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
    .join('');
}

function extractTextFromMp4Segment(bytes: Uint8Array): string | null {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const rawString = decoder.decode(bytes);

  // Strict XML / TTML check — must contain actual TTML tags, not just random <t
  let startIdx = rawString.indexOf('<?xml');
  if (startIdx === -1) startIdx = rawString.indexOf('<tt');
  if (startIdx === -1) startIdx = rawString.indexOf('<smpte:tt');
  if (startIdx === -1) {
    const xmlnsIdx = rawString.indexOf('http://www.w3.org/ns/ttml');
    if (xmlnsIdx !== -1) {
      startIdx = rawString.lastIndexOf('<', xmlnsIdx);
    }
  }

  if (startIdx !== -1) {
    const endIdx = rawString.lastIndexOf('</tt>') || rawString.lastIndexOf('</smpte:tt>') || rawString.lastIndexOf('>');
    if (endIdx !== -1 && endIdx > startIdx) {
      const candidate = rawString.substring(startIdx, endIdx + 5);
      if (candidate.includes('<tt') || candidate.includes('<?xml')) {
        return candidate;
      }
    }
  }

  const vttStart = rawString.indexOf('WEBVTT');
  if (vttStart !== -1) {
    return rawString.substring(vttStart);
  }

  return null;
}

function detectSubtitleFormat(bytes: Uint8Array): 'webvtt' | 'ttml' | 'mp4-timed-text' | 'unknown' {
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

describe('MP4 Timed-Text Detection & Parsing Safety Unit Tests', () => {
  it('correctly identifies MP4 binary box containing random <t bytes as mp4-timed-text instead of ttml', () => {
    // Construct fake MP4 segment with magic "moof" and binary byte sequence containing "<t "
    const mockMp4Payload = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x6d, 0x6f, 0x6f, 0x66, // moof box header
      0x00, 0x00, 0x00, 0x10, 0x6d, 0x66, 0x68, 0x64, // mfhd box header
      0x3c, 0x74, 0x20, 0x70, 0x4c, 0x1f, 0x90, 0xef, // binary garbage starting with "<t pL\x1f"
      0x00, 0x00, 0x00, 0x20, 0x74, 0x72, 0x61, 0x66, // traf box header
    ]);

    const format = detectSubtitleFormat(mockMp4Payload);
    expect(format).toBe('mp4-timed-text');
  });

  it('safely handles non-XML binary string in parseNetflixTtmlDetailed without throwing DOMParser XML errors', () => {
    const binaryGarbage = '<t pL\x1f\x90\xef\x05\\*Q\x15';
    const result = parseNetflixTtmlDetailed(binaryGarbage);

    expect(result.cues).toEqual([]);
    expect(result.diagnostics.parseError).toBe('Non-XML binary content');
  });

  it('safely handles strings containing unicode replacement characters from invalid UTF-8', () => {
    const invalidUtf8Garbage = '<t pL\ufffd\ufffd\ufffds\u85eaq\\*Qr:>OY$ R6H[\'x(1_8ت~k\'GqX!3,?q';
    const result = parseNetflixTtmlDetailed(invalidUtf8Garbage);

    expect(result.cues).toEqual([]);
    expect(result.diagnostics.parseError).toBe('Non-XML binary content');
  });
});

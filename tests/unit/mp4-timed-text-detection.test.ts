import { describe, it, expect } from 'vitest';
import { detectSubtitleFormat } from '@/adapters/netflix/netflix-subtitle-format';
import { parseNetflixTtmlDetailed } from '@/shared/subtitles/ttml-parser';

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

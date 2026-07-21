import { describe, it, expect } from 'vitest';
import { parseNetflixTtml } from '@/shared/subtitles/ttml-parser';

describe('parseNetflixTtml', () => {
  it('parses namespaced TTML p elements with begin/end', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling">
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:03.500">Hello world</p>
      <p begin="00:00:04.000" end="00:00:06.000">Second line</p>
    </div>
  </body>
</tt>`;

    const cues = parseNetflixTtml(xml);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({
      startMs: 1000,
      endMs: 3500,
      text: 'Hello world',
    });
    expect(cues[1].text).toBe('Second line');
    expect(cues[1].startMs).toBe(4000);
  });

  it('preserves br as newlines', () => {
    const xml = `<?xml version="1.0"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="1.0" end="2.0">Line one<br/>Line two</p>
    </div>
  </body>
</tt>`;

    const cues = parseNetflixTtml(xml);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toContain('Line one');
    expect(cues[0].text).toContain('Line two');
    expect(cues[0].startMs).toBe(1000);
  });

  it('returns empty array for invalid xml without p cues', () => {
    const cues = parseNetflixTtml('<not-valid');
    expect(cues).toEqual([]);
  });
});

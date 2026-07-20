export interface SubtitleCue {
  startMs: number;
  endMs: number;
  text: string;
}

export function parseNetflixTtml(xmlText: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];

  const timeToMs = (timeStr: string): number => {
    if (!timeStr) return 0;
    // Format: HH:MM:SS.mmm or HH:MM:SS:FF or SS.mmm
    const parts = timeStr.trim().split(':');
    if (parts.length === 3) {
      const h = parseFloat(parts[0]);
      const m = parseFloat(parts[1]);
      const s = parseFloat(parts[2]);
      return Math.round((h * 3600 + m * 60 + s) * 1000);
    } else if (parts.length === 1) {
      return Math.round(parseFloat(parts[0]) * 1000);
    }
    return 0;
  };

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const pElements = doc.querySelectorAll('p');

    pElements.forEach((p) => {
      const begin = p.getAttribute('begin') || p.getAttribute('tts:begin');
      const end = p.getAttribute('end') || p.getAttribute('tts:end');
      const text = p.textContent?.trim();

      if (begin && end && text) {
        cues.push({
          startMs: timeToMs(begin),
          endMs: timeToMs(end),
          text: text.replace(/\s+/g, ' '),
        });
      }
    });
  } catch (err) {
    console.warn('[OWT-TTML] Failed to parse TTML:', err);
  }

  return cues.sort((a, b) => a.startMs - b.startMs);
}

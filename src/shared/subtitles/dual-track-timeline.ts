import type { SubtitleCue } from './ttml-parser';

export type DualSubtitleSegment = SubtitleCue & { primaryText: string; secondaryText: string };
const ALIGNMENT_TOLERANCE_MS = 300;

/** Align only unambiguous, overlapping cue pairs; never mutate the source tracks. */
export function mergeSubtitleTimelines(primary: SubtitleCue[], secondary: SubtitleCue[]): DualSubtitleSegment[] {
  const originals = [...primary].sort((a, b) => a.startMs - b.startMs);
  const translations = secondary.map(cue => ({ ...cue })).sort((a, b) => a.startMs - b.startMs);
  const sourceTranslations = translations.map(cue => ({ ...cue }));
  const overlap = (a: SubtitleCue, b: SubtitleCue) => Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs) > 0;
  for (let i = 0; i < translations.length; i++) {
    const cue = translations[i];
    const matches = originals.filter(original => overlap(original, cue));
    if (matches.length !== 1 || sourceTranslations.filter(other => overlap(matches[0], other)).length !== 1) continue;
    const original = matches[0];
    const start = Math.abs(cue.startMs - original.startMs) <= ALIGNMENT_TOLERANCE_MS ? original.startMs : cue.startMs;
    const end = Math.abs(cue.endMs - original.endMs) <= ALIGNMENT_TOLERANCE_MS ? original.endMs : cue.endMs;
    const previous = translations[i - 1], next = translations[i + 1];
    if (end <= start || (previous && start < previous.endMs) || (next && end > next.startMs)) continue;
    cue.startMs = start;
    cue.endMs = end;
  }
  const boundaries = [...new Set([...originals, ...translations].flatMap(c => [c.startMs, c.endMs]))].sort((a, b) => a - b);
  const segments: DualSubtitleSegment[] = [];
  for (let i = 0; i + 1 < boundaries.length; i++) {
    const startMs = boundaries[i], next = boundaries[i + 1];
    if (next <= startMs) continue;
    const primaryText = originals.find(c => c.startMs <= startMs && c.endMs > startMs)?.text ?? '';
    const secondaryText = translations.find(c => c.startMs <= startMs && c.endMs > startMs)?.text ?? '';
    if (primaryText || secondaryText) segments.push({ startMs, endMs: next - 1, text: primaryText, primaryText, secondaryText });
  }
  return segments;
}

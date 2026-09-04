/**
 * Bilingual line composition — the pure rule module for how a bilingual
 * subtitle turns into displayable lines.
 *
 * One place owns the displayMode semantics (which lines, in what order,
 * which is emphasised). The two rendering adapters — the Netflix fixed
 * overlay (SubtitleOverlayRenderer) and the YouTube inline segment — map
 * BilingualLine specs onto their own DOM. Pure function: zero DOM, so the
 * whole rule set is directly testable.
 */

export type BilingualDisplayMode = 'bilingual' | 'translation-first' | 'immersive';

export interface BilingualLineStyle {
  originalFontSize: string;
  translatedFontSize: string;
  originalColor: string;
  translatedColor: string;
}

export interface BilingualLine {
  kind: 'original' | 'translated';
  text: string;
  color: string;
  bold: boolean;
  fontSize: string;
}

export function composeBilingualLines(
  originalText: string,
  translatedText: string,
  mode: BilingualDisplayMode,
  style: BilingualLineStyle,
): BilingualLine[] {
  const originalLines = (originalText || '').split('\n').filter(Boolean);
  const translatedLines = (translatedText || '').split('\n').filter(Boolean);

  const original = (): BilingualLine[] =>
    originalLines.map((text) => ({
      kind: 'original' as const,
      text,
      color: style.originalColor,
      bold: false,
      fontSize: style.originalFontSize,
    }));

  const translated = (): BilingualLine[] =>
    translatedLines.map((text) => ({
      kind: 'translated' as const,
      text,
      color: style.translatedColor,
      bold: true,
      fontSize: style.translatedFontSize,
    }));

  // If original and translated are identical (e.g. video subtitles already in target language),
  // do not render two identical lines on top of each other.
  if (
    originalText &&
    translatedText &&
    originalText.trim().toLowerCase() === translatedText.trim().toLowerCase()
  ) {
    return original();
  }

  switch (mode) {
    case 'immersive':
      return translated();
    case 'translation-first':
      return [...translated(), ...original()];
    case 'bilingual':
    default:
      return [...original(), ...translated()];
  }
}

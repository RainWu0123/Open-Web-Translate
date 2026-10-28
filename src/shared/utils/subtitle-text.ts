const CJK_CHAR_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
const CJK_DIRECT_JOIN_END_RE = /[はがをにでとへのもやからまでよりっててでりしくっ、，・（「『【《〈]$/;
const DIALOGUE_TURN_START_RE = /^(?:[-–—―•]|>>|[（(\[][^）)\]]+[）)\]])/;

/**
 * Unwraps visual line breaks (<br/> / \n) inside a single subtitle cue so that:
 * 1. Wrapped sentences are joined into a single continuous sentence before
 *    translation (preventing translators from translating two half-sentences).
 * 2. Two-speaker dialogue lines in the same cue are placed side-by-side on one
 *    line instead of stacking into 4 vertical boxes (2 original + 2 translated).
 */
export function normalizeSubtitleCueText(raw: string): string {
  if (!raw) return '';
  const lines = raw
    .split(/\r?\n+/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);

  if (lines.length === 0) return '';
  if (lines.length === 1) return lines[0];

  let result = lines[0];
  for (let i = 1; i < lines.length; i++) {
    const next = lines[i];
    if (result === next) continue;

    if (DIALOGUE_TURN_START_RE.test(next)) {
      result = `${result}  ${next}`;
      continue;
    }

    const prevLast = result[result.length - 1] || '';
    const nextFirst = next[0] || '';
    if (CJK_CHAR_RE.test(prevLast) && CJK_CHAR_RE.test(nextFirst)) {
      if (CJK_DIRECT_JOIN_END_RE.test(result)) {
        result = `${result}${next}`;
      } else {
        result = `${result} ${next}`;
      }
    } else {
      result = `${result} ${next}`;
    }
  }

  return result.trim();
}

/**
 * Deterministic cleanup for machine-translated subtitle strings.
 *
 * Free translators cannot receive style instructions, so gendered alternatives
 * such as "先生/小姐" are normalized after the response instead.
 */
export function normalizeSubtitleAlternatives(text: string): string {
  let normalized = normalizeSubtitleCueText(text).replace(
    /(先生|小姐|女士)(?:[／/](?:先生|小姐|女士))+/g,
    (_match, _alternative: string, offset: number, fullText: string) => {
      const before = fullText.slice(0, offset).trimEnd();
      const previous = [...before].pop() || '';
      return /[A-Za-z0-9\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(previous) ? '' : '您好';
    },
  );

  normalized = normalized
    .replace(/(?:他|她|牠)[／/](?:他|她|牠)/g, '對方')
    .replace(/(?:你|妳)[／/](?:你|妳)/g, '你')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return normalized;
}

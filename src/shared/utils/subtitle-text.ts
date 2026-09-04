/**
 * Deterministic cleanup for machine-translated subtitle strings.
 *
 * Free translators cannot receive style instructions, so gendered alternatives
 * such as "先生/小姐" are normalized after the response instead.
 */
export function normalizeSubtitleAlternatives(text: string): string {
  let normalized = text.replace(
    /(先生|小姐|女士)(?:[／/](?:先生|小姐|女士))+/g,
    (match, _alternative: string, offset: number, fullText: string) => {
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

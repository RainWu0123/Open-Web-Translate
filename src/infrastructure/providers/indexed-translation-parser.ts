import { ProviderError } from '@/core/domain/errors/translation-errors';

export interface IndexedTranslationParseOptions {
  providerId: string;
  providerLabel: string;
  expectedCount: number;
}

/**
 * Parse the strict multi-segment wire format emitted by prompt-based local
 * providers:
 *
 *   [0] translated text
 *   [1] translated text
 *
 * Every requested index must appear exactly once. Missing, duplicate,
 * out-of-range, or unindexed output fails closed instead of guessing by line
 * position, which could attach a translation to the wrong source segment.
 */
export function parseIndexedTranslations(
  rawOutput: unknown,
  options: IndexedTranslationParseOptions,
): string[] {
  const { providerId, providerLabel, expectedCount } = options;

  if (!Number.isInteger(expectedCount) || expectedCount <= 0) {
    throw new ProviderError(providerId, `${providerLabel} parser received an invalid expected segment count`);
  }

  const output = typeof rawOutput === 'string' ? rawOutput : String(rawOutput ?? '');
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new ProviderError(providerId, `${providerLabel} returned an empty translation`);
  }

  const indexed = new Map<number, string>();

  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s*(.*)$/);
    if (!match) {
      throw new ProviderError(
        providerId,
        `${providerLabel} response contains unindexed content; expected "[idx] translation" for every segment`,
      );
    }

    const index = Number(match[1]);
    const text = match[2].trim();

    if (!Number.isSafeInteger(index) || index < 0 || index >= expectedCount) {
      throw new ProviderError(
        providerId,
        `${providerLabel} response contains out-of-range segment index ${match[1]}`,
      );
    }

    if (indexed.has(index)) {
      throw new ProviderError(
        providerId,
        `${providerLabel} response contains duplicate translation for segment ${index}`,
      );
    }

    if (!text) {
      throw new ProviderError(
        providerId,
        `${providerLabel} response has an empty translation for segment ${index}`,
      );
    }

    indexed.set(index, text);
  }

  if (indexed.size !== expectedCount) {
    const missing: number[] = [];
    for (let index = 0; index < expectedCount; index++) {
      if (!indexed.has(index)) missing.push(index);
    }

    throw new ProviderError(
      providerId,
      `${providerLabel} response is missing translation${missing.length === 1 ? '' : 's'} for segment${missing.length === 1 ? '' : 's'} ${missing.join(', ')}`,
    );
  }

  return Array.from({ length: expectedCount }, (_, index) => indexed.get(index)!);
}

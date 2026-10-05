import { ProviderError } from '@/core/domain/errors/translation-errors';

export interface IndexedTranslationParseOptions {
  providerId: string;
  providerLabel: string;
  expectedCount: number;
}

export class IndexedTranslationFormatError extends ProviderError {}

function formatError(providerId: string, message: string): IndexedTranslationFormatError {
  return new IndexedTranslationFormatError(providerId, message);
}

export function parseIndexedTranslations(
  rawOutput: unknown,
  options: IndexedTranslationParseOptions,
): string[] {
  const { providerId, providerLabel, expectedCount } = options;
  if (!Number.isInteger(expectedCount) || expectedCount <= 0) {
    throw formatError(providerId, `${providerLabel} parser received an invalid expected segment count`);
  }

  const output = typeof rawOutput === 'string' ? rawOutput : String(rawOutput ?? '');
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    throw formatError(providerId, `${providerLabel} returned an empty translation`);
  }

  const indexed = new Map<number, string>();
  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s*(.*)$/);
    if (!match) {
      throw formatError(providerId, `${providerLabel} response contains unindexed content; expected "[idx] translation" for every segment`);
    }
    const index = Number(match[1]);
    const translatedText = match[2].trim();
    if (!Number.isSafeInteger(index) || index < 0 || index >= expectedCount) {
      throw formatError(providerId, `${providerLabel} response contains out-of-range segment index ${match[1]}`);
    }
    if (indexed.has(index)) {
      throw formatError(providerId, `${providerLabel} response contains duplicate translation for segment ${index}`);
    }
    if (!translatedText) {
      throw formatError(providerId, `${providerLabel} response has an empty translation for segment ${index}`);
    }
    indexed.set(index, translatedText);
  }

  if (indexed.size !== expectedCount) {
    const missing: number[] = [];
    for (let index = 0; index < expectedCount; index++) if (!indexed.has(index)) missing.push(index);
    throw formatError(providerId, `${providerLabel} response is missing translation${missing.length === 1 ? '' : 's'} for segment${missing.length === 1 ? '' : 's'} ${missing.join(', ')}`);
  }

  return Array.from({ length: expectedCount }, (_, index) => indexed.get(index)!);
}

export async function parseIndexedTranslationsWithRepair(
  rawOutput: unknown,
  options: IndexedTranslationParseOptions,
  repair: (malformedOutput: string, error: IndexedTranslationFormatError) => Promise<unknown>,
): Promise<string[]> {
  try {
    return parseIndexedTranslations(rawOutput, options);
  } catch (error) {
    if (!(error instanceof IndexedTranslationFormatError)) throw error;
    const repaired = await repair(String(rawOutput ?? ''), error);
    return parseIndexedTranslations(repaired, options);
  }
}

export function buildIndexedRepairPrompt(rawOutput: string, expectedCount: number): string {
  return [
    'Reformat the previous translation output only. Do not translate again and do not add commentary.',
    `Return exactly ${expectedCount} lines, one for each index 0 through ${expectedCount - 1}, using this exact format:`,
    '[0] translated text',
    '[1] translated text',
    '...',
    'Preserve the wording of the previous translation as closely as possible.',
    '<previous_output>',
    rawOutput.slice(0, 16000),
    '</previous_output>',
  ].join('\n');
}

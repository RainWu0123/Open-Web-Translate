import { ProviderError } from '@/core/domain/errors/translation-errors';

export function parseStructuredJson(providerId: string, raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ProviderError(providerId as any, 'The model returned an empty analysis response');
  }
  let text = raw.trim();
  if (text.startsWith('```json')) text = text.slice(7);
  else if (text.startsWith('```')) text = text.slice(3);
  if (text.endsWith('```')) text = text.slice(0, -3);
  try {
    return JSON.parse(text.trim());
  } catch {
    throw new ProviderError(providerId as any, 'The model analysis response was not valid JSON');
  }
}

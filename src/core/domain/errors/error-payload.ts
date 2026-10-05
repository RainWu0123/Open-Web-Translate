import {
  ConfigurationError,
  NetworkError,
  ProviderError,
  QuotaExceededError,
} from './translation-errors';
import { MessageErrorCode, type ErrorPayload } from '@/core/contracts/messages';

export function toErrorPayload(error: unknown): ErrorPayload {
  const candidate = error as { message?: unknown; code?: unknown; providerId?: unknown; retryable?: unknown } | null;
  const message = typeof candidate?.message === 'string'
    ? candidate.message
    : error instanceof Error ? error.message : 'Unknown error';

  if (error instanceof ProviderError) return { code: MessageErrorCode.PROVIDER_ERROR, message, providerId: error.providerId, retryable: false };
  if (error instanceof NetworkError) return { code: MessageErrorCode.NETWORK_ERROR, message, retryable: true };
  if (error instanceof ConfigurationError) return { code: MessageErrorCode.CONFIGURATION_ERROR, message, retryable: false };
  if (error instanceof QuotaExceededError) return { code: MessageErrorCode.QUOTA_EXCEEDED, message, retryable: false };
  if (/abort/i.test(message)) return { code: MessageErrorCode.ABORTED, message, retryable: false };

  if (typeof candidate?.code === 'string') {
    return {
      code: candidate.code,
      message,
      ...(typeof candidate.providerId === 'string' ? { providerId: candidate.providerId } : {}),
      ...(typeof candidate.retryable === 'boolean' ? { retryable: candidate.retryable } : {}),
    };
  }
  return { code: MessageErrorCode.UNKNOWN_ERROR, message, retryable: false };
}

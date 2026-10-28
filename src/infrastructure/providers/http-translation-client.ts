/**
 * HTTP translation client — the shared transport module under every
 * network translation provider.
 *
 * One place owns the facts that used to be copy-pasted across five
 * providers: abort-vs-timeout signal composition, retries with backoff on
 * transient failures, JSON parsing, response-text sanitisation, and the
 * status → error mapping hook where provider-specific ladders live.
 *
 * Interface: httpTranslationFetch(options) → { status, json, bodyText }
 * Throwing:  Error('Translation aborted') for external aborts,
 *            NetworkError for timeouts/network/5xx (after retries),
 *            interpretStatus() results for provider-specific statuses,
 *            ProviderError for unparseable bodies.
 */
import {
  NetworkError,
  ProviderError,
} from '../../core/domain/errors/translation-errors';

export interface HttpTranslationFetchOptions {
  url: string;
  /** JSON-serialisable body; omit for GET. */
  body?: unknown;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  signal?: AbortSignal;
  /** Per-request timeout (default 15s). Composed with the caller's signal. */
  timeoutMs?: number;
  /** Retries on network errors and 5xx with exponential backoff (default 0). */
  retries?: number;
  /**
   * Provider-specific status ladder: return an Error instance to throw for
   * this (status, body) pair, or null to fall through to NetworkError.
   * Runs before generic 5xx handling.
   */
  interpretStatus?: (status: number, bodyText: string) => Error | null;
  /** Redacts secrets from messages that may leak into thrown errors/logs. */
  sanitize?: (message: string) => string;
}

export interface HttpTranslationFetchResult {
  status: number;
  json: unknown;
  bodyText: string;
}

const DEFAULT_TIMEOUT_MS = 15000;

/** Compose caller signal + timeout (replaces the old `??` that let one eat the other). */
function composeSignals(callerSignal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; onTimeout: () => boolean } {
  const timeoutController = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);

  const onCallerAbort = () => timeoutController.abort();
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

  return {
    signal: timeoutController.signal,
    onTimeout: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
      return timedOut;
    },
  };
}

function backoffMs(attempt: number, retryAfterHeader?: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(Math.round(seconds * 1000), 3000);
    }
  }
  const base = Math.min(200 * 2 ** attempt, 3000);
  const jitter = Math.floor(Math.random() * 50);
  return base + jitter;
}

export async function httpTranslationFetch(
  providerId: string,
  options: HttpTranslationFetchOptions,
): Promise<HttpTranslationFetchResult> {
  const {
    url,
    body,
    headers = {},
    method = body === undefined ? 'GET' : 'POST',
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 0,
    interpretStatus,
    sanitize = (m) => m,
  } = options;

  if (signal?.aborted) {
    throw new Error('Translation aborted');
  }

  let lastError: Error | null = null;
  let retryAfterHeader: string | null = null;
  const statusRetries = options.retries ?? 1;
  const maxAttempts = Math.max(retries, statusRetries);

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt - 1, retryAfterHeader)));
      retryAfterHeader = null;
      if (signal?.aborted) {
        throw new Error('Translation aborted');
      }
    }

    const { signal: composed, onTimeout } = composeSignals(signal, timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: composed,
      });
    } catch (err: any) {
      const timedOut = onTimeout();
      if (signal?.aborted) {
        throw new Error('Translation aborted');
      }
      lastError = timedOut
        ? new NetworkError(`[${providerId}] request timed out after ${timeoutMs}ms`)
        : new NetworkError(
            sanitize(`[${providerId}] network request failed: ${err?.message || 'unknown error'}`),
          );
      if (attempt < retries) {
        continue; // transient network error → retry only when retries > 0
      }
      throw lastError;
    }
    const timedOut = onTimeout();

    if (!response) {
      throw lastError ?? new NetworkError(`[${providerId}] empty response`);
    }

    // Prefer text() (needed for status ladders); fall back to json() for
    // Response polyfills that omit it. A read/parse failure is remembered
    // and surfaces as ProviderError on the success path.
    let bodyText = '';
    let bodyReadError: unknown = null;
    if (typeof (response as unknown as { text?: unknown }).text === 'function') {
      try {
        bodyText = await response.text();
      } catch (err) {
        bodyReadError = err;
      }
    } else if (typeof (response as unknown as { json?: unknown }).json === 'function') {
      try {
        bodyText = JSON.stringify((await response.json()) ?? null);
      } catch (err) {
        bodyReadError = err;
      }
    }

    if (!response.ok) {
      const interpreted = interpretStatus?.(response.status, bodyText) ?? null;
      const isTransientStatus =
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        response.status >= 500;

      if (isTransientStatus && attempt < statusRetries) {
        retryAfterHeader =
          typeof response.headers?.get === 'function' ? response.headers.get('retry-after') : null;
        lastError = interpreted ?? new NetworkError(`[${providerId}] HTTP ${response.status}`);
        continue;
      }

      if (interpreted) {
        throw interpreted;
      }
      throw timedOut
        ? new NetworkError(`[${providerId}] HTTP ${response.status} (timeout)`)
        : new NetworkError(sanitize(`[${providerId}] HTTP ${response.status}: ${bodyText.slice(0, 200)}`));
    }

    let json: unknown = null;
    if (bodyReadError) {
      throw new ProviderError(providerId, sanitize(`malformed response body: ${String(bodyReadError)}`));
    }
    if (bodyText.length > 0) {
      try {
        json = JSON.parse(bodyText);
      } catch {
        throw new ProviderError(providerId, sanitize(`invalid JSON response: ${bodyText.slice(0, 200)}`));
      }
    }

    return { status: response.status, json, bodyText };
  }

  throw lastError ?? new NetworkError(`[${providerId}] request failed`);
}

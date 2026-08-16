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

function backoffMs(attempt: number): number {
  return Math.min(300 * 2 ** attempt, 3000);
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

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt - 1)));
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
      onTimeout();
      if (signal?.aborted) {
        throw new Error('Translation aborted');
      }
      lastError = new NetworkError(
        sanitize(`[${providerId}] network request failed: ${err?.message || 'unknown error'}`),
      );
      continue; // transient → maybe retry
    }
    const timedOut = onTimeout();

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
      if (interpreted) {
        throw interpreted; // provider-specific: never retried
      }
      if (response.status >= 500 && attempt < retries) {
        lastError = new NetworkError(`[${providerId}] HTTP ${response.status}`);
        continue;
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

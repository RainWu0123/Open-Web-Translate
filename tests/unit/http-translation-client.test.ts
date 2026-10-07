import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpTranslationFetch } from '@/infrastructure/providers/http-translation-client';
import { NetworkError } from '@/core/domain/errors/translation-errors';

function installAbortAwareFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
        return;
      }
      signal?.addEventListener(
        'abort',
        () => reject(new DOMException('The operation was aborted.', 'AbortError')),
        { once: true },
      );
    })),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HTTP translation client abort classification', () => {
  it('reports its own timeout as a retryable network timeout, not a caller abort', async () => {
    vi.useFakeTimers();
    installAbortAwareFetch();

    const request = httpTranslationFetch('gemini-provider', {
      url: 'https://example.test/translate',
      timeoutMs: 25,
    });
    const assertion = expect(request).rejects.toBeInstanceOf(NetworkError);

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    await expect(request).rejects.toThrow('[gemini-provider] request timed out after 25ms');
  });

  it('preserves an explicit caller abort as Translation aborted', async () => {
    installAbortAwareFetch();
    const controller = new AbortController();

    const request = httpTranslationFetch('gemini-provider', {
      url: 'https://example.test/translate',
      signal: controller.signal,
      timeoutMs: 10_000,
    });

    controller.abort();
    await expect(request).rejects.toThrow('Translation aborted');
  });
});

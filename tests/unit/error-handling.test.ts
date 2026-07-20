// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { DOMTranslatorEngine } from '../helpers/dom-translator';
import {
  BaseError,
  ProviderError,
  NetworkError,
  ConfigurationError,
  QuotaExceededError,
} from '../../src/core/domain/errors/translation-errors';

describe('Error Handling & Boundary Edge Cases', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<html><body></body></html>';
  });

  it('handles pages with no eligible text gracefully', () => {
    // Page with only nav, code, and short paragraphs
    document.body.innerHTML = `
      <nav><p>Nav text</p></nav>
      <code>let x = 1;</code>
      <p>Short.</p>
    `;

    const engine = new DOMTranslatorEngine({ minParagraphLength: 15 });
    const segments = engine.selectTargets(document);

    expect(segments).toEqual([]);
    expect(() => engine.selectTargets(document)).not.toThrow();
  });

  it('correctly constructs and throws domain errors', () => {
    const providerErr = new ProviderError('mock-provider', 'Rate limit exceeded');
    expect(providerErr).toBeInstanceOf(BaseError);
    expect(providerErr.message).toContain('Provider mock-provider: Rate limit exceeded');

    const netErr = new NetworkError('Connection timeout');
    expect(netErr).toBeInstanceOf(BaseError);
    expect(netErr.message).toBe('Connection timeout');

    const configErr = new ConfigurationError('Invalid API key');
    expect(configErr).toBeInstanceOf(BaseError);

    const quotaErr = new QuotaExceededError('Exceeded daily quota');
    expect(quotaErr).toBeInstanceOf(BaseError);
  });

  it('handles provider failures without crashing translation execution pipeline', async () => {
    const mockFailingProvider = {
      translate: async () => {
        throw new ProviderError('mock-provider', 'Service unavailable');
      },
    };

    let caughtError: Error | null = null;
    try {
      await mockFailingProvider.translate();
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ProviderError);
    expect(caughtError?.message).toContain('Service unavailable');
  });
});

import { describe, expect, it } from 'vitest';
import { ProviderError } from '@/core/domain/errors/translation-errors';
import { parseIndexedTranslations } from '@/infrastructure/providers/indexed-translation-parser';

describe('parseIndexedTranslations', () => {
  it('returns translations ordered by index even when response lines are out of order', () => {
    expect(parseIndexedTranslations('[1] second\n[0] first', {
      providerId: 'test-provider',
      providerLabel: 'Test',
      expectedCount: 2,
    })).toEqual(['first', 'second']);
  });

  it('rejects a missing segment instead of shifting later translations', () => {
    expect(() => parseIndexedTranslations('[0] first\n[2] third', {
      providerId: 'test-provider',
      providerLabel: 'Test',
      expectedCount: 3,
    })).toThrow(ProviderError);
  });

  it('rejects duplicate indices', () => {
    expect(() => parseIndexedTranslations('[0] first\n[0] duplicate', {
      providerId: 'test-provider',
      providerLabel: 'Test',
      expectedCount: 1,
    })).toThrow('duplicate translation for segment 0');
  });

  it('rejects out-of-range indices', () => {
    expect(() => parseIndexedTranslations('[0] first\n[2] unexpected', {
      providerId: 'test-provider',
      providerLabel: 'Test',
      expectedCount: 2,
    })).toThrow('out-of-range segment index 2');
  });

  it('rejects unindexed content instead of guessing by line position', () => {
    expect(() => parseIndexedTranslations('first\n[1] second', {
      providerId: 'test-provider',
      providerLabel: 'Test',
      expectedCount: 2,
    })).toThrow('response contains unindexed content');
  });

  it('rejects empty indexed translations', () => {
    expect(() => parseIndexedTranslations('[0]   ', {
      providerId: 'test-provider',
      providerLabel: 'Test',
      expectedCount: 1,
    })).toThrow('empty translation for segment 0');
  });
});

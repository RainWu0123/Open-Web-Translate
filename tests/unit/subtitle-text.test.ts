import { describe, expect, it } from 'vitest';
import { normalizeSubtitleAlternatives } from '../../src/shared/utils/subtitle-text';

describe('normalizeSubtitleAlternatives', () => {
  it('removes gendered honorific alternatives after a name or noun', () => {
    expect(normalizeSubtitleAlternatives('（女士）幫忙的獸人先生/小姐？')).toBe('（女士）幫忙的獸人？');
    expect(normalizeSubtitleAlternatives('田中先生／小姐')).toBe('田中');
  });

  it('normalizes pronoun alternatives without adding annotations', () => {
    expect(normalizeSubtitleAlternatives('他/她來了')).toBe('對方來了');
    expect(normalizeSubtitleAlternatives('你／妳在哪裡？')).toBe('你在哪裡？');
  });

  it('keeps normal slash-containing content intact', () => {
    expect(normalizeSubtitleAlternatives('請走左/右邊的通道')).toBe('請走左/右邊的通道');
  });
});

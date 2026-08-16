import { describe, it, expect } from 'vitest';
import { composeBilingualLines } from '@/shared/subtitles/bilingual-lines';

const style = {
  originalFontSize: '18px',
  translatedFontSize: '22px',
  originalColor: '#ffffff',
  translatedColor: '#818cf8',
};

describe('composeBilingualLines', () => {
  it('bilingual mode renders original lines first, translated bolded after', () => {
    const lines = composeBilingualLines('Hello\nWorld', '你好\n世界', 'bilingual', style);

    expect(lines.map((l) => [l.kind, l.text])).toEqual([
      ['original', 'Hello'],
      ['original', 'World'],
      ['translated', '你好'],
      ['translated', '世界'],
    ]);
    expect(lines[0].bold).toBe(false);
    expect(lines[2].bold).toBe(true);
    expect(lines[0].fontSize).toBe('18px');
    expect(lines[2].color).toBe('#818cf8');
  });

  it('translation-first mode leads with translated lines', () => {
    const lines = composeBilingualLines('Hello', '你好', 'translation-first', style);
    expect(lines.map((l) => l.kind)).toEqual(['translated', 'original']);
  });

  it('immersive mode shows translated lines only', () => {
    const lines = composeBilingualLines('Hello', '你好', 'immersive', style);
    expect(lines.map((l) => l.kind)).toEqual(['translated']);
  });

  it('drops empty lines from both sides', () => {
    const lines = composeBilingualLines('Hello\n\n\n', '\n你好\n', 'bilingual', style);
    expect(lines.map((l) => l.text)).toEqual(['Hello', '你好']);
  });

  it('survives empty inputs', () => {
    expect(composeBilingualLines('', '', 'bilingual', style)).toEqual([]);
    expect(composeBilingualLines('', '你好', 'immersive', style).map((l) => l.text)).toEqual(['你好']);
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { SubtitleOverlayRenderer } from '@/shared/ui/subtitle-overlay-renderer';

describe('SubtitleOverlayRenderer live style updates', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('repaints the visible cue without waiting for a new subtitle', () => {
    const renderer = new SubtitleOverlayRenderer('live-style-overlay');
    renderer.mount(document.body);
    renderer.updateSettings({
      displayMode: 'bilingual',
      subtitleOriginalFontSize: 18,
      subtitleTranslatedFontSize: 22,
    });
    renderer.render('Original', '譯文');

    renderer.updateSettings({
      subtitleOriginalFontSize: 30,
      subtitleTranslatedFontSize: 34,
    });
    renderer.refresh();

    const overlay = document.getElementById('live-style-overlay');
    const sizes = Array.from(overlay?.shadowRoot?.querySelectorAll<HTMLElement>('span[data-kind]') || [])
      .map((element) => element.style.fontSize);
    expect(sizes).toContain('30px');
    expect(sizes).toContain('34px');
  });

  it('applies bottom position and line spacing immediately', () => {
    const renderer = new SubtitleOverlayRenderer('live-layout-overlay');
    renderer.mount(document.body);
    renderer.render('Original', '譯文');
    renderer.updateLayout({ bottomOffsetPx: 126, lineSpacingPx: 12 }, { resetDraggedPosition: true });

    const overlay = document.getElementById('live-layout-overlay')!;
    expect(overlay.style.bottom).toBe('126px');
    expect((overlay.shadowRoot?.firstElementChild as HTMLElement).style.gap).toBe('12px');
  });
});


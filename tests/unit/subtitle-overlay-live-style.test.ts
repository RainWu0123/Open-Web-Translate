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

  it('updates the word lookup hint when the interface language changes', () => {
    const renderer = new SubtitleOverlayRenderer('live-language-overlay');
    renderer.mount(document.body);
    renderer.updateSettings({ uiLanguage: 'en' });
    renderer.render('Hello', '你好', { tokens: [{ id: '1', surface: 'Hello', start: 0, end: 5 }] });
    expect(document.getElementById('live-language-overlay')?.shadowRoot?.querySelector<HTMLElement>('.owt-token')?.title).toBe('Click to look up');
    renderer.updateSettings({ uiLanguage: 'ja' });
    renderer.refresh();
    expect(document.getElementById('live-language-overlay')?.shadowRoot?.querySelector<HTMLElement>('.owt-token')?.title).toBe('クリックして調べる');
  });

  it('keeps an invisible, non-interactive slot when either subtitle is absent', () => {
    const renderer = new SubtitleOverlayRenderer('slot-overlay');
    const overlay = renderer.mount(document.body);
    renderer.updateSettings({ displayMode: 'bilingual', subtitleOriginalFontSize: 18, subtitleTranslatedFontSize: 22 });
    renderer.render('Original', '');
    const first = overlay.shadowRoot!.querySelector<HTMLElement>('[data-subtitle-slot="original"]')!;
    const second = overlay.shadowRoot!.querySelector<HTMLElement>('[data-subtitle-slot="translated"]')!;
    expect(first.textContent).toBe('Original');
    expect(second.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect((second.firstElementChild as HTMLElement).style.visibility).toBe('hidden');
    expect((second.firstElementChild as HTMLElement).style.fontSize).toBe('22px');
    renderer.render('', '譯文');
    expect(overlay.shadowRoot!.querySelector('[data-subtitle-slot="original"] [aria-hidden="true"]')).not.toBeNull();
    expect(overlay.shadowRoot!.querySelector('[data-subtitle-slot="translated"]')?.textContent).toBe('譯文');
    renderer.setLineVisibility({ translated: false });
    expect(overlay.shadowRoot!.querySelector('[data-subtitle-slot="translated"]')).toBeNull();
  });

  it('uses the same ordered slots during pending and translation-first display', () => {
    const renderer = new SubtitleOverlayRenderer('pending-slot-overlay');
    const overlay = renderer.mount(document.body);
    renderer.updateSettings({ displayMode: 'translation-first' });
    renderer.render('Original', 'Translating', { isPending: true });
    expect(Array.from(overlay.shadowRoot!.querySelectorAll<HTMLElement>('[data-subtitle-slot]')).map(el => el.dataset.subtitleSlot)).toEqual(['translated', 'original']);
    renderer.setLineVisibility({ translated: false });
    expect(overlay.shadowRoot!.querySelector('[data-subtitle-slot="translated"]')).toBeNull();
  });

  it('keeps both subtitle blocks independently anchored when either one spans multiple lines', () => {
    const renderer = new SubtitleOverlayRenderer('fixed-slots-overlay');
    const overlay = renderer.mount(document.body);
    renderer.updateSettings({ displayMode: 'bilingual', subtitleOriginalFontSize: 18, subtitleTranslatedFontSize: 22 });
    renderer.render('Original', 'First line\nSecond line');
    const upper = overlay.shadowRoot!.querySelector<HTMLElement>('[data-subtitle-slot="original"]')!;
    const lower = overlay.shadowRoot!.querySelector<HTMLElement>('[data-subtitle-slot="translated"]')!;
    expect(upper.style.position).toBe('absolute');
    expect(upper.style.bottom).toBe('2px');
    expect(lower.style.position).toBe('absolute');
    expect(lower.style.top).toBe('2px');
    renderer.render('Original', '');
    expect(overlay.shadowRoot!.querySelector<HTMLElement>('[data-subtitle-slot="original"]')!.style.bottom).toBe('2px');
    expect(overlay.shadowRoot!.querySelector<HTMLElement>('[data-subtitle-slot="translated"]')!.style.top).toBe('2px');
    renderer.updateSettings({ displayMode: 'translation-first' });
    renderer.render('Original\nSecond line', 'Translation');
    expect(overlay.shadowRoot!.querySelector<HTMLElement>('[data-subtitle-slot="translated"]')!.style.bottom).toBe('2px');
    expect(overlay.shadowRoot!.querySelector<HTMLElement>('[data-subtitle-slot="original"]')!.style.top).toBe('2px');
  });

  it('shows identical original and translated text in immersive mode', () => {
    const renderer = new SubtitleOverlayRenderer('immersive-duplicate-overlay');
    const overlay = renderer.mount(document.body);
    renderer.updateSettings({ displayMode: 'immersive' });
    renderer.render('Hello', 'Hello');
    expect(overlay.shadowRoot!.querySelector('[data-subtitle-slot="translated"]')?.textContent).toBe('Hello');
    expect(overlay.shadowRoot!.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});


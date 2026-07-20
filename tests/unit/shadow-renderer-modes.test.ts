// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderBilingualBlock,
  removeAllBilingualBlocks,
} from '../../src/features/page-translation/renderer/shadow-renderer';

describe('Multi-Mode Shadow DOM Renderer Unit Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="container">
        <p id="p1" class="existing-class" style="color: red;" aria-label="Paragraph 1">Original paragraph text</p>
      </div>
    `;
    removeAllBilingualBlocks(document);
  });

  it('renders bilingual mode without modifying original element styles or duplicating original text', () => {
    const p1 = document.getElementById('p1')!;
    const host = renderBilingualBlock(p1, 'seg-1', 'Original paragraph text', '譯文對照塊', 'bilingual');

    expect(host.className).toBe('owt-bilingual-host');
    expect(p1.classList.contains('owt-source-muted')).toBe(false);
    expect(p1.classList.contains('owt-source-hidden')).toBe(false);
    expect(p1.getAttribute('style')).toBe('color: red;');

    const shadow = host.shadowRoot!;
    expect(shadow).not.toBeNull();
    const translatedEl = shadow.querySelector('.owt-translated');
    expect(translatedEl).not.toBeNull();
    expect(translatedEl?.textContent).toBe('譯文對照塊');

    // Shadow DOM MUST NOT contain a duplicate copy of the original text
    const shadowOriginalEl = shadow.querySelector('.owt-original');
    expect(shadowOriginalEl).toBeNull();
  });

  it('renders translation-first mode applying owt-source-muted class without inline style mutation', () => {
    const p1 = document.getElementById('p1')!;
    renderBilingualBlock(p1, 'seg-1', 'Original paragraph text', '譯文優先結果', 'translation-first');

    expect(p1.classList.contains('owt-source-muted')).toBe(true);
    expect(p1.classList.contains('existing-class')).toBe(true);
    expect(p1.getAttribute('style')).toBe('color: red;');

    removeAllBilingualBlocks(document);
    expect(p1.classList.contains('owt-source-muted')).toBe(false);
    expect(p1.classList.contains('existing-class')).toBe(true);
  });

  it('renders immersive mode applying owt-source-hidden class and accessible toggle button', () => {
    const p1 = document.getElementById('p1')!;
    const host = renderBilingualBlock(p1, 'seg-1', 'Original paragraph text', '沉浸式翻譯譯文', 'immersive');

    expect(p1.classList.contains('owt-source-hidden')).toBe(true);

    const shadow = host.shadowRoot!;
    const toggleBtn = shadow.querySelector('button.owt-toggle-btn') as HTMLButtonElement | null;
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn?.tagName).toBe('BUTTON'); // Keyboard focusable HTML button element
    expect(toggleBtn?.getAttribute('aria-expanded')).toBe('false');
    expect(toggleBtn?.textContent).toBe('顯示原文');

    // Click toggle button -> reveals original text & updates aria-expanded
    toggleBtn?.click();
    expect(p1.classList.contains('owt-source-hidden')).toBe(false);
    expect(toggleBtn?.getAttribute('aria-expanded')).toBe('true');
    expect(toggleBtn?.textContent).toBe('隱藏原文');

    // Click toggle button again -> re-hides original text
    toggleBtn?.click();
    expect(p1.classList.contains('owt-source-hidden')).toBe(true);
    expect(toggleBtn?.getAttribute('aria-expanded')).toBe('false');
    expect(toggleBtn?.textContent).toBe('顯示原文');

    // Clean restore removes OWT classes and hosts
    removeAllBilingualBlocks(document);
    expect(p1.classList.contains('owt-source-hidden')).toBe(false);
    expect(document.querySelectorAll('.owt-bilingual-host').length).toBe(0);
  });

  it('is idempotent across repeated renders in all display modes', () => {
    const p1 = document.getElementById('p1')!;
    renderBilingualBlock(p1, 'seg-1', 'Original paragraph text', '譯文1', 'bilingual');
    renderBilingualBlock(p1, 'seg-1', 'Original paragraph text', '譯文2', 'immersive');

    const hosts = document.querySelectorAll('.owt-bilingual-host');
    expect(hosts.length).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import {
  restoreInlineTagsToHTML,
  type TagInfo,
} from '@/features/page-translation/extractor/tag-preservation';

function tagMapOf(...tags: TagInfo[]): Map<number, TagInfo> {
  return new Map(tags.map((t) => [t.id, t]));
}

describe('restoreInlineTagsToHTML escaping', () => {
  const link: TagInfo = {
    id: 1,
    tagName: 'a',
    attributes: [{ name: 'href', value: 'https://example.com/?a=1&b=2' }],
    innerText: 'link',
  };

  it('restores placeholders into the original tag', () => {
    const html = restoreInlineTagsToHTML('請看 <ph id=1>這個連結</ph>', tagMapOf(link));
    expect(html).toBe('請看 <a href="https://example.com/?a=1&amp;b=2">這個連結</a>');
  });

  it('escapes markup injected into the translated text', () => {
    const html = restoreInlineTagsToHTML(
      '<img src=x onerror=alert(1)> <ph id=1>ok</ph> <script>bad()</script>',
      tagMapOf(link),
    );
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('<a href=');
  });

  it('drops inline event handlers and javascript: URLs from original attributes', () => {
    const evil: TagInfo = {
      id: 2,
      tagName: 'a',
      attributes: [
        { name: 'href', value: ' JaVa\tScript:alert(1)' },
        { name: 'onclick', value: 'steal()' },
        { name: 'class', value: 'keep' },
      ],
      innerText: 'x',
    };
    const html = restoreInlineTagsToHTML('<ph id=2>x</ph>', tagMapOf(evil));
    expect(html).toBe('<a class="keep">x</a>');
  });

  it('keeps nested placeholders working', () => {
    const bold: TagInfo = { id: 2, tagName: 'b', attributes: [], innerText: 'b' };
    const html = restoreInlineTagsToHTML('<ph id=1>外層 <ph id=2>內層</ph></ph>', tagMapOf(link, bold));
    expect(html).toBe('<a href="https://example.com/?a=1&amp;b=2">外層 <b>內層</b></a>');
  });

  it('returns text untouched when there is no tag map (callers use textContent)', () => {
    expect(restoreInlineTagsToHTML('a < b', undefined)).toBe('a < b');
  });
});

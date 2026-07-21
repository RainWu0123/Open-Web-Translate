// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractTranslatableTargets,
  extractFromSelection,
  extractArticleBlocks,
  encodeInlineTags,
  restoreInlineTagsToHTML,
  renderBilingualBlock,
  renderInlineHost,
  removeAllBilingualBlocks,
} from '@/features/page-translation';

describe('R3 DOM Translation Engine Unit Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  describe('Selection Range Extraction (SelectionAdapter)', () => {
    it('extracts target from active range selection', () => {
      const container = document.createElement('div');
      container.id = 'text-container';
      const p = document.createElement('p');
      p.textContent = 'Selected text for translation';
      container.appendChild(p);
      document.body.appendChild(container);

      const range = document.createRange();
      range.selectNodeContents(p);

      const result = extractFromSelection(range, document);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.targets).toHaveLength(1);
        expect(result.targets[0].text).toBe('Selected text for translation');
        expect(result.targets[0].element).toBe(p);
        expect(result.targets[0].isInline).toBe(true);
      }
    });

    it('extracts selection from window.getSelection() adapter', () => {
      const p = document.createElement('p');
      p.textContent = 'Highlight me please';
      document.body.appendChild(p);

      const range = document.createRange();
      range.selectNodeContents(p);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      if (selection) {
        const result = extractFromSelection(selection, document);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.targets[0].text).toBe('Highlight me please');
        }
      }
    });

    it('returns error when selection is empty or collapsed', () => {
      const range = document.createRange(); // collapsed range
      const result = extractFromSelection(range, document);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_TARGETS_FOUND');
      }
    });
  });

  describe('Article Block Element Container Extractor', () => {
    it('extracts targets from p, h1-h6, li, td, div, blockquote, and article elements', () => {
      document.body.innerHTML = `
        <article id="art-1">
          <h1>Main Article Heading</h1>
          <h2>Subheading 2</h2>
          <h3>Subheading 3</h3>
          <h4>Subheading 4</h4>
          <h5>Subheading 5</h5>
          <h6>Subheading 6</h6>
          <p>Paragraph inside article.</p>
          <blockquote>Quotable quote text block.</blockquote>
          <ul>
            <li>List item 1</li>
            <li>List item 2</li>
          </ul>
          <table>
            <tr>
              <td>Table cell content</td>
            </tr>
          </table>
          <div id="standalone-div">Standalone text inside div</div>
        </article>
      `;

      const result = extractArticleBlocks(document);
      expect(result.success).toBe(true);
      if (result.success) {
        const texts = result.targets.map((t) => t.text);
        expect(texts).toContain('Main Article Heading');
        expect(texts).toContain('Subheading 2');
        expect(texts).toContain('Paragraph inside article.');
        expect(texts).toContain('Quotable quote text block.');
        expect(texts).toContain('List item 1');
        expect(texts).toContain('Table cell content');
        expect(texts).toContain('Standalone text inside div');
      }
    });

    it('skips parent container elements when child block elements are present', () => {
      document.body.innerHTML = `
        <article id="parent-article">
          <p id="child-p">Child paragraph text</p>
        </article>
      `;

      const result = extractTranslatableTargets(document);
      expect(result.success).toBe(true);
      if (result.success) {
        // Should extract child-p, not parent-article
        expect(result.targets).toHaveLength(1);
        expect(result.targets[0].element.id).toBe('child-p');
      }
    });

    it('filters out excluded tags (nav, footer, script, style, form, code, pre)', () => {
      document.body.innerHTML = `
        <nav><p>Nav text</p></nav>
        <footer><p>Footer text</p></footer>
        <code>code text</code>
        <pre>pre text</pre>
        <p id="valid-p">Valid paragraph text</p>
      `;

      const result = extractTranslatableTargets(document);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.targets).toHaveLength(1);
        expect(result.targets[0].element.id).toBe('valid-p');
      }
    });
  });

  describe('Tag Preservation (Inline Tag Placeholders)', () => {
    it('converts inner formatting tags (<a>, <b>, <i>, <code>, <span>) into <ph id=...> placeholders', () => {
      const p = document.createElement('p');
      p.innerHTML = 'Click <a href="https://example.com" class="link">here</a> for <b>details</b> and <i>more</i> content.';

      const { textWithPlaceholders, tagMap } = encodeInlineTags(p);

      expect(textWithPlaceholders).toContain('<ph id=1>here</ph>');
      expect(textWithPlaceholders).toContain('<ph id=2>details</ph>');
      expect(textWithPlaceholders).toContain('<ph id=3>more</ph>');
      expect(tagMap.size).toBe(3);

      const tag1 = tagMap.get(1);
      expect(tag1?.tagName).toBe('a');
      expect(tag1?.attributes).toEqual([
        { name: 'href', value: 'https://example.com' },
        { name: 'class', value: 'link' },
      ]);
    });

    it('restores inner formatting tags from placeholders post-translation', () => {
      const p = document.createElement('p');
      p.innerHTML = 'Visit <a href="https://openai.com">OpenAI</a> now.';

      const { tagMap } = encodeInlineTags(p);
      const translatedWithPh = '請造訪 <ph id=1>OpenAI 網站</ph> 了解詳情。';

      const restoredHTML = restoreInlineTagsToHTML(translatedWithPh, tagMap);
      expect(restoredHTML).toBe('請造訪 <a href="https://openai.com">OpenAI 網站</a> 了解詳情。');
    });

    it('handles nested inline tags during encoding and restoration', () => {
      const p = document.createElement('p');
      p.innerHTML = 'Check <a href="/ref"><b>bold link</b></a> here.';

      const { textWithPlaceholders, tagMap } = encodeInlineTags(p);
      expect(textWithPlaceholders).toContain('<ph id=1><ph id=2>bold link</ph></ph>');

      const translated = '查看 <ph id=1><ph id=2>粗體連結</ph></ph> 說明。';
      const restored = restoreInlineTagsToHTML(translated, tagMap);
      expect(restored).toBe('查看 <a href="/ref"><b>粗體連結</b></a> 說明。');
    });
  });

  describe('Dual Host Renderer (BlockHost & InlineHost in Open Shadow DOM)', () => {
    it('renders BlockHost (<div class="owt-bilingual-host">) with open Shadow DOM for block elements', () => {
      const p = document.createElement('p');
      p.textContent = 'Original paragraph text';
      document.body.appendChild(p);

      const host = renderBilingualBlock(p, 'seg-1', p.textContent, '翻譯段落內文', 'bilingual');

      expect(host.className).toBe('owt-bilingual-host');
      expect(host.shadowRoot).not.toBeNull();
      expect(host.shadowRoot?.mode).toBe('open');

      const transEl = host.shadowRoot?.querySelector('.owt-translated');
      expect(transEl?.textContent).toBe('翻譯段落內文');
    });

    it('renders InlineHost (<span class="owt-inline-host">) with open Shadow DOM for inline/selection ranges', () => {
      const p = document.createElement('p');
      const span = document.createElement('span');
      span.textContent = 'Inline phrase';
      p.appendChild(span);
      document.body.appendChild(p);

      const host = renderInlineHost(span, 'seg-inline-1', 'Inline phrase', '行內翻譯標籤', 'bilingual');

      expect(host.className).toBe('owt-inline-host');
      expect(host.shadowRoot).not.toBeNull();
      expect(host.shadowRoot?.mode).toBe('open');

      const badgeEl = host.shadowRoot?.querySelector('.owt-inline-badge');
      expect(badgeEl?.textContent).toBe(' (行內翻譯標籤)');
    });

    it('restores inner tags in BlockHost and InlineHost when tagMap is provided', () => {
      const p = document.createElement('p');
      p.innerHTML = 'Click <a href="http://test.org">link</a>';
      document.body.appendChild(p);

      const { tagMap } = encodeInlineTags(p);
      const translatedPh = '點擊 <ph id=1>連結網址</ph>';

      const host = renderBilingualBlock(p, 'seg-tag-1', p.textContent || '', translatedPh, 'bilingual', tagMap);
      const transEl = host.shadowRoot?.querySelector('.owt-translated');
      expect(transEl?.innerHTML).toBe('點擊 <a href="http://test.org">連結網址</a>');
    });

    it('completely cleans up BlockHost, InlineHost, and CSS classes on removeAllBilingualBlocks', () => {
      const p1 = document.createElement('p');
      p1.textContent = 'Block 1';
      document.body.appendChild(p1);

      const p2 = document.createElement('p');
      p2.textContent = 'Block 2';
      document.body.appendChild(p2);

      renderBilingualBlock(p1, 'seg-b1', 'Block 1', '譯文 1', 'translation-first');
      renderInlineHost(p2, 'seg-i1', 'Block 2', '譯文 2', 'bilingual');

      expect(document.querySelectorAll('.owt-bilingual-host, .owt-inline-host')).toHaveLength(2);
      expect(p1.classList.contains('owt-source-muted')).toBe(true);

      const removedCount = removeAllBilingualBlocks(document);
      expect(removedCount).toBe(2);
      expect(document.querySelectorAll('.owt-bilingual-host, .owt-inline-host')).toHaveLength(0);
      expect(p1.classList.contains('owt-source-muted')).toBe(false);
      expect(document.getElementById('owt-global-renderer-styles')).toBeNull();
    });
  });
});

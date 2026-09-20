import { describe, it, expect, beforeEach } from 'vitest';
import { VocabHighlighter } from '../../src/features/learning/vocab-highlighter';

describe('VocabHighlighter Unit Tests', () => {
  let highlighter: VocabHighlighter;
  let container: HTMLDivElement;

  beforeEach(() => {
    highlighter = new VocabHighlighter();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('highlights matched vocabulary words non-destructively in paragraphs', () => {
    container.innerHTML = '<p>The benevolent leader brought serendipity to the kingdom.</p>';

    const words = [
      { id: '1', word: 'benevolent', meaning: '仁慈的' },
      { id: '2', word: 'serendipity', meaning: '機緣' },
    ];

    const count = highlighter.highlight(container, words);
    expect(count).toBe(2);

    const marks = container.querySelectorAll('.owt-vocab-highlight');
    expect(marks.length).toBe(2);
    expect(marks[0].textContent).toBe('benevolent');
    expect(marks[1].textContent).toBe('serendipity');
  });

  it('ignores text inside script, code, and input tags', () => {
    container.innerHTML = `
      <code>const benevolent = true;</code>
      <p>A truly benevolent person.</p>
    `;

    const count = highlighter.highlight(container, [
      { id: '1', word: 'benevolent', meaning: '仁慈的' },
    ]);

    expect(count).toBe(1);
    const marks = container.querySelectorAll('.owt-vocab-highlight');
    expect(marks.length).toBe(1);
    expect(marks[0].closest('p')).not.toBeNull();
  });

  it('unhighlights cleanly and restores text nodes', () => {
    container.innerHTML = '<p>The benevolent leader.</p>';
    highlighter.highlight(container, [{ id: '1', word: 'benevolent' }]);

    expect(container.querySelectorAll('.owt-vocab-highlight').length).toBe(1);

    highlighter.unhighlight(container);
    expect(container.querySelectorAll('.owt-vocab-highlight').length).toBe(0);
    expect(container.textContent).toContain('The benevolent leader.');
  });
});

/**
 * Web Page Vocabulary Highlighter
 *
 * Scans article/webpage content for saved vocabulary items and non-destructively
 * highlights them with a subtle dashed underline, reinforcing spaced retrieval
 * during everyday web browsing.
 */

export interface HighlightableVocab {
  id: string;
  word: string;
  meaning?: string;
  phonetic?: string;
}

export class VocabHighlighter {
  private static readonly HIGHLIGHT_CLASS = 'owt-vocab-highlight';
  private static readonly IGNORED_TAGS = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'TEXTAREA',
    'INPUT',
    'SELECT',
    'CODE',
    'PRE',
    'AUDIO',
    'VIDEO',
    'CANVAS',
    'SVG',
  ]);

  /**
   * Highlights occurrences of target vocabulary words within a root element.
   *
   * @param root The container element to search (e.g. document.body)
   * @param vocabList List of words to search and highlight
   * @param onWordClick Optional callback when a highlighted word is clicked
   */
  public highlight(
    root: HTMLElement | Document,
    vocabList: HighlightableVocab[],
    onWordClick?: (vocab: HighlightableVocab, e: MouseEvent) => void,
  ): number {
    if (!root || vocabList.length === 0) return 0;

    // Filter valid words (at least 2 chars to avoid matching 'a', 'I')
    const validWords = vocabList.filter((v) => v.word && v.word.trim().length >= 2);
    if (validWords.length === 0) return 0;

    // Create lookup map
    const wordMap = new Map<string, HighlightableVocab>();
    for (const v of validWords) {
      wordMap.set(v.word.trim().toLowerCase(), v);
    }

    // Build regex with word boundaries for western text or exact clusters
    const escapedWords = Array.from(wordMap.keys())
      .sort((a, b) => b.length - a.length)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    // Match full words (\b for ascii, direct for cjk)
    const pattern = new RegExp(`(?<=^|\\W)(${escapedWords.join('|')})(?=\\W|$)`, 'gi');

    const walker = (root.nodeType === Node.DOCUMENT_NODE
      ? (root as Document).body
      : (root as HTMLElement)
    );
    if (!walker) return 0;

    const treeWalker = document.createTreeWalker(walker, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (VocabHighlighter.IGNORED_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(`.${VocabHighlighter.HIGHLIGHT_CLASS}`)) return NodeFilter.FILTER_REJECT;
        if (parent.closest('.owt-bilingual-host, .owt-inline-host, #owt-dictionary-popover')) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodesToReplace: Text[] = [];
    let current: Node | null;
    while ((current = treeWalker.nextNode())) {
      if (pattern.test((current as Text).textContent || '')) {
        nodesToReplace.push(current as Text);
      }
      pattern.lastIndex = 0; // reset regex
    }

    let highlightCount = 0;
    for (const textNode of nodesToReplace) {
      const text = textNode.textContent || '';
      pattern.lastIndex = 0;

      const fragment = document.createDocumentFragment();
      let lastIdx = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        const matchedWord = match[1];
        const matchStart = match.index;
        const matchEnd = matchStart + matchedWord.length;

        if (matchStart > lastIdx) {
          fragment.appendChild(document.createTextNode(text.slice(lastIdx, matchStart)));
        }

        const vocabInfo = wordMap.get(matchedWord.toLowerCase());
        const mark = document.createElement('mark');
        mark.className = VocabHighlighter.HIGHLIGHT_CLASS;
        mark.textContent = matchedWord;
        mark.style.background = 'transparent';
        mark.style.color = 'inherit';
        mark.style.borderBottom = '2px dashed rgba(20, 184, 166, 0.7)';
        mark.style.cursor = 'pointer';
        mark.style.padding = '0 1px';
        mark.title = vocabInfo?.meaning ? `生詞: ${matchedWord} (${vocabInfo.meaning})` : `生詞: ${matchedWord}`;

        if (vocabInfo && onWordClick) {
          mark.addEventListener('click', (e) => {
            e.stopPropagation();
            onWordClick(vocabInfo, e);
          });
        }

        fragment.appendChild(mark);
        lastIdx = matchEnd;
        highlightCount++;
      }

      if (lastIdx < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIdx)));
      }

      if (textNode.parentNode) {
        textNode.parentNode.replaceChild(fragment, textNode);
      }
    }

    return highlightCount;
  }

  /**
   * Reverts all vocabulary highlights, replacing mark tags with text nodes.
   */
  public unhighlight(root: HTMLElement | Document = document): void {
    const marks = root.querySelectorAll(`.${VocabHighlighter.HIGHLIGHT_CLASS}`);
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        parent.normalize();
      }
    });
  }
}

export const vocabHighlighter = new VocabHighlighter();

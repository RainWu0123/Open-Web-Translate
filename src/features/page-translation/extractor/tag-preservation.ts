export interface TagInfo {
  id: number;
  tagName: string;
  attributes: Array<{ name: string; value: string }>;
  innerText: string;
}

const FORMATTING_TAGS = new Set([
  'a',
  'b',
  'i',
  'code',
  'span',
  'em',
  'strong',
  'u',
  'mark',
  'sub',
  'sup',
]);

/**
 * Traverses element child nodes, replacing formatting inline elements (<a>, <b>, <i>, <code>, <span>, etc.)
 * with <ph id=N>innerText</ph> placeholders and recording tag metadata.
 */
export function encodeInlineTags(element: Element): {
  textWithPlaceholders: string;
  tagMap: Map<number, TagInfo>;
} {
  const tagMap = new Map<number, TagInfo>();
  let nextId = 1;

  function traverseNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tagName = el.tagName.toLowerCase();

      if (FORMATTING_TAGS.has(tagName)) {
        const id = nextId++;
        const attributes: Array<{ name: string; value: string }> = [];
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i];
          attributes.push({ name: attr.name, value: attr.value });
        }

        let innerText = '';
        el.childNodes.forEach((child) => {
          innerText += traverseNode(child);
        });

        tagMap.set(id, {
          id,
          tagName,
          attributes,
          innerText,
        });

        return `<ph id=${id}>${innerText}</ph>`;
      } else {
        let inner = '';
        el.childNodes.forEach((child) => {
          inner += traverseNode(child);
        });
        return inner;
      }
    }

    return '';
  }

  // Quick check if any element children exist
  let hasFormatting = false;
  element.childNodes.forEach((child) => {
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      FORMATTING_TAGS.has((child as Element).tagName.toLowerCase())
    ) {
      hasFormatting = true;
    }
  });

  if (!hasFormatting) {
    return {
      textWithPlaceholders: (element.textContent || '').trim(),
      tagMap,
    };
  }

  let textWithPlaceholders = '';
  element.childNodes.forEach((child) => {
    textWithPlaceholders += traverseNode(child);
  });

  return {
    textWithPlaceholders: textWithPlaceholders.trim(),
    tagMap,
  };
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function escapeText(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Matches the `<ph id=N>` / `</ph>` placeholder tokens (kept intact while escaping). */
const PH_TOKEN = /(<ph\s+id=["']?\d+["']?\s*>|<\/ph>)/gi;

/**
 * Attributes that must never be re-emitted from page markup into the
 * translated HTML: inline event handlers and script URLs.
 */
function isSafeAttribute(name: string, value: string): boolean {
  if (/^on/i.test(name)) return false;
  if (/^(href|src|xlink:href|action|formaction)$/i.test(name)) {
    // Strip whitespace/control chars browsers ignore inside the scheme.
    // eslint-disable-next-line no-control-regex
    const scheme = value.replace(/[\u0000- ]/g, '').toLowerCase();
    if (scheme.startsWith('javascript:') || scheme.startsWith('data:text/html')) return false;
  }
  return true;
}

/**
 * Reconstructs original HTML tags around translated text content from <ph id=N> placeholders.
 * Uses negative lookahead (?:(?!<ph)[\s\S])*? to process innermost nested placeholders first.
 */
export function restoreInlineTagsToHTML(
  translatedText: string,
  tagMap?: Map<number, TagInfo>,
): string {
  if (!translatedText) return '';
  if (!tagMap || tagMap.size === 0) {
    return translatedText;
  }

  // The translated text comes from an external provider (and originally from
  // arbitrary page text), and the result is assigned to innerHTML. Escape
  // everything except our own placeholder tokens so only the tags we
  // re-create below can reach the DOM.
  let result = translatedText
    .split(PH_TOKEN)
    .map((part, i) => (i % 2 === 1 ? part : escapeText(part)))
    .join('');
  let prev = '';
  const phRegex = /<ph\s+id=["']?(\d+)["']?\s*>((?:(?!<ph)[\s\S])*?)<\/ph>/gi;

  let iterations = 0;
  while (result !== prev && iterations < 10) {
    prev = result;
    result = result.replace(phRegex, (_match, idStr, innerContent) => {
      const id = parseInt(idStr, 10);
      const tagInfo = tagMap.get(id);
      if (!tagInfo) {
        return innerContent;
      }

      const attrPairs = tagInfo.attributes
        .filter((a) => isSafeAttribute(a.name, a.value))
        .map((a) => `${a.name}="${escapeAttr(a.value)}"`);
      const attrString = attrPairs.length > 0 ? ` ${attrPairs.join(' ')}` : '';
      return `<${tagInfo.tagName}${attrString}>${innerContent}</${tagInfo.tagName}>`;
    });
    iterations++;
  }

  return result;
}

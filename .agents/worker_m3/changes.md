# Architectural Changes Report: R3 (Web Page DOM Translation Engine)

**Worker**: `worker_m3` (Web Page DOM Translation Engine Worker)  
**Date**: 2026-07-21  
**Project**: `Open-Web-Translate v3`  

---

## 1. Summary of Changes

To achieve **R3 (Web Page DOM Translation Engine)** specifications as outlined by Explorer 3, we refactored and enhanced the page translation pipeline under `src/features/page-translation/`:

1. **Tag Preservation Module (`src/features/page-translation/extractor/tag-preservation.ts`)**:
   - Implemented `encodeInlineTags`: traverses target DOM elements and converts inner formatting tags (`<a>`, `<b>`, `<i>`, `<code>`, `<span>`, `<em>`, `<strong>`, `<u>`, `mark`, `sub`, `sup`) into `<ph id=N>innerText</ph>` placeholders before passing text payloads to translation providers. Records tag names and original HTML attributes in `TagInfo` metadata map.
   - Implemented `restoreInlineTagsToHTML`: processes translated text containing placeholders and reconstructs native HTML tags with original element attributes and translated inner content. Uses negative lookahead regex `/<ph\s+id=["']?(\d+)["']?\s*>((?:(?!<ph)[\s\S])*?)<\/ph>/gi` to safely handle deeply nested formatting tags.

2. **DOM Extractor Enhancements (`src/features/page-translation/extractor/dom-extractor.ts`)**:
   - **User Selection Extraction (`extractFromSelection`)**: Extracts selected text ranges from active `window.getSelection()` or `Range` objects (`SelectionAdapter`). Automatically binds root container element, encodes inline tags, generates stable segment IDs, and sets `isInline: true`.
   - **General Article Block Extractor (`extractArticleBlocks` / `extractTranslatableTargets`)**: Expands candidate block element selection from `p, h1, h2, h3` to a general HTML web page adapter supporting `p`, `h1-h6`, `li`, `td`, `div`, `blockquote`, `article`.
   - **Container Filtering**: Introduces `hasChildBlockCandidates` to skip parent block containers (`article`, `div`, `blockquote`, `td`) whenever their child block elements will be extracted independently, preventing nested translation block duplication.
   - **JSDOM Environment Compatibility**: Updated `isElementVisible` to detect JSDOM headless testing environments cleanly without false-positive hidden element rejections due to empty layout client rects.

3. **Dual Host Shadow DOM Renderer (`src/features/page-translation/renderer/shadow-renderer.ts`)**:
   - **`BlockHost` (`<div class="owt-bilingual-host">`)**: Appended after block elements using open Shadow DOM (`mode: 'open'`). Renders translated text with inline tag restoration (`restoreInlineTagsToHTML`), supporting `bilingual`, `translation-first`, and `immersive` display modes with accessible original text toggle.
   - **`InlineHost` (`<span class="owt-inline-host">`)**: Appended after selection/inline text ranges using open Shadow DOM (`mode: 'open'`). Displays inline translation badges (`<span class="owt-inline-badge">`) with inline tag restoration.
   - **Idempotency & Clean Restoration (`removeAllBilingualBlocks`)**: Ensures repeated calls do not duplicate host elements. `removeAllBilingualBlocks` removes both `.owt-bilingual-host` and `.owt-inline-host` elements, clears `.owt-source-muted` and `.owt-source-hidden` classes, and removes injected global styles (`#owt-global-renderer-styles`).

4. **Module Exports (`src/features/page-translation/index.ts`)**:
   - Re-exported all tag preservation, extraction, and dual host rendering functions.

5. **Comprehensive Unit Test Suite (`tests/unit/dom-translation.test.ts`)**:
   - Added 13 new unit tests covering:
     - Range and `window.getSelection()` extraction and error handling for empty/collapsed ranges.
     - Article block container extraction across `p`, `h1-h6`, `li`, `td`, `div`, `blockquote`, `article` and parent container deduplication.
     - Tag preservation encoding (`<ph id=...>`) and restoration with single, multi-attribute, and nested tags.
     - Open Shadow DOM rendering for `BlockHost` and `InlineHost` and complete DOM cleanup with `removeAllBilingualBlocks`.

---

## 2. Modified Files

- `src/features/page-translation/extractor/tag-preservation.ts` (New File)
- `src/features/page-translation/extractor/dom-extractor.ts` (Modified)
- `src/features/page-translation/renderer/shadow-renderer.ts` (Modified)
- `src/features/page-translation/index.ts` (Modified)
- `tests/unit/dom-translation.test.ts` (New File)

---

## 3. Test Execution Summary

```bash
npx vitest run tests/unit tests/integration --environment jsdom
```

Output:
- Test Files: **22 passed** (22)
- Tests: **109 passed** (109)
- Duration: 6.27s

```bash
pnpm typecheck
```

Output:
- `vue-tsc --noEmit` completed with **0 errors**.

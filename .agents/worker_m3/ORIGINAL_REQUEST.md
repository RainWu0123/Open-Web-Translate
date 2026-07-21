## 2026-07-21T17:03:20Z
<USER_REQUEST>
You are worker_m3 (Web Page DOM Translation Engine Worker).
Your working directory is: c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\worker_m3
Project root directory: c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3

Objective: Implement R3 (Web Page DOM Translation Engine).

Task details:
1. Read Explorer 3's specifications at:
   - `c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\teamwork_preview_explorer_init_3\analysis.md`
   - `c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\teamwork_preview_explorer_init_3\handoff.md`
2. Refactor/enhance DOM translation architecture under `src/features/page-translation/`:
   - Extractor (`extractor/dom-extractor.ts`): support user selection range extraction (`SelectionAdapter` / `window.getSelection()`) AND article block element container extraction (`p`, `h1-h6`, `li`, `td`, `div`, `blockquote`, `article`).
   - Tag Preservation: convert inner formatting tags (`<a>`, `<b>`, `<i>`, `<code>`, `<span>`) into `<ph id=...>` placeholders before translation and restore them post-translation.
   - Dual Host Renderer (`renderer/shadow-renderer.ts`): render bilingual translations using `BlockHost` (`<div class="owt-bilingual-host">`) for block elements and `InlineHost` (`<span class="owt-inline-host">`) for selection/inline text ranges via open Shadow DOM.
3. Write unit tests under `tests/unit/dom-translation.test.ts` verifying selection extraction, inline tag placeholders, and Shadow DOM rendering.
4. Create `changes.md` and `handoff.md` in `c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\worker_m3` detailing changes, architecture, and test output.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work.

</USER_REQUEST>

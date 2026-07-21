# Handoff Report: R3, R4 & Test Infrastructure Design

**Agent**: `teamwork_preview_explorer_init_3`  
**Working Directory**: `c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\teamwork_preview_explorer_init_3`  
**Date**: 2026-07-21  
**Handoff Type**: Hard (Task Complete)

---

## 1. Observation

Direct observations from codebase inspection:

1. **DOM Extractor (`src/features/page-translation/extractor/dom-extractor.ts`, lines 96-97)**:
   ```typescript
   export function extractTranslatableTargets(doc: Document = document): ExtractionResult {
     const candidateElements = Array.from(doc.querySelectorAll('p, h1, h2, h3'));
   ```
   - Target extraction is currently hardcoded to `p, h1, h2, h3`. It does not support user selection (`window.getSelection()`), general article block discovery (`article, section, main, div, li, blockquote`), or preservation of inner inline tags (`<a>`, `<b>`, `<i>`).

2. **Shadow Renderer (`src/features/page-translation/renderer/shadow-renderer.ts`, lines 56-60)**:
   ```typescript
   if (!host) {
     host = doc.createElement('div');
     host.className = 'owt-bilingual-host';
     originalEl.insertAdjacentElement('afterend', host);
   }
   ```
   - Host insertion creates a block element (`<div>`) inserted after the target (`afterend`). This disrupts inline text selections, text nodes, and table cells.

3. **Provider Contract & Providers (`src/core/contracts/provider.ts`, lines 12-18 & `src/infrastructure/providers/`)**:
   - Provider contract `TranslationProvider` is implemented by `GoogleTranslateProvider`, `DeepLProvider`, `GeminiProvider`, and `MockProvider`.
   - Providers execute remote HTTP API calls (`translate.googleapis.com`, `api.deepl.com`, `generativelanguage.googleapis.com`).
   - No providers exist for offline local private models (Ollama, Local HTTP endpoint, Chrome Built-in AI).

4. **Background Failover Policy (`src/entrypoints/background.ts`, lines 99-109)**:
   ```typescript
   } catch (err: any) {
     logger.warn(`Primary provider ${activeProviderId} failed, falling back to MockProvider`, err);
     // Failover fallback to MockProvider
     providerResult = await mockProvider.translate(...)
   }
   ```
   - Background service worker unconditionally falls back to `MockProvider` when primary provider fails. Fallback logic lacks privacy boundary enforcement between offline private AI providers and cloud/mock providers.

5. **Test Setup (`package.json`, lines 19 & `vitest.config.ts`, lines 4-8)**:
   ```json
   "scripts": {
     "test": "vitest run --environment jsdom"
   }
   ```
   - Testing is limited to JSDOM environment in Vitest. No Playwright configuration or real browser MV3 extension E2E test setup exists in the codebase.

---

## 2. Logic Chain

1. **Observation 1 & 2 -> R3 Design Conclusion**:
   - Since `dom-extractor.ts` only selects `p, h1, h2, h3` and `shadow-renderer.ts` only appends block `<div>` elements after target nodes, translating selected text ranges or arbitrary HTML elements (`li`, `td`, `div`) breaks page layout or fails to extract text.
   - *Reasoning Step*: R3 must introduce a dual extractor pipeline: (1) Selection Adapter using `window.getSelection()` for user-selected text, and (2) Smart DOM Container Extractor for general HTML article blocks. Rendering must support dual host types: `BlockHost` (`<div class="owt-bilingual-host">`) for block elements and `InlineHost` (`<span class="owt-inline-host">`) for selection/inline text nodes, alongside inline tag placeholder preservation (`<ph id=...>`).

2. **Observation 3 & 4 -> R4 Design Conclusion**:
   - Since current providers target cloud services (Google, DeepL, Gemini) and `background.ts` auto-fallbacks on error, users seeking 100% offline privacy cannot run local LLMs safely.
   - *Reasoning Step*: R4 must implement 3 dedicated local providers (`OllamaProvider` for `http://localhost:11434`, `LocalHttpProvider` for OpenAI-compatible local APIs, `ChromeBuiltInAIProvider` for `window.translation`). `background.ts` must enforce a **Strict Privacy Boundary**: local private providers MUST NOT auto-fallback to cloud or mock services on failure to prevent data leakage.

3. **Observation 5 -> Test Infrastructure Design Conclusion**:
   - Since unit/integration tests run purely under Vitest + JSDOM, extension-specific APIs (`chrome.runtime`, background SW lifecycle, content script injection, popup/options UI interactions, real Shadow DOM rendering) are unverified in actual browser environments.
   - *Reasoning Step*: The test infrastructure must be upgraded to a **Dual-Track E2E Setup**: Track 1 maintains ultra-fast Vitest + JSDOM unit/integration tests, while Track 2 introduces Playwright (`@playwright/test`) loading the unpacked MV3 extension (`--load-extension=.output/chrome-mv3`) for real browser automated E2E testing.

---

## 3. Caveats

1. **Browser CORS & Extension Permissions**:
   - Connecting to `http://localhost:11434` (Ollama) or `http://127.0.0.1:1234` (LM Studio) from content scripts or background service workers requires explicit manifest host permissions or local fetch handling without CORS restrictions. `wxt.config.ts` must include `'http://localhost/*', 'http://127.0.0.1/*'` under `host_permissions`.
2. **Chrome Built-in AI API Stability**:
   - Chrome's Built-in AI (`window.translation` / `self.ai`) is currently an experimental feature in Chrome (Behind flags `#translation-api` and `#prompt-api-for-gemini-nano`). `ChromeBuiltInAIProvider` must include robust feature detection and fall back gracefully with clear UI notices if Chrome flags are disabled.
3. **Playwright Extension Testing**:
   - Playwright requires headed Chrome mode (`headless: false` or `--headless=new`) when testing Manifest V3 extensions, as service workers may behave differently in classic headless mode.

---

## 4. Conclusion

The technical design specifications for R3 (Web Page DOM Adapter), R4 (Local Private AI Providers), and the Dual-Track E2E Test Infrastructure are fully formulated and documented in `analysis.md`. The design guarantees:
- Non-destructive DOM extraction and rendering preserving inline formatting, selected text ranges, and page layout.
- 100% offline, privacy-first translation via Ollama, Local HTTP, and Chrome Built-in AI, backed by a strict privacy boundary preventing cloud leakage.
- Comprehensive dual-track testing combining fast Vitest unit/integration tests with Playwright MV3 browser extension E2E automation.

---

## 5. Verification Method

To verify the design specification and validate the project setup:

1. **Inspect Analysis Report**:
   - View `analysis.md` in this directory (`c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\teamwork_preview_explorer_init_3\analysis.md`) to verify full architectural specifications for R3, R4, and E2E testing.

2. **Run Unit & Integration Test Suite**:
   ```bash
   pnpm test
   ```
   - Verify that all 21 existing unit and integration tests pass without regression.

3. **Verify File Layout Compliance**:
   - Confirm that all exploration artifacts (`analysis.md`, `handoff.md`, `BRIEFING.md`, `progress.md`, `ORIGINAL_REQUEST.md`) reside strictly within `.agents/teamwork_preview_explorer_init_3/` and zero modifications were made to project source code files under `src/` or `tests/`.

---

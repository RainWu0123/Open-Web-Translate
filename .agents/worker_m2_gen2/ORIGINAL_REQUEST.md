## 2026-07-22T01:14:07+08:00
You are worker_m2_gen2 (UI Component Decomposition Worker).
Your working directory is: c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\worker_m2_gen2
Project root directory: c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3

Objective: Implement R2 (Monolithic UI Component Decomposition).

Task details:
1. Read Explorer 2's specifications at:
   - `c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\teamwork_preview_explorer_init_2\analysis.md`
   - `c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\teamwork_preview_explorer_init_2\handoff.md`
2. Create global CSS design tokens file or CSS variables (`tokens.css` or root theme styles) supporting Light, Dark, and System modes (`data-theme="light"`, `data-theme="dark"`).
3. Refactor monolithic `src/entrypoints/options/App.vue` and `src/entrypoints/popup/App.vue` by extracting 4 reusable Vue 3 sub-components under `src/components/`:
   - `ProviderConfigCard.vue`: Engine selection (Gemini, DeepL, Ollama, Local HTTP, Chrome AI), API key input, model presets/custom validation, key masking.
   - `DisplaySettings.vue`: Translation layout mode, target language, interface language, floating button toggle, subtitle font/color controls (supports full mode for Options, compact mode for Popup).
   - `GlossaryManager.vue`: Saved vocabulary table/cards, search filter, item deletion, clear all, CSV export.
   - `ThemeToggle.vue`: Light / Dark / System theme switcher toggling `data-theme` on `document.documentElement`.
4. Ensure `options/App.vue` and `popup/App.vue` import and use these sub-components cleanly while maintaining 100% of existing functionality.
5. Execute terminal commands:
   - `pnpm typecheck` — MUST pass with 0 errors.
   - `pnpm test` — MUST pass 100% of tests.
   - `pnpm build:chrome` — MUST build cleanly.
   - `pnpm build:firefox` — MUST build cleanly.
6. Create `changes.md` and `handoff.md` in `c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\worker_m2_gen2` detailing files created, refactoring summary, and verification results.

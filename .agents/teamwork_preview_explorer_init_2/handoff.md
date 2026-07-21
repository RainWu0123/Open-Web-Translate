# Handoff Report: Monolithic UI Component Decomposition (R2)

**Agent**: `teamwork_preview_explorer_init_2`  
**Date**: 2026-07-22  
**Working Directory**: `c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\teamwork_preview_explorer_init_2`  
**Target Milestone**: R2 — Monolithic UI Component Decomposition  
**Handoff Type**: Hard (Task Complete)

---

## 1. Observation

1. **Monolithic Files**:
   - `src/entrypoints/options/App.vue`: 1,223 lines of code (template lines 1–326, script lines 328–738, styles lines 740–1223). Contains sidebar navigation, embedded i18n dictionaries (`en`, `zh-Hant`, `ja`), general settings controls, Gemini/DeepL provider configs, and saved vocabulary workbench.
   - `src/entrypoints/popup/App.vue`: 395 lines of code (template lines 1–71, script lines 73–165, styles lines 167–395). Duplicates setting toggles and language selectors without shared components.
2. **Existing Component Directory**:
   - `src/components/`: Contains only `HelloWorld.vue` (35 lines, default boilerplate template). No reusable UI components currently exist.
3. **CSS Framework & Styling Strategy**:
   - `package.json`: Vue `^3.5.29`, WXT `^0.20.27`, TypeScript `^5.9.3`. No external CSS framework (Tailwind, Element Plus, etc.) is installed.
   - `src/entrypoints/options/style.css` (7 lines) and `src/entrypoints/popup/style.css` (10 lines) contain minimal global CSS.
   - Scoped CSS in `options/App.vue` and `popup/App.vue` uses hardcoded dark-mode hex values (`#0f172a`, `#1e293b`, `#1a1a2e`). No theme switcher or CSS variables theme mechanism currently exists.
4. **Data Contracts & Repositories**:
   - `ExtensionSettings` defined in `src/core/contracts/messages.ts` (lines 34–54).
   - Default settings defined in `src/shared/constants/index.ts` (lines 13–29).
   - Storage managed by `SettingsStorage` in `src/infrastructure/storage/extension-storage/settings-storage.ts` (lines 8–90).

---

## 2. Logic Chain

1. **Observed**: `options/App.vue` (1,223 lines) combines 4 independent feature domains: provider management, general display settings, vocabulary workbench, and navigation/i18n.
2. **Inference**: Decomposing `options/App.vue` into focused single-responsibility SFCs under `src/components/` (`ProviderConfigCard.vue`, `DisplaySettings.vue`, `GlossaryManager.vue`, `ThemeToggle.vue`) will isolate reactivity, reduce file complexity by ~85%, and allow `popup/App.vue` to reuse `DisplaySettings.vue` and `ThemeToggle.vue`.
3. **Observed**: No CSS framework exists in `package.json`, and current styles hardcode dark colors in `<style scoped>`.
4. **Inference**: Implementing global CSS tokens (`tokens.css`) using `:root` and `[data-theme="light"]` / `[data-theme="dark"]` attribute selectors will allow `ThemeToggle.vue` to toggle light/dark modes seamlessly across all components without external CSS bloat.
5. **Observed**: Read-only Explorer constraint requires outputting complete specification files (`analysis.md` and `handoff.md`) in agent working directory without directly modifying source code files.

---

## 3. Caveats

- **I18n Architecture**: `options/App.vue` currently embeds an inline `translations` object (lines 341–477). While decomposing UI components, `t(key)` helper function can be passed as a prop or imported from a shared i18n module.
- **Provider API Keys**: `SettingsStorage` automatically masks API keys (`geminiApiKeyMasked`, `deeplApiKeyMasked`). `ProviderConfigCard.vue` should continue relying on `hasGeminiApiKey` and `hasDeeplApiKey` boolean flags rather than storing plain text keys in reactive state long term.
- **Source Code Read-Only Constraint**: Explorer agent cannot execute source code edits directly; implementation team will apply the specification defined in `analysis.md` and `handoff.md`.

---

## 4. Conclusion

The monolithic UI structures in `options/App.vue` and `popup/App.vue` should be decomposed into four reusable, typed Vue components under `src/components/`:
1. `ProviderConfigCard.vue` — Engine & API Key configuration card.
2. `DisplaySettings.vue` — Display mode, target language, floating button, and subtitle styling settings (with compact mode for Popup).
3. `GlossaryManager.vue` — Saved vocabulary workbench & glossary management.
4. `ThemeToggle.vue` — Light / Dark / System theme switcher using CSS custom properties (`tokens.css`).

Comprehensive technical design, interface definitions (props/emits), state management, and refactoring steps are documented in `analysis.md` in this directory.

---

## 5. Verification Method

To verify the component decomposition and specifications independently:

1. **Inspect Report Files**:
   - Check `analysis.md` in `c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\teamwork_preview_explorer_init_2\analysis.md`.
2. **Execute Type Check & Unit Tests**:
   - Run `pnpm compile` or `pnpm typecheck` to verify TypeScript types across entrypoints.
   - Run `pnpm test` to verify Vitest test runner execution.
3. **Post-Implementation Component Verification**:
   - Verify `src/components/ProviderConfigCard.vue` exists and handles provider selection & API key inputs.
   - Verify `src/components/DisplaySettings.vue` supports both full (options) and compact (popup) rendering.
   - Verify `src/components/GlossaryManager.vue` handles list rendering, filtering, deletion, and CSV export.
   - Verify `src/components/ThemeToggle.vue` toggles `data-theme` on `document.documentElement`.

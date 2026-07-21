# Changes Summary: Monolithic UI Component Decomposition (R2)

**Agent**: `worker_m2_gen2`  
**Date**: 2026-07-22  
**Milestone**: R2 — Monolithic UI Component Decomposition  

---

## 1. Overview of Changes

Refactored the monolithic Options (`src/entrypoints/options/App.vue`) and Popup (`src/entrypoints/popup/App.vue`) entrypoints into modular, reusable Vue 3 sub-components with theme design tokens support.

---

## 2. Summary of Created & Refactored Files

### A. Theme System & Global CSS Tokens
- **`src/assets/styles/tokens.css`**: Defines CSS custom properties for color palettes, background levels, borders, badges, and active states supporting `:root` (default dark), `[data-theme="dark"]`, `[data-theme="light"]`, and `[data-theme="system"]` with system dark/light media query detection.
- **`src/entrypoints/options/style.css` & `src/entrypoints/popup/style.css`**: Imports `tokens.css` globally.

### B. Reusable Vue 3 Sub-components (`src/components/`)
1. **`src/components/ThemeToggle.vue`**:
   - Light / Dark / System theme switcher.
   - Sets `data-theme` attribute on `document.documentElement` dynamically.
   - Supports standard sidebar mode and header compact mode (`compact` prop).
2. **`src/components/ProviderConfigCard.vue`**:
   - Engine selection dropdown supporting Gemini, DeepL, Google Free, Ollama, Local HTTP, Chrome Built-in AI (Prompt API), and Mock Provider.
   - Gemini model presets & custom model validation via `validateModelId`.
   - API key masking (`maskApiKey`) and secure save/clear action handlers.
3. **`src/components/DisplaySettings.vue`**:
   - Supports both Options (Full mode) and Popup (Compact mode via `compact: true`).
   - Handles translation enable toggle, target language selector, display layout modes (Bilingual, Translation-First, Immersive), translation execution speed mode, interface language, floating button toggle, and subtitle font sizes/colors.
4. **`src/components/GlossaryManager.vue`**:
   - Vocabulary workbench manager handling saved vocabulary rendering, interactive search filter (`searchQuery`), single item deletion, clear all, custom term insertion, and CSV/Anki export.

### C. Entrypoint Application Refactoring
- **`src/entrypoints/options/App.vue`**:
  - Decomposed 1,223-line monolith into structured layout composing `<ThemeToggle>`, `<DisplaySettings>`, `<ProviderConfigCard>`, and `<GlossaryManager>`.
- **`src/entrypoints/popup/App.vue`**:
  - Decomposed Popup interface to compose `<ThemeToggle compact>` and `<DisplaySettings compact>`.

### D. Unit Tests
- **`tests/unit/components/components.test.ts`**:
  - Unit tests verifying reactivity, theme toggling, API key masking, provider selection (including Chrome AI), compact/full display settings modes, and glossary search/actions.

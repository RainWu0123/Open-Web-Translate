# Original User Request

## 2026-07-22T00:53:34+08:00

Elevate Open Web Translate (v3) codebase quality and features from score 82 to 98+ by fixing typecheck errors, modularizing UI components, adding Web DOM translation, and supporting local offline LLM providers.

Working directory: c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3

### Requirements
- R1: Fix `pnpm typecheck` failures by supporting variadic argument signatures in `Logger` (`...args: any[]`) and ensuring clean, error-free TypeScript compilation across all adapters and entrypoints.
- R2: Monolithic UI Component Decomposition - refactor `options/App.vue` and `popup/App.vue` into reusable modern Vue 3 components (`ProviderConfigCard.vue`, `DisplaySettings.vue`, `GlossaryManager.vue`, `ThemeToggle.vue`) with rich aesthetics under `src/components/`.
- R3: Web Page DOM Translation Engine - implement non-destructive general HTML Web Page Adapter capable of translating selected text or full article blocks while preserving original layout via Shadow DOM / inline elements.
- R4: Local Private AI Provider Integration - add support for local LLM translation (Ollama / Local HTTP endpoint / Chrome Built-in AI) to enable 100% offline privacy-first translation.

### Acceptance Criteria
- `pnpm typecheck` passes with 0 errors.
- `pnpm test` passes all unit and integration test suites without regressions.
- `pnpm build:chrome` and `pnpm build:firefox` succeed cleanly.
- UI sub-components created under `src/components/` with modern styling and light/dark theme toggle.

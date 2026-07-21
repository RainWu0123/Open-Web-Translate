# Original User Request

## 2026-07-21T16:53:28Z

Elevate Open Web Translate (v3) codebase quality and features from score 82 to 98+ by fixing typecheck errors, modularizing UI components, adding Web DOM translation, and supporting local offline LLM providers.

Working directory: c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3
Integrity mode: development

## Requirements

### R1. Type Safety & Logger Overload Fix
Fix `pnpm typecheck` failures by supporting variadic argument signatures in `Logger` (`...args: any[]`) and ensuring clean, error-free TypeScript compilation across all adapters and entrypoints.

### R2. Monolithic UI Component Decomposition
Refactor monolithic `options/App.vue` and `popup/App.vue` into reusable, modern Vue 3 components (`ProviderConfigCard.vue`, `DisplaySettings.vue`, `GlossaryManager.vue`, `ThemeToggle.vue`) with rich aesthetics.

### R3. Web Page DOM Translation Engine
Implement a non-destructive general HTML Web Page Adapter capable of translating selected text or full article blocks while preserving original layout via Shadow DOM / inline elements.

### R4. Local Private AI Provider Integration
Add support for local LLM translation (Ollama / Local HTTP endpoint / Chrome Built-in AI) to enable 100% offline, privacy-first translation.

## Acceptance Criteria

### Type Safety & Build Verification
- [ ] `pnpm typecheck` passes with 0 errors.
- [ ] `pnpm test` passes all unit and integration test suites without regressions.
- [ ] `pnpm build:chrome` and `pnpm build:firefox` succeed cleanly.

### UI & Architecture Polish
- [ ] Options UI and Popup UI are split into clean sub-components under `src/components/`.
- [ ] Modern UI design system with dark/light mode toggle and responsive styling.

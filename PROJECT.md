# Project: Open Web Translate (v3)

## Architecture
- Dual-track architecture: Implementation Track (building product) + E2E Testing Track (requirement-driven test suite).
- Extensible provider hierarchy (`TranslationProvider` interface) supporting Cloud & Local Private AI providers (`OllamaProvider`, `LocalHttpProvider`, `ChromeBuiltInAIProvider`).
- Non-destructive DOM Translation Engine (`DomExtractor`, `ShadowRenderer`, `InlineHost`, `BlockHost`, `tag-preservation`).
- Decomposed modern Vue 3 UI architecture (`src/components/`: `ProviderConfigCard`, `DisplaySettings`, `GlossaryManager`, `ThemeToggle`, `tokens.css`).
- Typed shared logger supporting variadic arguments (`...args: any[]`).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Requirement-driven test suite creation (Tiers 1-4) & publishing TEST_READY.md | None | DONE |
| 1 | M1: Type Safety & Logger Overload Fix (R1) | Fix `src/shared/logger/index.ts` variadic signature & ensure `pnpm typecheck` passes with 0 errors | None | DONE |
| 2 | M2: Monolithic UI Component Decomposition (R2) | Refactor `options/App.vue` & `popup/App.vue` into 4 components under `src/components/` with theme toggle | M1 | DONE |
| 3 | M3: Web Page DOM Translation Engine (R3) | Non-destructive selection & article block translation with inline tags & Shadow DOM rendering | M1 | DONE |
| 4 | M4: Local Private AI Provider Integration (R4) | Add Ollama, Local HTTP, and Chrome Built-in AI providers with strict privacy boundary | M1 | DONE |
| 5 | M5: Final E2E Pass & Adversarial Hardening | Pass 100% E2E tests (Tiers 1-4) & adversarial coverage hardening (Tier 5 Challenger & Forensic Auditor) | M2, M3, M4, E2E | DONE |

## Interface Contracts
- `Logger`: `debug`, `info`, `warn`, `error` methods take `(...args: any[]): void`.
- `TranslationProvider`: `id: string`, `name: string`, `isLocal?: boolean`, `translate(text: string, options: TranslationOptions): Promise<TranslationResult>`. Local providers enforce `isLocal: true` and private boundary in background service worker.
- `DomExtractor`: `extractTranslatableTargets(doc: Document, options?: ExtractionOptions): ExtractionResult`. Supports selection ranges (`SelectionAdapter`) and article blocks (`extractArticleBlocks`).
- `ShadowRenderer`: supports `BlockHost` (`<div class="owt-bilingual-host">`) and `InlineHost` (`<span class="owt-inline-host">`) via open Shadow DOM.

## Code Layout
- `src/components/`: Reusable Vue 3 components (`ProviderConfigCard.vue`, `DisplaySettings.vue`, `GlossaryManager.vue`, `ThemeToggle.vue`).
- `src/assets/styles/`: Design tokens (`tokens.css`).
- `src/shared/logger/`: Typed Logger supporting variadic args.
- `src/infrastructure/providers/`: Provider implementations (`OllamaProvider`, `LocalHttpProvider`, `ChromeBuiltInAIProvider`, `GeminiProvider`, `DeepLProvider`, etc.).
- `src/features/page-translation/`: DOM Extractor, Shadow Renderer, Selection Adapter, Tag Preservation.
- `tests/e2e/`: E2E Test Suite (Tiers 1-4).

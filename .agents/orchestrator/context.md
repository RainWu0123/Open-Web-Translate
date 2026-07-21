# Project Context — Open Web Translate (v3)

- Working Directory: `c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3`
- Agent Directory: `c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\orchestrator`
- Core Objectives:
  1. Fix `pnpm typecheck` failures (variadic argument signatures in `Logger`, clean TS compilation across all adapters and entrypoints).
  2. Refactor UI (`options/App.vue`, `popup/App.vue`) into modern Vue 3 subcomponents (`ProviderConfigCard.vue`, `DisplaySettings.vue`, `GlossaryManager.vue`, `ThemeToggle.vue`).
  3. Implement non-destructive HTML Web Page DOM Translation Engine with Shadow DOM / inline elements.
  4. Integrate Local Private AI Providers (Ollama, Local HTTP endpoint, Chrome Built-in AI).
  5. 0 errors on `pnpm typecheck`, all tests pass on `pnpm test`, clean builds on `pnpm build:chrome` & `pnpm build:firefox`.

## 2026-07-21T17:03:20Z
You are worker_m4 (Local AI Providers & Repository Type Safety Fix Worker).
Your working directory is: c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\worker_m4
Project root directory: c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3

Objective: Implement R4 (Local Private AI Provider Integration) and resolve all TypeScript compilation & Vitest errors.

Task details:
1. Read Explorer 3's specifications at:
   - `c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\teamwork_preview_explorer_init_3\analysis.md`
   - `c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\teamwork_preview_explorer_init_3\handoff.md`
2. Implement 3 local offline private AI providers under `src/infrastructure/providers/`:
   - `ollama-provider.ts`: Ollama REST API (`http://localhost:11434/api/generate` or `/api/chat`).
   - `local-http-provider.ts`: OpenAI-compatible local REST API endpoint (`http://localhost:1234/v1/chat/completions` e.g. LM Studio / vLLM).
   - `chrome-built-in-ai-provider.ts`: Chrome Built-in AI (`window.translation` / `self.ai` Gemini Nano) with feature detection.
3. Update provider registry / factory in `src/infrastructure/providers/index.ts` to register Ollama, Local HTTP, and Chrome Built-in AI.
4. Enforce Strict Privacy Boundary in `src/entrypoints/background.ts`: when active provider is local/private, DO NOT auto-fallback to cloud or mock providers on failure.
5. FIX ALL TS & VITEST COMPILATION ERRORS:
   - Fix `src/infrastructure/providers/ollama-provider.ts` (line 65: correct `GlossaryEntry[]` `.length` vs `Map` `.size` property access).
   - Fix `tests/e2e/tier3-combinations.test.ts` (line 174) and `tests/e2e/tier4-application.test.ts` (line 191) type mismatches between `GlossaryEntry[]` and `Map<string, string>`.
   - Update `vitest.config.ts` to include `@vitejs/plugin-vue` so Vitest compiles `.vue` SFC components cleanly during tests.
6. Execute terminal commands:
   - `pnpm typecheck` — MUST pass with 0 errors.
   - `pnpm test` — MUST pass 100% of unit and integration test files.
   - `pnpm build:chrome` — MUST build cleanly.
   - `pnpm build:firefox` — MUST build cleanly.
7. Create `changes.md` and `handoff.md` in `c:\Users\rainw\.gemini\antigravity\scratch\open-web-translate-v3\.agents\worker_m4` with full logs and verification results.

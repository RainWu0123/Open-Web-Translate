# Project: Open Web Translate

## Architecture
- WXT + Vue 3 + TypeScript browser extension targeting Chrome MV3 and Firefox MV2.
- Provider registry for cloud, remote custom, and loopback-only local translation engines.
- Non-destructive DOM translation with Shadow DOM rendering, exact-range selection translation, caching, batching, and context-aware cache identity.
- Netflix and YouTube caption adapters use browser-visible runtime/player surfaces and custom MAIN↔content bridges.
- Local-first settings, vocabulary, learning state, and translation cache.

## Current engineering status
- Typecheck, Vitest unit/scenario suite, Chrome build, and Firefox build run independently in CI.
- The historical `tests/e2e/tier*.test.ts` files are JSDOM scenario suites, not real browser-driving E2E tests.
- Popup and Options work, but remain large Vue single-file components and are a maintainability target.
- Chrome Built-in AI targets Chrome's public Translator API, with compatibility support for older experimental API shapes.
- Custom HTTP is explicitly remote; Ollama and Local HTTP are loopback-only.

## Important contracts
- Raw API credentials are background/provider-only. Public settings expose only masked/status fields.
- Local providers must not silently send text to remote hosts.
- Translation results are mapped by stable segment IDs; malformed multi-segment model output is repaired at most once, then fails closed.
- Site adapters must restore or clean up patched global browser/page APIs when they stop.
- No silent provider fallback across privacy boundaries.

## Code layout
- `src/core/`: contracts, domain logic, learning, translation pipeline.
- `src/infrastructure/`: providers, messaging, storage, platform seams.
- `src/adapters/`: generic DOM, Netflix, YouTube and caption interaction layers.
- `src/features/`: page/selection translation and learning UI behavior.
- `src/entrypoints/`: extension background/content/popup/options/MAIN-world entrypoints.
- `tests/`: unit, integration, and JSDOM scenario coverage.

See `CODE_AUDIT.md` for audit findings and `THIRD_PARTY_NOTICES.md` for provenance/license notes.

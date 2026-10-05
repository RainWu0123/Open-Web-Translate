# Test Infrastructure

## Test Philosophy
OWT uses layered verification rather than treating every scenario as browser E2E:

1. **Unit tests** for parsers, providers, storage, cue alignment, and rendering helpers.
2. **Integration tests** for cross-module behavior and restoration/idempotency.
3. **JSDOM scenario tests** under the historical `tests/e2e/tier*.test.ts` paths.
4. **Production builds** for Chrome MV3 and Firefox MV2 in CI.

## Runner
- Vitest
- JSDOM
- Fake IndexedDB where storage behavior must be deterministic
- Browser-extension API mocks

## CI Gates
- `pnpm typecheck`
- `pnpm test`
- `pnpm build:chrome`
- `pnpm build:firefox`

These gates run as independent jobs so a test failure does not hide browser build failures.

## Terminology
The Tier 1–4 suites are application/scenario tests, not real-browser E2E tests. A future browser-driving suite should load the built extension into Chromium/Firefox and exercise popup/content-script behavior against fixture pages before being called E2E.

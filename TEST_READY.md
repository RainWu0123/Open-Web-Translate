# Scenario Test Suite

## Test Runner
- Command: `pnpm test`
- Environment: Vitest + JSDOM
- Purpose: deterministic unit, integration, boundary, and user-scenario coverage.

> The files under `tests/e2e/tier*.test.ts` are historical scenario suites executed in JSDOM. They are not browser-driving E2E tests. The directory name is retained for compatibility; documentation should refer to them as scenario tests.

## Scenario Coverage
| Tier | Description |
|------|-------------|
| 1. Feature Coverage | Primary feature behavior |
| 2. Boundary & Corner | Input and failure boundaries |
| 3. Cross-Feature | Cross-module interactions |
| 4. Application Scenarios | Representative user workflows |

## Additional Regression Coverage
The suite also contains focused unit/integration tests for provider batching, context-aware cache identity, secret isolation, endpoint privacy, strict response parsing/repair, IndexedDB lifecycle, and DOM rendering/restoration.

## Browser E2E Status
A true browser-driving extension E2E suite is still a separate concern. CI currently guarantees typecheck, Vitest scenarios, and Chrome/Firefox production builds; do not describe JSDOM scenarios as browser E2E.

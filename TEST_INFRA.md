# E2E Test Infra: Open Web Translate (v3)

## Test Philosophy
- Opaque-box, requirement-driven test design.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Scenarios.

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|--------|:------:|:------:|:------:|:------:|
| 1 | Shared Logger (variadic args `...args: any[]`) | PROJECT.md §R1 | 5 | 5 | ✓ | ✓ |
| 2 | Decomposed Vue 3 UI Components (`ProviderConfigCard`, `DisplaySettings`, `GlossaryManager`, `ThemeToggle`) | PROJECT.md §R2 | 5 | 5 | ✓ | ✓ |
| 3 | Web Page DOM Translation Engine (`DomExtractor`, `ShadowRenderer`, `InlineHost`, `BlockHost`) | PROJECT.md §R3 | 5 | 5 | ✓ | ✓ |
| 4 | Local Private AI Providers (`OllamaProvider`, `LocalHttpProvider`, `ChromeBuiltInAIProvider`) | PROJECT.md §R4 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test Runner: Vitest (`pnpm test` -> `vitest run --environment jsdom`)
- Test Environment: JSDOM with Fake IndexedDB and Browser Extension Mocks
- Directory Layout:
  - `tests/unit/`: Direct component, logger, provider, and DOM extractor unit tests
  - `tests/integration/`: Cross-module integration tests
  - `tests/e2e/tier1-features.test.ts`: Tier 1 Feature Coverage (>=5 test cases per feature)
  - `tests/e2e/tier2-boundary.test.ts`: Tier 2 Boundary & Corner Cases (empty strings, malformed HTML, offline, missing keys, masked keys)
  - `tests/e2e/tier3-combinations.test.ts`: Tier 3 Cross-Feature Combinations (Local AI + DOM selection, UI settings + Provider switching)
  - `tests/e2e/tier4-application.test.ts`: Tier 4 Real-World Application Scenarios (end-to-end user workflows)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised |
|---|----------|--------------------|
| 1 | Offline Local AI Translation of Web Documentation | Local Provider + DOM Engine + Selection Adapter |
| 2 | Provider Fallback & Switching during Web Browsing | Provider Registry + Display Settings + Error Handling |
| 3 | Custom Theme & Dynamic Glossary Integration | Theme Toggle + Glossary Manager + DOM Shadow Rendering |
| 4 | Large Article Block Batch Translation | DOM Extractor + Block Host + Variadic Logger |
| 5 | Privacy-Boundary Local AI with Key Masking | Chrome AI / Ollama + Provider Config Card + Masking |

## Coverage Thresholds
- Tier 1: 5 tests * 4 features = 20 tests
- Tier 2: 5 tests * 4 features = 20 tests
- Tier 3: Cross-feature combinations >= 6 tests
- Tier 4: Real-world application scenarios >= 5 tests
- **Total E2E test suite minimum: 51 test cases**

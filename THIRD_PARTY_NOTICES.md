# Third-Party Notices and Provenance

Open Web Translate's own source code is released under the Mozilla Public License 2.0. This file records direct third-party package dependencies and important public specifications/algorithms referenced by the implementation.

It is not a replacement for the authoritative license files distributed by each dependency.

## Direct runtime/build/test dependencies

| Dependency | Role | Upstream license | Upstream |
|---|---|---|---|
| Vue 3 | UI framework | MIT | https://github.com/vuejs/core |
| WXT | Web-extension framework | MIT | https://github.com/wxt-dev/wxt |
| @wxt-dev/module-vue | WXT Vue integration | MIT | https://github.com/wxt-dev/wxt |
| @vitejs/plugin-vue | Vue/Vite build integration | MIT | https://github.com/vitejs/vite-plugin-vue |
| @vue/test-utils | Vue component testing | MIT | https://github.com/vuejs/test-utils |
| Vitest | Test runner | MIT | https://github.com/vitest-dev/vitest |
| jsdom | DOM implementation used in tests | MIT | https://github.com/jsdom/jsdom |
| fake-indexeddb | IndexedDB implementation used in tests | Apache-2.0 | https://github.com/dumbmatter/fakeIndexedDB |
| TypeScript | Type system/compiler | Apache-2.0 | https://github.com/microsoft/TypeScript |
| vue-tsc | Vue TypeScript typechecking | MIT | https://github.com/vuejs/language-tools |

Transitive dependencies are pinned in `pnpm-lock.yaml` and retain their respective upstream licenses. Release/distribution tooling must not remove license notices shipped inside dependency artifacts.

## Algorithms and public specifications referenced by project code

### SuperMemo / spaced repetition
`src/core/learning/srs-engine.ts` is an OWT-specific spaced-repetition implementation inspired by the SuperMemo/SM-2 family described by Piotr Wozniak.

Reference: https://super-memory.com/english/ol/

The OWT implementation uses its own four-grade mapping and interval/ease adjustments. It is not a verbatim copy of SuperMemo program source.

### W3C TTML / DFXP
`src/shared/subtitles/ttml-parser.ts` implements parsing/interoperability behavior for W3C Timed Text formats.

References:
- https://www.w3.org/TR/ttml1/
- https://www.w3.org/TR/ttml2/

The parser code is original project code written against the format specifications.

### Chrome Translator and Language Detector APIs
`src/infrastructure/providers/chrome-builtin-ai-provider.ts` targets Chrome's public built-in AI web APIs.

References:
- https://developer.chrome.com/docs/ai/translator-api
- https://developer.chrome.com/docs/ai/language-detection

No Chromium source code is copied.

### Levenshtein distance
`src/features/learning/shadowing-recorder.ts` uses the standard dynamic-programming Levenshtein edit-distance recurrence to score transcript similarity. No third-party implementation is vendored.

## Platform/service interoperability

Netflix and YouTube adapters interact with DOM/runtime/network surfaces exposed by those websites in the user's browser. They are not official SDK integrations, do not bundle source code from those services, and may need maintenance when private page implementations change.

The Google Translate "Free" provider uses an undocumented web endpoint (`translate.googleapis.com/translate_a/single?client=gtx`). This is not the documented Google Cloud Translation API.

Product/service names and trademarks belong to their respective owners. Their mention describes interoperability only and does not imply sponsorship or affiliation.

## Project artwork

The current OWT app icon was created specifically for this project from an OpenAI-generated design exploration selected by the project owner. Unused Vue/WXT template logo assets are intentionally removed so the extension package does not carry third-party logo artwork it does not use.

## Contributions

Contributors who copy or materially adapt third-party code must preserve the applicable upstream license/copyright notice and add a source reference either beside the code or in this file. If licensing is unclear, do not copy the code.

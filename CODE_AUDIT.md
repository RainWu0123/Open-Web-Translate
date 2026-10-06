# Code Audit — 2026-10-06

This audit reviewed the current `master` tree after PR #10, including core translation, providers, storage, messaging, browser entrypoints, Netflix/YouTube adapters, learning utilities, UI surfaces, tests, CI/release configuration, licenses, and repository assets.

## Executive summary

No critical vulnerability or evidence of copied third-party source code was found in the reviewed repository. The project has a solid separation between providers, storage, adapters, and translation orchestration, and CI currently typechecks, tests, and builds both browser targets.

The audit did identify correctness, privacy, provenance, and maintainability issues. High-impact items that can be fixed safely are fixed in this PR; medium/long-term items remain documented instead of being hidden inside broad refactors.

## Fixed in this audit PR

### High — Netflix page `fetch` patch was not restored
`NetflixTrackDiscovery.stop()` restored the `JSON.parse` hook but left its patched `window.fetch` installed for the life of the page.

**Fix:** retain original/patched function identities and restore `window.fetch` on stop without clobbering a later third-party patch.

### High — Chrome Built-in AI targeted an obsolete experimental API shape
The implementation primarily looked for `globalThis.ai.translator`. Chrome's documented Translator API uses the global `Translator` object, and automatic source-language detection uses `LanguageDetector`.

**Fix:** prefer the documented APIs and keep the older experimental shape only as a compatibility fallback.

### Medium — user vocabulary text appeared in logs
Saving a vocabulary card logged the word surface.

**Fix:** log only the generated card ID.

### Medium — popup Gemini fallback model drifted from the registry
The popup still fell back to `gemini-2.5-flash` while the model registry/default settings use `DEFAULT_MODEL_ID`.

**Fix:** use the shared registry default.

### Provenance — unused framework template logos
`src/assets/vue.svg` and `src/public/wxt.svg` are unused upstream/template logo assets.

**Fix:** remove them rather than carrying third-party creative assets the extension does not use.

## Attribution / provenance review

- Repository license: MPL-2.0.
- No reviewed file contained a third-party copyright header that had been removed or rewritten.
- No evidence was found of vendored/copied source from Language Reactor, Immersive Translate, Dualsub, Stack Overflow, or similar projects.
- Standard algorithms/specifications are now referenced where material:
  - spaced repetition: SuperMemo/SM-2 family, with an OWT-specific adaptation;
  - TTML/DFXP parsing: W3C Timed Text specifications;
  - Chrome local translation: Chrome Translator / LanguageDetector documentation.
- Netflix/YouTube integrations are interoperability code against runtime/browser-visible surfaces; no Netflix or YouTube source code is bundled.
- Google Translate's `client=gtx` web endpoint is undocumented; the provider now states that explicitly.
- Direct package dependencies and upstream licenses are listed in `THIRD_PARTY_NOTICES.md`.

## Remaining risks / recommended follow-up

### P1 — All-site content script bundle is larger than necessary
`content.ts` statically imports generic, YouTube, and Netflix adapters/CSS on ordinary sites.

**Recommendation:** split generic/YouTube/Netflix entrypoints or dynamically import site adapters after hostname detection.

### P1 — Broad host permission is product-significant
`*://*/*` supports the current always-available selection/floating UI, but it is a sensitive browser-store permission.

**Recommendation:** keep the permission rationale in privacy/store copy; consider optional permissions for an on-demand mode.

### P1 — No real-browser extension E2E suite
The Tier suites are JSDOM scenarios. They do not catch extension packaging, service-worker lifetime, content-script injection, browser permission, or real player integration failures.

**Recommendation:** add a small real Chromium extension E2E suite and Firefox smoke lane.

### P1 — Netflix/YouTube private runtime APIs are brittle
Cadmium/player internals, manifest shapes, selectors, and page-world hooks can change without notice.

**Recommendation:** keep adapters fail-closed, isolate runtime schemas, and maintain targeted smoke fixtures. Do not present these integrations as official APIs.

### P2 — UI monoliths and stale components
`options/App.vue` and `popup/App.vue` remain large. Several older standalone components appear stale relative to active App.vue flows.

**Recommendation:** decompose only with UI/browser tests; remove dead components when confirmed unused.

### P2 — Boundary typing still uses `any`
Private player APIs, bridge payloads, and some provider parsing use `any`.

**Recommendation:** introduce narrow validators/types at undocumented boundaries, then remove internal casts.

### P2 — Undocumented Google Translate web endpoint
The free provider uses an undocumented Google web endpoint. It may change without notice and should not be represented as a supported Google Cloud API.

### P2 — Release/legal hygiene
Release automation should keep repository `LICENSE`, `PRIVACY.md`, and `THIRD_PARTY_NOTICES.md` available alongside source/release artifacts.

## Review rule going forward

When code is copied or materially adapted from another project, the same PR should:
1. add a source URL near the code or in `THIRD_PARTY_NOTICES.md`;
2. preserve copyright/license notices required by the upstream license;
3. explain whether the implementation is copied, adapted, or merely based on a public specification;
4. avoid copying code when the upstream license is unknown or incompatible.

This is an engineering/provenance review, not legal advice.

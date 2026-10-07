# Release Checklist

Use this checklist before submitting an OWT update to Chrome Web Store or Firefox Add-ons.

## Version and source

- [ ] `package.json` contains the intended version.
- [ ] The release tag exactly matches it (for example, `0.2.2` → `v0.2.2`).
- [ ] CI is green on the exact release commit.
- [ ] `PRIVACY.md`, `TERMS.md`, `STORE_LISTING.md`, and `THIRD_PARTY_NOTICES.md` still match product behavior.
- [ ] No API keys, private test data, browser profiles, or local build secrets are committed.

## Permissions and privacy

- [ ] Compare manifest permissions/host permissions with the previous store version.
- [ ] Any new required permission has a documented product reason.
- [ ] Any new remote data flow is disclosed before use and documented in `PRIVACY.md`.
- [ ] Remote-provider first-run disclosure still blocks remote translation until acknowledged on fresh installs.
- [ ] Ollama and Local HTTP remain loopback-only.
- [ ] Custom HTTP remote endpoints require HTTPS.
- [ ] No analytics/session-replay/advertising dependency was added unintentionally.

## Chrome MV3 smoke test

Test the exact package produced by `pnpm zip:chrome`:

- [ ] Install/reload successfully.
- [ ] Extension icon and popup render correctly.
- [ ] First fresh install opens the data-transfer disclosure.
- [ ] Google translation works after disclosure acknowledgement.
- [ ] A local provider remains usable without sending text to a remote host.
- [ ] Translate a normal webpage and restore it.
- [ ] Translate a partial text selection.
- [ ] Settings persist after closing/reopening the browser.
- [ ] YouTube subtitle controls load on a video with captions.
- [ ] Netflix controls fail gracefully or work on a title with supported subtitles.
- [ ] Light and dark themes remain readable.

## Firefox smoke test

Test the exact package produced by `pnpm zip:firefox`:

- [ ] Install through `about:debugging` without manifest errors.
- [ ] Popup/options open.
- [ ] General page translation and selection translation work.
- [ ] Settings persist.
- [ ] No Chrome-only API failure breaks the extension.
- [ ] Reviewer source ZIP rebuild instructions in `FIREFOX_REVIEW.md` remain correct.

## Store submission

- [ ] Upload to the existing store listing for an update; do not create a duplicate item.
- [ ] Store description and screenshots still represent the submitted version.
- [ ] Permission/privacy questionnaire answers match the submitted manifest and code.
- [ ] Reviewer notes include a simple test path that does not require paid credentials.
- [ ] GitHub release contains Chrome ZIP, Firefox ZIP, reviewer source ZIP, and `SHA256SUMS.txt`.
- [ ] Keep the release staged/manual until the store package has received one final smoke test.

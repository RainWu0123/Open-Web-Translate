# Store Release Checklist

Use this checklist for every browser-store release.

## Repository / build

- [ ] `master` CI is green: typecheck, tests, Chrome build, Firefox build.
- [ ] Version in `package.json` is the intended store version.
- [ ] Create a signed release tag `vX.Y.Z`.
- [ ] Release workflow produces Chrome ZIP, Firefox ZIP, source ZIP, and `SHA256SUMS.txt`.
- [ ] `LICENSE`, `PRIVACY.md`, and `THIRD_PARTY_NOTICES.md` are present in the tagged source.

## Fresh-install smoke test

Test from a clean browser profile, not an upgraded development profile.

- [ ] Install Chrome MV3 package.
- [ ] First-run Options page opens.
- [ ] Remote-provider translation is blocked before acknowledgement.
- [ ] Acknowledge data-transfer notice.
- [ ] Google Translate basic selection translation works.
- [ ] Full-page bilingual translation works and restores cleanly.
- [ ] Settings survive browser restart.
- [ ] API key UI exposes only masked values after save/reload.
- [ ] Ollama / Local HTTP reject non-loopback endpoints.
- [ ] Custom HTTP rejects insecure remote HTTP and accepts HTTPS configuration.
- [ ] YouTube subtitle flow works on a video with captions.
- [ ] Netflix subtitle flow works on an account/video with text subtitles.
- [ ] Repeat the core install/translate/settings smoke test on Firefox.

## Store metadata

- [ ] Copy listing text from `STORE_LISTING.md`.
- [ ] Privacy policy URL points to the public current policy.
- [ ] Permission justifications match the submitted manifest.
- [ ] Reviewer notes match the submitted build.
- [ ] No unsupported claims or competitor-comparison language.

## Screenshots / promotional media

Capture from the exact release build. Do not mock features that are not visible in the product.

Recommended screenshots:
1. 1280×800 — normal webpage with bilingual translation.
2. 1280×800 — selected-text translation.
3. 1280×800 — YouTube bilingual subtitles.
4. 1280×800 — Netflix bilingual subtitles / learning controls.
5. 1280×800 — Popup or Options provider/privacy configuration.

Recommended Chrome promo asset:
- 440×280 small promotional tile using the OWT icon, warm off-white background, charcoal typography, and muted sage accent.

Before upload:
- [ ] No personal account identifiers are visible.
- [ ] No API keys or private endpoints are visible.
- [ ] No copyrighted video frame is used unless you have permission; prefer your own/public-domain/demo content.
- [ ] Screenshots show the current shipped UI.

## Chrome Web Store

- [ ] Store listing completed.
- [ ] Privacy tab completed.
- [ ] 2-step verification enabled on publisher Google account.
- [ ] Upload Chrome ZIP from the tagged release.
- [ ] Check displayed permission warnings.
- [ ] Submit for review.

## Firefox Add-ons

- [ ] Upload Firefox ZIP from the same tag.
- [ ] Upload matching source ZIP when requested.
- [ ] Paste build instructions from `FIREFOX_REVIEW.md`.
- [ ] Add reviewer notes.
- [ ] Complete privacy/data-disclosure fields.
- [ ] Submit for review.

# Privacy Policy

**Effective date:** 2026-10-07  
**Applies to:** Open Web Translate (OWT) browser extension

Open Web Translate is a local-first browser translation and language-learning extension. This policy explains what stays on-device, what website access is used for, and when user-requested text is sent to an external translation service.

OWT does not operate an account system or an OWT translation backend, and does not include advertising, analytics, session replay, or telemetry.

## First-run disclosure

On a new installation, OWT opens its settings page and explains the difference between local and remote translation providers. Until that notice is acknowledged, OWT blocks translation requests to remote providers. Local providers remain within their documented local boundary.

Acknowledging the notice does not create an account, enable tracking, or automatically send page content. Content is transmitted only when a user invokes a translation feature using a remote provider.

## Data stored locally

OWT stores the following data in the browser extension profile using `browser.storage.local` and IndexedDB:

- extension settings and UI preferences;
- provider configuration and API credentials;
- translation cache entries;
- vocabulary cards and review state;
- local learning state.

API keys are treated as secrets. UI and content scripts receive only masked/status fields; raw credentials are read only by background/provider code when a request must be authenticated.

OWT does not sell user data and does not use local extension data for advertising or cross-site profiling.

## Translation providers and data transmission

The selected provider determines where text is processed:

- **Ollama Local AI**: loopback only (`localhost`, `127.0.0.0/8`, or `::1`).
- **Local HTTP API**: loopback only and OpenAI Chat Completions compatible.
- **Chrome Built-in AI**: processed by the browser's local Translator implementation when supported.
- **Google Translate**: text requested for translation is sent to Google's translation web endpoint. OWT's free Google provider uses an undocumented web endpoint rather than the contractual Google Cloud Translation API.
- **Gemini**: text requested for translation is sent to Google's Gemini API when selected.
- **DeepL**: text requested for translation is sent to DeepL when selected.
- **OpenRouter**: text requested for translation is sent to OpenRouter when selected; the user chooses the model ID or OpenRouter router.
- **NVIDIA NIM**: the default hosted configuration sends requested text to NVIDIA. If the user changes the NIM endpoint to an allowed loopback address, processing remains on that local service.
- **Custom HTTP API**: text requested for translation is sent to the endpoint explicitly configured by the user. Remote endpoints must use HTTPS.

Third-party providers process requests under their own terms and privacy policies. OWT never silently changes from a local provider to a remote provider after a failure.

## Website access

OWT requests access to HTTP/HTTPS pages because its primary function is translating selected text, page text, and supported video subtitles directly inside the current website.

The extension may read page text and DOM structure needed for translation and rendering. YouTube and Netflix adapters inspect subtitle/player state to provide bilingual subtitles. This access is not used to build browsing profiles, sell browsing data, or transmit browsing history to an OWT-operated server.

## Children

OWT is a general-audience productivity and language-learning tool and is not specifically directed to children under 13. OWT does not operate user accounts or knowingly collect children's personal information through an OWT-operated server.

If the product later adds accounts, cloud sync, advertising, analytics, or other server-side data collection, this section and the first-run disclosure must be reviewed before release.

## User control

Users choose the active translation provider in OWT settings. They can switch between local and remote providers at any time, clear provider credentials, remove stored vocabulary/cache data, or uninstall the extension.

## Retention and deletion

Translation cache and learning data remain in the browser profile until cleared by the user, removed by browser storage eviction, or deleted with the extension/profile.

OWT does not maintain a separate server-side copy of this local data.

## Contact and project source

Source code, issue tracking, privacy-policy history, and support are available at:

https://github.com/RainWu0123/Open-Web-Translate

For privacy questions or deletion/help requests relating to OWT itself, use the repository issue tracker:

https://github.com/RainWu0123/Open-Web-Translate/issues

Do not post API keys, private page content, or other secrets in a public issue.

## Changes

Material privacy changes must be documented in this file and in release notes. If a future release introduces new categories of remote data collection, the relevant disclosure should be shown before that collection begins.

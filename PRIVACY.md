# Privacy Policy

Open Web Translate (OWT) is local-first. This document describes what stays on-device, what website access is used for, and when translated text is sent to an external service.

## First-run disclosure

On a new installation, OWT opens its settings page and explains the difference between local and remote translation providers. Until that notice is acknowledged, OWT blocks translation requests to remote providers. Local providers remain within their documented local boundary.

Acknowledging the notice does not create an OWT account, enable analytics, or automatically send page content. Content is transmitted only when a user invokes a translation feature using a remote provider.

## Data stored locally

OWT stores settings, API credentials, translation cache entries, vocabulary cards, and learning state in the browser extension sandbox using `browser.storage.local` and IndexedDB. OWT does not include analytics, advertising SDKs, or telemetry.

API keys are treated as secrets. UI and content scripts receive only masked/status fields; raw credentials are read only by background/provider code when a request must be authenticated.

## Translation providers

The selected provider determines where text is processed:

- **Ollama Local AI**: loopback only (`localhost`, `127.0.0.0/8`, or `::1`).
- **Local HTTP API**: loopback only and OpenAI Chat Completions compatible.
- **Chrome Built-in AI**: processed by the browser's local AI implementation when available.
- **Google Translate, Gemini, DeepL**: text requested for translation is sent to the corresponding external service.
- **Custom HTTP API**: text requested for translation is sent to the endpoint explicitly configured by the user. Remote endpoints must use HTTPS.

OWT never silently changes from a local provider to a remote provider after a failure.

## Website access

OWT requests access to HTTP/HTTPS pages because its primary function is translating selected text, page text, and supported video subtitles directly inside the current website.

The extension may read page text and DOM structure needed for translation and rendering. YouTube and Netflix adapters inspect subtitle/player state to provide bilingual subtitles. This access is not used to build browsing profiles, sell browsing data, or transmit browsing history to an OWT-operated server.

## User control

Users choose the active translation provider in OWT settings. They can switch between local and remote providers at any time, clear provider credentials, remove stored vocabulary/cache data, or uninstall the extension.

## Cache and deletion

Translation cache and learning data remain in the browser profile until cleared by the user, removed by browser storage eviction, or deleted with the extension/profile.

## Contact and project source

Source code, issue tracking, and privacy-policy history are available at:

https://github.com/RainWu0123/Open-Web-Translate

## Changes

Material privacy changes should be documented in this file and in release notes.

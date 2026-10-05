# Privacy Policy

Open Web Translate (OWT) is local-first. This document describes what stays on-device and when translated text is sent to an external service.

## Data stored locally

OWT stores settings, API credentials, translation cache entries, vocabulary cards, and learning state in the browser extension sandbox using `browser.storage.local` and IndexedDB. OWT does not include analytics, advertising SDKs, or telemetry.

API keys are treated as secrets. UI and content scripts receive only masked/status fields; raw credentials are read only by background/provider code when a request must be authenticated.

## Translation providers

The selected provider determines where text is processed:

- **Ollama Local AI**: loopback only (`localhost`, `127.0.0.0/8`, or `::1`).
- **Local HTTP API**: loopback only and OpenAI Chat Completions compatible.
- **Chrome Built-in AI**: processed by the browser's local AI implementation when available.
- **Google Translate, Gemini, DeepL**: selected text is sent to the corresponding external service.
- **Custom HTTP API**: selected text is sent to the endpoint explicitly configured by the user. Remote endpoints must use HTTPS.

OWT never silently changes from a local provider to a remote provider after a failure.

## Website access

The extension can read page text so it can translate the page or the user's selection. YouTube and Netflix adapters inspect subtitle/player state to provide bilingual subtitles. OWT does not sell browsing data or transmit browsing history to an OWT-operated server.

## Cache and deletion

Translation cache and learning data remain in the browser profile until cleared by the user, removed by browser storage eviction, or deleted with the extension/profile.

## Changes

Material privacy changes should be documented in this file and in release notes.

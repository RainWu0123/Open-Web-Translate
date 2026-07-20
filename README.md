# Open Web Translate (v3)

An open-source, Local-first, AI-extensible translation and language learning workbench for Chrome and Firefox.

Built with **WXT**, **Vue 3**, and **TypeScript**.

---

## 🚀 Local Development Guide

### Prerequisites
- Node.js LTS (>= 20.0.0)
- `pnpm` (>= 9.0.0)

### Setup & Build Commands

```bash
# Install dependencies
pnpm install

# Start development mode with hot reload (Chrome MV3)
pnpm dev

# Start development mode for Firefox
pnpm dev:firefox

# Type check
pnpm typecheck

# Production build for Chrome MV3
pnpm build:chrome

# Production build for Firefox
pnpm build:firefox

# Package release zip artifacts
pnpm zip:chrome
pnpm zip:firefox
```

---

## 🧩 How to Load Unpacked Extension

### Chrome / Chromium Browsers
1. Run `pnpm build:chrome` (or `pnpm dev`).
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top right toggle).
4. Click **Load unpacked** (top left).
5. Select the output directory: `.output/chrome-mv3`.

### Firefox
1. Run `pnpm build:firefox` (or `pnpm dev:firefox`).
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select `manifest.json` inside `.output/firefox-mv2` (or `.output/firefox-mv3`).

---

## 🔒 Privacy & Security Model

- **Local-first**: All preferences, translation caches, glossaries, and vocabulary items are stored locally in IndexedDB / Extension Storage.
- **No Telemetry**: Production logs do not record original text, translated text, API keys, or full URL query strings.
- **Secrets Management**: API Keys are only entered via the Options UI and stored in `browser.storage.local`. Keys are **never** bundled in build artifacts or environment variables (`VITE_` / `WXT_`).

---

## 📜 Permissions & Scope

| Permission | Reason |
|---|---|
| `activeTab` | Grants temporary access to current tab for bilingual DOM rendering upon user action |
| `storage` | Stores local preferences and non-sensitive extension settings |

---

## 📄 License

Governed under the [Mozilla Public License 2.0 (MPL-2.0)](./LICENSE).

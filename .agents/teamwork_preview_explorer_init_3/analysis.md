# Technical Design & Architectural Specification: R3, R4 & Test Infrastructure

**Agent**: `teamwork_preview_explorer_init_3`  
**Target Project**: `Open-Web-Translate v3`  
**Date**: 2026-07-21  

---

## 1. Executive Summary

This document specifies the technical design for **R3 (Web Page DOM Translation Engine)**, **R4 (Local Private AI Providers)**, and the **Dual-Track E2E Test Infrastructure** for Open-Web-Translate v3 (OWT v3).

### Key Architectural Objectives:
1. **R3 (Non-destructive Web Page Adapter)**: Extend DOM text extraction and rendering from fixed `<p, h1, h2, h3>` elements to a general HTML web page adapter. Support both **Article Block Translation** and **User Text Selection Translation** while preserving source page layout, event listeners, and inline CSS styles using Shadow DOM (`BlockHost` and `InlineHost`).
2. **R4 (Local Private AI Providers)**: Implement three 100% offline, privacy-first translation providers:
   - **Ollama Provider** (local REST API at `http://localhost:11434`).
   - **Local HTTP Endpoint Provider** (OpenAI-compatible endpoints e.g. LM Studio, LocalAI, vLLM).
   - **Chrome Built-in AI Provider** (Web API `window.translation` / `self.ai` Gemini Nano).
   Enforce a **Strict Privacy Boundary** preventing auto-failover to cloud providers when local providers are active.
3. **Dual-Track E2E Test Infrastructure**: Establish a dual-track testing setup combining ultra-fast headless DOM unit/integration testing (Vitest + JSDOM) with full browser extension E2E automation (Playwright Chromium/Firefox MV3 extension testing).

---

## 2. Analysis of Existing Codebase

### 2.1 Existing DOM Extractor & Renderer (`src/features/page-translation/`)
- **Extractor (`extractor/dom-extractor.ts`)**:
  - Uses `document.querySelectorAll('p, h1, h2, h3')` for candidate elements.
  - Filters out hidden elements (`isElementVisible`) and excluded selectors (`script, style, nav, header, footer, aside, form, button, input, textarea, code, pre, .owt-bilingual-host, #owt-badge-host`).
  - Generates segment IDs using an FNV32a hash (`generateSegmentId(el, index, text)`).
  - Enforces limits: `MAX_TARGETS = 30`, `MAX_CHARS_PER_SEGMENT = 1000`, `MAX_TOTAL_CHARS = 12000`.
  - *Limitation*: Cannot handle selected text ranges, inline text nodes, complex HTML container trees (`article`, `section`, `div`, `li`, `td`, `blockquote`), or inline element tags (`<a>`, `<b>`, `<code>`).
- **Renderer (`renderer/shadow-renderer.ts`)**:
  - Implements `renderBilingualBlock` creating `<div class="owt-bilingual-host">` appended via `originalEl.insertAdjacentElement('afterend', host)`.
  - Supports 3 modes: `bilingual`, `translation-first`, `immersive`.
  - Encapsulates translation output inside an open `ShadowRoot`.
  - Cleans up using `removeAllBilingualBlocks`.
  - *Limitation*: Insertion mechanism assumes block-level parent (`afterend`). Injects a block element (`<div>`), which disrupts inline text layouts, selected ranges, and inline elements inside paragraphs or tables.

### 2.2 Existing Provider Architecture (`src/core/contracts/provider.ts` & `src/infrastructure/providers/`)
- **Contract (`TranslationProvider`)**:
  ```typescript
  export interface TranslationProvider {
    readonly id: ProviderId;
    readonly displayName: string;
    readonly capabilities: ProviderCapabilities;
    validateConfig(config: unknown): ProviderConfigValidation;
    translate(request: TranslationRequest): Promise<TranslationResult>;
  }
  ```
- Current active providers:
  - `GoogleTranslateProvider`: Web API client (`translate.googleapis.com`).
  - `DeepLProvider`: DeepL API Free/Pro (`api.deepl.com`).
  - `GeminiProvider`: Google Gemini API (`generativelanguage.googleapis.com`) with JSON schema mode.
  - `MockProvider`: Local test provider.
- Background Dispatch (`src/entrypoints/background.ts`):
  - Check IndexedDB cache (`CacheRepository`) before making provider calls.
  - Failover logic: If primary provider throws an error, it falls back to `MockProvider`.
  - *Limitation*: No provider distinction between cloud/online services and local/offline private LLMs. Falling back from a private provider to a cloud provider or mock could compromise user privacy.

### 2.3 Existing Test Infrastructure (`vitest.config.ts`, `tests/`)
- Test runner: Vitest v3 with JSDOM environment (`environment: 'jsdom'`).
- Directory structure:
  - `tests/unit/`: Unit tests for adapters, providers, segment limits, shadow renderer modes, vocabulary, etc.
  - `tests/integration/`: Integration tests for DOM translation (`regression.test.ts`, `idempotency.test.ts`, `restore-integrity.test.ts`) using `fixtures/article.html`.
  - `tests/helpers/`: `dom-translator.ts` helper mimicking full page extraction and restoration.
- *Limitation*: Lacks Playwright configuration and true browser extension MV3 E2E test harness for content script injection, background service worker messages, popup interactions, and real Shadow DOM rendering.

---

## 3. R3 Design Specification: Non-Destructive General HTML Web Page Adapter

### 3.1 Dual-Mode Extraction Architecture

R3 must support two primary translation workflows: **Text Selection Translation** and **General HTML Article Block Translation**.

```
                           [ DOM Target Input ]
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
[ Selected Text Range ]                           [ General Article Block ]
(window.getSelection())                          (Smart Tree Extractor)
           │                                                 │
           ▼                                                 ▼
[ Selection Range Bounds ]                        [ Text Node Aggregation ]
(BoundingClientRect)                             (Preserve Inline Tags)
           │                                                 │
           ▼                                                 ▼
   [ InlineHost ]                                    [ BlockHost ]
(<span class="owt-inline-host">)               (<div class="owt-bilingual-host">)
           │                                                 │
           └────────────────────────┬────────────────────────┘
                                    ▼
                       [ Shadow DOM Isolation ]
```

#### 3.1.1 Selected Text Mode (Selection Adapter)
1. **Triggering**:
   - Listens for `selectionchange` / `mouseup` / `keyup` events in `content.ts`.
   - Checks `window.getSelection()` for non-empty text (length ≥ 2 characters).
   - Shows an interactive floating inline button or action popover near selection coordinates.
2. **Range Extraction & Anchor**:
   - Obtains `Range` via `selection.getRangeAt(0)`.
   - Computes target bounding box using `range.getBoundingClientRect()`.
   - Constructs a `TranslationSegment` with `id: generateSelectionSegmentId(selectedText, range)`.
3. **Rendering Target**:
   - Supports 2 rendering target styles for selection:
     a) **Inline Floating Card / Popover**: A Shadow DOM host attached to `document.body` positioned absolute/fixed at `(rect.left, rect.bottom + window.scrollY)`. Ideal for quick lookups without disturbing document layout.
     b) **Inline Embedded Translation (`InlineHost`)**: A `<span class="owt-inline-host">` element appended directly after the common ancestor container or text node of the selection.

#### 3.1.2 General HTML Article Block Mode (Smart DOM Extractor)
1. **Block Detection Algorithm**:
   - Instead of static `p, h1, h2, h3` query selector, uses a recursive container discovery algorithm:
     - Scans top-level semantic containers: `article`, `main`, `[role="main"]`, `section`, `.content`, `.post`, `.article`.
     - If semantic containers are absent, falls back to `document.body`.
   - Identifies candidate block nodes: block elements (`P`, `H1`, `H2`, `H3`, `H4`, `H5`, `H6`, `LI`, `BLOCKQUOTE`, `TD`, `TH`, `FIGCAPTION`, `DIV` with direct text nodes).
2. **Inline Formatting & Sub-segment Preservation**:
   - Text extraction preserves inline structural tags (`<a>`, `<b>`, `<i>`, `<code>`, `<span>`) by mapping inline elements to lightweight placeholders:
     - Example: `<p>Click <a href="...">here</a> for <b>details</b></p>`
     - Extracted text payload: `"Click <ph id=1>here</ph> for <ph id=2>details</ph>"`
   - On rendering, placeholders are reconstructed into native HTML elements inside the Shadow DOM host.

### 3.2 Non-Destructive Layout & Style Isolation Engine

To guarantee zero visual degradation and preserve original web page styling:

1. **Dual Host Element Types**:
   - **`BlockHost`**: `<div class="owt-bilingual-host" style="display: block;">` inserted after block elements (`<p>`, `<h1>`-`<h6>`, `<blockquote>`).
   - **`InlineHost`**: `<span class="owt-inline-host" style="display: inline-block;">` inserted after inline selection elements (`<span>`, `<a>`, `<b>`).
2. **Style Inheritance & Isolation**:
   - Attach Shadow DOM in `open` mode (`host.attachShadow({ mode: 'open' })`).
   - Compute parent element styles (`getComputedStyle(originalEl)`) and pass essential typography metrics (`font-family`, `font-size`, `line-height`, `letter-spacing`, `text-align`) into the Shadow DOM root via CSS variables:
     ```css
     :host {
       --owt-parent-font-family: inherit;
       --owt-parent-font-size: 0.95em;
       --owt-parent-line-height: 1.5;
     }
     ```
   - Protects translation elements against external host page CSS pollution using `:host { all: initial; }` inside the Shadow DOM stylesheet.
3. **Idempotency & Re-entrancy Contract**:
   - Host nodes store target metadata in `data-owt-seg-id` and a internal `WeakMap<Node, SegmentState>` dictionary.
   - Calling `extractTranslatableTargets()` when page is already translated skips all `.owt-bilingual-host`, `.owt-inline-host`, and `[data-owt-translated="true"]` nodes.
4. **Complete Restoration (`removeAllBilingualBlocks`)**:
   - Removes all `.owt-bilingual-host`, `.owt-inline-host`, `#owt-badge-host`, `#owt-selection-popover` elements.
   - Clears all OWT helper classes (`.owt-source-muted`, `.owt-source-hidden`).
   - Removes global style tag `#owt-global-renderer-styles`.
   - Restores DOM to identical byte-for-byte state.

---

## 4. R4 Design Specification: Local Private AI Providers (100% Offline Privacy-First)

### 4.1 Local Provider Architecture

Local providers implement the standard `TranslationProvider` interface while operating strictly on local network interfaces (`localhost`, `127.0.0.1`, or `window.ai`) with zero external network connectivity.

```
                           ┌──────────────────────────┐
                           │   TranslationProvider    │
                           └────────────┬─────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                               ▼
┌───────────────┐               ┌───────────────┐               ┌───────────────┐
│ OllamaProvider│               │ LocalHttpProv │               │ChromeBuiltInAI│
├───────────────┤               ├───────────────┤               ├───────────────┤
│http://localhost:              │OpenAI schema  │               │window.ai /    │
│11434/api      │               │(LM Studio/vLLM│               │window.trans...│
└───────────────┘               └───────────────┘               └───────────────┘
```

#### 4.1.1 Ollama Provider (`OllamaProvider`)
- **Provider ID**: `'ollama-provider'` as `ProviderId`.
- **Display Name**: `'Ollama (Local LLM)'`.
- **Default Endpoint**: `http://localhost:11434`.
- **Capabilities**:
  - `streaming`: `true`
  - `glossary`: `false`
  - `context`: `true`
  - `maxSegments`: `50`
  - `isOffline`: `true`
- **Request Format**:
  - Endpoint: `POST http://localhost:11434/api/generate` or `POST http://localhost:11434/api/chat`
  - Schema:
    ```json
    {
      "model": "qwen2.5:7b",
      "messages": [
        {
          "role": "system",
          "content": "You are a professional translator. Translate the JSON array of segments to zh-Hant. Output ONLY valid JSON: [{\"id\":\"...\",\"translatedText\":\"...\"}]"
        },
        {
          "role": "user",
          "content": "[{\"id\":\"seg-1\",\"text\":\"Hello world\"}]"
        }
      ],
      "stream": false,
      "format": "json",
      "options": { "temperature": 0.1 }
    }
    ```
- **Health Check & Model Discovery**:
  - `GET http://localhost:11434/api/tags` returns available local models (`llama3.2`, `qwen2.5`, `gemma2`, `mistral`).
  - Validation error if endpoint is unreachable or model is not installed.

#### 4.1.2 Local Custom HTTP Endpoint Provider (`LocalHttpProvider`)
- **Provider ID**: `'local-http-provider'` as `ProviderId`.
- **Display Name**: `'Local Custom HTTP (OpenAI-compatible)'`.
- **Target Systems**: LM Studio, LocalAI, vLLM, Text-Gen-WebUI, Ollama OpenAI compatibility layer.
- **Default Endpoint**: `http://127.0.0.1:1234/v1/chat/completions`.
- **Capabilities**:
  - `streaming`: `true`
  - `glossary`: `false`
  - `context`: `true`
  - `maxSegments`: `50`
  - `isOffline`: `true`
- **Request Format**: Standard OpenAI Chat Completions REST request with Authorization Bearer header (optional).

#### 4.1.3 Chrome Built-in AI Provider (`ChromeBuiltInAIProvider`)
- **Provider ID**: `'chrome-builtin-ai-provider'` as `ProviderId`.
- **Display Name**: `'Chrome Built-in AI (Gemini Nano)'`.
- **Web API Targets**:
  - Primary API: Chrome `window.translation` API (`translation.createTranslator({ sourceLanguage, targetLanguage })`).
  - Secondary API: Chrome Prompt API (`window.ai.languageModel` / `self.ai.languageModel`).
- **Capabilities**:
  - `streaming`: `true`
  - `glossary`: `false`
  - `context`: `false`
  - `maxSegments`: `30`
  - `isOffline`: `true`
- **Execution Flow & Availability Check**:
  ```typescript
  if ('translation' in self && typeof (self as any).translation.canTranslate === 'function') {
    const status = await (self as any).translation.canTranslate({ sourceLanguage, targetLanguage });
    if (status === 'no') throw new ConfigurationError('Language pair not supported by Chrome Built-in AI');
    const translator = await (self as any).translation.createTranslator({ sourceLanguage, targetLanguage });
    const result = await translator.translate(text);
  }
  ```

### 4.2 Strict Privacy Boundary & Failover Policy

**CRITICAL PRIVACY GUARANTEE**:
- Currently, `background.ts` falls back to `MockProvider` when a provider fails.
- For local offline providers (`ollama-provider`, `local-http-provider`, `chrome-builtin-ai-provider`), auto-failover to cloud providers (Google, DeepL, Gemini) is **STRICTLY PROHIBITED**.
- If a local provider fails (e.g., Ollama is offline or model is unloading), the extension must throw a clear `NetworkError` / `ProviderError` alerting the user in the UI, rather than transmitting page text to a remote cloud API.

### 4.3 Extension Settings Schema Extensions (`src/core/contracts/messages.ts`)

Update `ExtensionSettings` interface with local provider parameters:

```typescript
export interface ExtensionSettings {
  targetLanguage: string;
  enabled: boolean;
  defaultTranslationMode: 'fast' | 'quality';
  activeProviderId: string;
  
  // Existing Cloud Keys
  geminiApiKey?: string;
  geminiModel?: string;
  deeplApiKey?: string;
  deeplApiIsPro?: boolean;
  
  // R4 Local Private AI Configurations
  ollamaEndpoint?: string;        // Default: "http://localhost:11434"
  ollamaModel?: string;           // Default: "qwen2.5"
  ollamaTemperature?: number;     // Default: 0.1
  
  localHttpEndpoint?: string;     // Default: "http://127.0.0.1:1234/v1/chat/completions"
  localHttpModel?: string;        // Default: "local-model"
  localHttpApiKey?: string;       // Optional bearer token
  
  chromeBuiltInAiMode?: 'translation-api' | 'prompt-api';
  
  // Display & UI
  displayMode?: 'bilingual' | 'translation-first' | 'immersive';
  showFloatingButton?: boolean;
  subtitleOriginalFontSize?: number;
  subtitleTranslatedFontSize?: number;
  subtitleOriginalColor?: string;
  subtitleTranslatedColor?: string;
}
```

---

## 5. Dual-Track E2E & Comprehensive Test Infrastructure Design

### 5.1 Architecture Overview

To balance **ultra-fast developer iteration (CI execution under 5 seconds)** with **real browser fidelity (MV3 extension API validation)**, we establish a Dual-Track E2E test setup:

```
                          ┌───────────────────────────┐
                          │   Test Execution Suite    │
                          └─────────────┬─────────────┘
                                        │
           ┌────────────────────────────┴────────────────────────────┐
           ▼                                                         ▼
[ Track 1: Fast Headless DOM ]                            [ Track 2: Real Browser E2E ]
(Vitest + JSDOM / Happy-DOM)                              (Playwright + Chromium MV3)
• Unit & Integration Tests                                • Service Worker & Context Menus
• DOM Extractor & Renderer                                • Floating Badge Interactions
• Provider Mock & Cache Logic                             • Real Shadow DOM & Layout
• Execution time: ~2-3 seconds                            • Local Mock HTTP Server (MSW)
```

### 5.2 Track 1: Fast Headless DOM Testing (Vitest)
- **Environment**: Vitest v3 with `jsdom` or `happy-dom`.
- **Scope**:
  - `tests/unit/`: Provider unit tests, schema validators, segment limits, Shadow DOM renderer modes.
  - `tests/integration/`: `regression.test.ts`, `idempotency.test.ts`, `restore-integrity.test.ts`.
- **New Test Files to Add for R3 & R4**:
  - `tests/unit/ollama-provider.test.ts`: Mock fetch calls to `http://localhost:11434` for normal response, stream error, and JSON parsing.
  - `tests/unit/local-http-provider.test.ts`: Mock OpenAI chat completion responses and custom header handling.
  - `tests/unit/chrome-builtin-ai-provider.test.ts`: Polyfill `window.translation` and test capability states (`readily`, `after-download`, `no`).
  - `tests/unit/selection-extractor.test.ts`: Test `window.getSelection()` range creation and target extraction.

### 5.3 Track 2: Real Extension E2E Testing (Playwright)
- **Framework**: Playwright (`@playwright/test`).
- **Configuration (`playwright.config.ts`)**:
  ```typescript
  import { defineConfig, devices } from '@playwright/test';
  import path from 'path';

  export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30000,
    use: {
      headless: false, // Chrome extension background SW requires headed or new headless
      viewport: { width: 1280, height: 720 },
    },
    projects: [
      {
        name: 'chromium-extension',
        use: {
          ...devices['Desktop Chrome'],
          launchOptions: {
            args: [
              `--disable-extensions-except=${path.resolve(__dirname, '.output/chrome-mv3')}`,
              `--load-extension=${path.resolve(__dirname, '.output/chrome-mv3')}`,
            ],
          },
        },
      },
    ],
  });
  ```
- **Playwright Test Scenarios (`tests/e2e/`)**:
  1. `e2e/floating-badge.spec.ts`: Loads a test fixture page, verifies floating OWT badge appears, clicks badge, verifies Shadow DOM translation blocks render, clicks restore button, verifies DOM is completely restored.
  2. `e2e/text-selection.spec.ts`: Selects text on a test web page, triggers translation via selection tooltip, verifies inline popover displays translated text.
  3. `e2e/options-page.spec.ts`: Opens `chrome-extension://<id>/options/index.html`, configures Ollama provider endpoint, saves settings, triggers translation on target page, verifies local provider call.
  4. `e2e/offline-privacy.spec.ts`: Mocks network connection, selects Ollama provider, verifies zero outbound requests hit external cloud domains.

### 5.4 Test Scripts in `package.json`

```json
{
  "scripts": {
    "test": "vitest run --environment jsdom",
    "test:watch": "vitest --environment jsdom",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "wxt build && playwright test",
    "test:all": "pnpm test && pnpm test:e2e"
  }
}
```

---

## 6. Implementation Roadmap for Developers

When implementing R3, R4, and the Test Infrastructure, developers should follow this sequential order:

1. **Step 1: R3 Extractor & Renderer Enhancements**
   - Extend `dom-extractor.ts` with `extractSelectionTargets()` and `extractGeneralBlockTargets()`.
   - Update `shadow-renderer.ts` to support `renderInlineBlock()` with `InlineHost` (`<span class="owt-inline-host">`).
   - Add inline placeholder parsing (`<ph id=...>`) to preserve `<a>`, `<b>`, `<i>` tags.
2. **Step 2: R4 Local Provider Implementation**
   - Add `src/infrastructure/providers/ollama-provider.ts`.
   - Add `src/infrastructure/providers/local-http-provider.ts`.
   - Add `src/infrastructure/providers/chrome-builtin-ai-provider.ts`.
   - Register new providers in `src/entrypoints/background.ts` and update `ExtensionSettings`.
   - Enforce privacy boundary in `background.ts` to prevent local-to-cloud auto-failover.
3. **Step 3: Test Suite Updates**
   - Create unit tests for Ollama, Local HTTP, Chrome Built-in AI, and Selection Extractor.
   - Install `@playwright/test` devDependency and create `playwright.config.ts` and `tests/e2e/` test files.
   - Run `pnpm test` and `pnpm test:e2e` to verify compliance.

---

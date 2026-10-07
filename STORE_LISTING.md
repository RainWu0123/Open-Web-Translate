# Browser Store Listing Copy

This file is the canonical copy/paste source for Chrome Web Store and Firefox Add-ons submissions.

## Product name

**Open Web Translate**

## Short description — Traditional Chinese

在網頁、YouTube 與 Netflix 提供雙語翻譯、劃詞翻譯與語言學習工具，支援本機與多種雲端翻譯服務。

## Short description — English

Bilingual webpage, YouTube and Netflix translation with selection tools, local providers, and optional cloud translation services.

## Detailed description — Traditional Chinese

Open Web Translate 是一款開源、local-first 的瀏覽器翻譯與語言學習擴充功能。

主要功能：
- 一般網頁雙語對照翻譯與劃詞翻譯
- YouTube 雙語字幕
- Netflix 雙語字幕、逐句重播與學習工具
- Google Translate（免費、非官方網頁端點）、Gemini、DeepL、OpenRouter、NVIDIA NIM、Chrome Built-in AI、Ollama、Local HTTP、Custom HTTP 等 provider
- 本機生詞本、複習與翻譯快取
- 深色／淺色介面

隱私設計：
- 不含廣告、分析或遙測
- API Key 僅儲存在瀏覽器擴充功能沙盒
- Ollama / Local HTTP 僅允許 loopback
- 使用 Google Translate、Gemini、DeepL、OpenRouter、Hosted NVIDIA NIM 或 Custom HTTP 時，只有使用者要求翻譯的文字會傳送至所選服務
- 新安裝會先顯示資料傳輸說明，確認前不會向遠端 provider 發出翻譯請求

OWT 與 Netflix、YouTube、Google、DeepL、Chrome、Ollama、OpenRouter 或 NVIDIA 沒有官方隸屬或背書關係。

## Detailed description — English

Open Web Translate is an open-source, local-first browser translation and language-learning extension.

Features:
- Bilingual webpage translation and selected-text translation
- YouTube bilingual subtitles
- Netflix bilingual subtitles, sentence replay, and learning tools
- Google Translate (free, undocumented web endpoint), Gemini, DeepL, OpenRouter, NVIDIA NIM, Chrome Built-in AI, Ollama, Local HTTP, and Custom HTTP providers
- Local vocabulary, review state, and translation cache
- Light and dark interface

Privacy:
- No advertising, analytics, or telemetry
- API keys stay in the browser extension sandbox
- Ollama and Local HTTP are restricted to loopback
- When Google Translate, Gemini, DeepL, OpenRouter, hosted NVIDIA NIM, or Custom HTTP is selected, only text requested for translation is sent to that selected service
- New installs show a data-transfer notice before any remote translation request is allowed

OWT is not affiliated with or endorsed by Netflix, YouTube, Google, DeepL, Chrome, Ollama, OpenRouter, or NVIDIA.

## Chrome Web Store — single purpose

Open Web Translate translates user-requested webpage text and supported video subtitles, and provides closely related language-learning tools for that translated content.

## Permission justifications

### `storage`

Stores user settings, masked credential status, translation cache metadata, vocabulary cards, and learning state locally in the extension profile.

### `contextMenus`

Adds explicit “translate page” and “translate selected text” actions to the browser context menu.

### `activeTab`

Lets the popup act on the tab the user is currently viewing when the user explicitly starts or restores a page translation.

### `scripting`

Used to inject/recover the content script after an extension update or service-worker restart when the user explicitly invokes translation and the existing content script is unavailable.

### Host access: `*://*/*`

The extension’s primary feature is translating selected text or page text directly inside arbitrary HTTP/HTTPS websites. Host access is required to read the current page content selected for translation, render the bilingual result in place, and provide the optional selection/floating translation UI. OWT does not use this access to collect browsing history or build user profiles.

### Provider hosts

The extension sends translation requests only when a matching remote provider is explicitly selected. Gemini, DeepL, OpenRouter, and hosted NVIDIA NIM use their provider API hosts. Google Translate uses an undocumented translation web endpoint rather than the supported Google Cloud Translation API; availability is not guaranteed. NVIDIA NIM can also use an allowed loopback endpoint. Custom HTTP sends data only to the endpoint configured by the user and requires HTTPS for remote endpoints.

## Privacy policy URL

Use the public rendered repository policy:

https://github.com/RainWu0123/Open-Web-Translate/blob/master/PRIVACY.md

## Support URL

https://github.com/RainWu0123/Open-Web-Translate/issues

## Homepage

https://github.com/RainWu0123/Open-Web-Translate

## Chrome privacy-tab answers — implementation-grounded notes

- Analytics / telemetry: **No**
- Advertising: **No**
- Selling user data: **No**
- Browsing-history profiling: **No**
- Website content access: **Yes, only to implement translation/subtitle features**
- Authentication/API credentials: **Stored locally; sent only to the corresponding provider when required**
- User-requested text may be transmitted to third-party translation providers: **Yes, when a remote provider is selected**
- Local providers: **Chrome Built-in AI, Ollama, Local HTTP**
- Remote providers: **Google Translate, Gemini, DeepL, OpenRouter, hosted NVIDIA NIM, Custom HTTP**

Always answer the dashboard according to the version being submitted. If implementation changes, update this document first.

## Reviewer notes

No account is required to use the extension.

Basic webpage test:
1. Install the extension.
2. On first install, the Options page opens with the local/remote data-transfer notice.
3. Acknowledge the notice.
4. Open a normal HTTP/HTTPS article page.
5. Select text and use the OWT selection action, or open the popup and start page translation.
6. The translated text is rendered near the source text.

Provider test:
- Google Translate requires no API key, but uses an undocumented web endpoint and has no Google Cloud API SLA/compatibility guarantee.
- Gemini, DeepL, and OpenRouter require user-provided credentials.
- Hosted NVIDIA NIM requires an NVIDIA API key; loopback NIM can run without one if the local service permits it.
- Ollama / Local HTTP require a loopback service running on the reviewer machine.
- Chrome Built-in AI depends on Chrome version, supported languages, and local model availability.
- Custom HTTP is user-configured and is not needed for review.

YouTube / Netflix:
- These integrations require a video with usable subtitle tracks.
- They depend on browser-visible web-player/runtime surfaces and are not official platform SDK integrations.

The extension contains no analytics or telemetry.

## Release submission checklist

Before copying this listing into a store submission:

1. Confirm `package.json` version matches the package being uploaded.
2. Run the release smoke test in `RELEASE_CHECKLIST.md`.
3. Confirm `PRIVACY.md`, permissions, and provider behavior still match this document.
4. If a release adds a new permission or remote data flow, update the listing/privacy answers before submission.
5. Upload the new ZIP to the existing store item; do not create a new listing for an ordinary update.

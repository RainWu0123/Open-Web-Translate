# Open Web Translate

在網頁與影片字幕旁保留原文的翻譯擴充功能。

Open Web Translate（OWT）是一個開源瀏覽器擴充功能，提供網頁雙語翻譯、劃詞翻譯，以及 YouTube、Netflix 的字幕輔助工具。你可以使用雲端翻譯服務，也可以選擇在本機執行的模型。

支援 Chrome（Manifest V3）與 Firefox（Manifest V2）。使用 WXT、Vue 3 與 TypeScript 開發。

**[下載最新版本](https://github.com/RainWu0123/Open-Web-Translate/releases/latest)** · **[問題回報](https://github.com/RainWu0123/Open-Web-Translate/issues)** · **[原始碼授權](./LICENSE)**

## 可以做什麼

| 功能 | 說明 |
| --- | --- |
| 網頁翻譯 | 翻譯一般網頁內容，保留原文與譯文對照；可還原翻譯。 |
| 劃詞翻譯 | 選取文字後翻譯，也可以從右鍵選單啟動。 |
| YouTube 字幕 | 在有可用字幕的影片上顯示雙語字幕，並選擇來源字幕軌。 |
| Netflix 字幕 | 使用可取得的字幕軌進行雙語顯示；缺少目標語字幕時可嘗試 AI 翻譯。 |
| 學習工具 | 字幕查詞、生詞儲存、逐句控制與複習；部分功能需手動開啟。 |
| 介面設定 | 深色／淺色主題、字幕外觀、繁體中文／簡體中文／英文／日文介面。 |

字幕功能需要影片提供可用資訊，也依賴網站播放器的實際行為；並非每部影片、每種字幕軌都能使用。OWT 不是 Netflix 或 YouTube 的官方產品。

## 安裝與使用

你可以從 [Releases](https://github.com/RainWu0123/Open-Web-Translate/releases) 取得 Chrome、Firefox 的版本檔案。若使用開發版，請參照下方步驟自行編譯並載入。

首次安裝時會顯示資料傳輸說明。若使用遠端翻譯服務，需要先確認這份說明；使用本機服務時不需要把待翻譯文字送到第三方伺服器。

**從原始碼載入 Chrome / Edge / Brave**

1. 安裝 Node.js 22.14.0（見 `.nvmrc`）及 pnpm 9.15.0。
2. 在專案目錄執行 `pnpm install` 和 `pnpm build:chrome`。
3. 開啟 `chrome://extensions/`，啟用開發人員模式。
4. 選擇「載入未封裝項目」，指定 `.output/chrome-mv3`。

**從原始碼暫時載入 Firefox**

1. 執行 `pnpm install` 和 `pnpm build:firefox`。
2. 開啟 `about:debugging#/runtime/this-firefox`。
3. 選擇「載入暫時附加元件」，指定 `.output/firefox-mv2/manifest.json`。

Firefox 的暫時載入僅供開發測試；一般安裝與更新請依 Firefox Add-ons 的發行管道操作。

## 翻譯服務

OWT 本身不提供翻譯伺服器。翻譯內容是否離開裝置，取決於你選擇的服務。

| 服務 | 執行位置 | 備註 |
| --- | --- | --- |
| Google Translate | 遠端 | 不需 API Key；使用非官方、未文件化的網頁端點，可能隨時變更。 |
| Gemini、DeepL | 遠端 | 需要使用者提供 API Key。 |
| OpenRouter | 遠端 | 可設定模型，使用 OpenAI-compatible API。 |
| NVIDIA NIM | 遠端或本機 | Hosted NIM 使用遠端服務；也支援符合限制的 loopback 端點。 |
| Chrome Built-in AI | 瀏覽器本機 | 可用性取決於 Chrome 版本、語言與裝置模型狀態。 |
| Ollama、Local HTTP | 本機 | 僅允許 loopback 連線。 |
| Custom HTTP | 自訂端點 | 遠端端點必須使用 HTTPS；文字會傳送至指定服務。 |

不同服務在品質、延遲、費用及隱私條件上有所差異；OWT 不會替你自動切換到另一個可能傳送資料的遠端服務。

## Netflix 快捷鍵

以下快捷鍵適用於已啟用的 Netflix 學習／字幕控制情境；實際行為取決於播放器與功能設定。

| 快捷鍵 | 動作 |
| --- | --- |
| `Alt + A` / `Alt + D` | 上一句／下一句字幕 |
| `Alt + S` | 重播目前句子 |
| `Alt + Q` / `Alt + E` | 降低／提高播放速度 |
| `Alt + Z` / `Alt + C` | 切換原文／譯文字幕可見性 |

## 本地開發

專案使用 Node.js 22.14.0（`.nvmrc`）和 pnpm 9.15.0。

```bash
pnpm install
pnpm dev            # Chrome 開發模式
pnpm dev:firefox    # Firefox 開發模式
pnpm typecheck
pnpm test
pnpm build:chrome
pnpm build:firefox
pnpm zip:chrome
pnpm zip:firefox
```

程式碼主要分為 `src/core`（翻譯與學習邏輯）、`src/infrastructure`（服務、儲存與訊息）、`src/adapters`（網站與字幕整合）及 `src/entrypoints`（擴充功能入口）。架構說明見 [`PROJECT.md`](./PROJECT.md)。

CI 包含型別檢查、Vitest 測試及雙瀏覽器建置。目前部分標示為 E2E 的測試仍是 JSDOM 情境測試，**不能取代真實瀏覽器驗收**。

## 隱私與限制

- 設定、生詞與快取主要保存在瀏覽器本機；API Key 由擴充功能的背景／服務層使用，不暴露給一般網頁。
- 若選擇遠端翻譯服務，要求翻譯的文字會傳送至所選服務。初次安裝的遠端資料傳輸說明需先確認。
- 本專案沒有加入廣告、分析或遙測服務。
- 網站字幕整合依賴播放器可見的網頁／執行階段介面。Netflix、YouTube 更新後可能需要調整程式。
- Chrome Built-in AI 及非官方 Google Translate 網頁端點的可用性不受本專案控制。

完整資料處理方式請見 [`PRIVACY.md`](./PRIVACY.md)，安全問題回報方式見 [`SECURITY.md`](./SECURITY.md)。

## 文件與貢獻

- [Contributing](./CONTRIBUTING.md)：參與方式
- [Code audit](./CODE_AUDIT.md)：已知工程風險與審查紀錄
- [Release checklist](./RELEASE_CHECKLIST.md)：版本發布前的檢查項目
- [Firefox review](./FIREFOX_REVIEW.md)：Firefox 發行與原始碼重建說明
- [Third-party notices](./THIRD_PARTY_NOTICES.md)：第三方套件授權與來源

歡迎透過 [Issues](https://github.com/RainWu0123/Open-Web-Translate/issues) 回報問題，或以 Pull Request 提交修改。引用或改編第三方程式碼時，請保留適用的授權與來源註記。

## License

Open Web Translate 使用 [Mozilla Public License 2.0](./LICENSE)。

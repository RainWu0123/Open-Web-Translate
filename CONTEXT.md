# Domain Glossary & Context

Open Web Translate v3 — 術語以英文為準，介面與說明可用中文。

## Subtitle Engine

### SubtitleOverlayRenderer
Netflix 用的雙語字幕疊加層：fixed 定位、可拖曳、Shadow DOM 渲染。職責是把
`BilingualLine` 規格放上畫面；不決定行的順序。

- **Interface**: `mount()`, `render()`, `clear()`, `destroy()`, `updateSettings()`
- **Seam**: 站在 Platform Caption Adapters 與瀏覽器 DOM 之間。

### composeBilingualLines（純規則模組）
displayMode（bilingual / translation-first / immersive）的唯一規則所在：
哪些行、什麼順序、哪行粗體。兩個 rendering adapter（Netflix 疊加層、
YouTube 行內段）共用；零 DOM，直接可測。

### NetflixCaptionAdapter / CaptionAdapterBase
站台字幕 adapter。共用生命週期（設定同步、導航守衞、routeGeneration 快取
失效、按鈕再注入）住在 `CaptionAdapterBase`；站台特定的 DOM 工作在子類。
**選軌政策**：`auto` 模式優先選目標語言的原生軌，找不到才退 AI／機器翻譯；
`manual` 尊重使用者選擇，軌道消失時退回 auto。

## Netflix MAIN↔content Bridge

### netflix-bridge
主世界（頁面）與內容腳本之間的 wire protocol 模組：postMessage 主通道 +
CustomEvent JSON 鏡像（Firefox DataCloneError 後備）、revision 去重、
requestId 對往 + 逾時。協定欄位（source/type）不可被 payload 覆蓋。

### NetflixTrackDiscovery
「三重策略」發現引擎：JSON.parse 補丁（子字串短路、抓到即自解）、fetch
複製、Cadmium 輪詢（閒置停止）、performance 擷取與水合。介面：
`start/stop/rearm/pollOnce/rebroadcast/bindHydratedUrl`。

## Translation Engine

### TranslationPipeline
快取檢查、provider 建立與翻譯、失敗轉移（主 → Google → Mock 並標記
DEGRADED）、快取寫回的管線。

- **Interface**: `translate(request): Promise<TranslationResponse>`
- **Seam**: Background Message Router 與 Infrastructure Providers 之間。

### HttpTranslationClient
所有網路 provider 共用的傳輸模組：訊號＋逾時組合、退避重試、狀態→錯誤
階梯（`interpretStatus` hook）、金鑰遮蔽、JSON 解析。單一 factory：
`ModelRegistry.createProvider`（經 `getProvider()`）。

## Settings

### SettingsStorage（單一設定模組）
整個擴充功能的設定只有一個系統：schema（`ExtensionSettings`，含巢狀
`netflix`）、儲存區（storage.local / `owt_settings`）、預設值
（`DEFAULT_SETTINGS`）、變更 seam（`watch`）。介面：`get / set / watch`。
不允許在它旁邊長出平行的 schema、傳輸或預設值。

### Tab Command Transport
分頁命令的單一傳輸：`extensionBridge.sendTabCommand`（可選隨選注入 +
重試）。popup／背景對內容腳本的命令一律走它。

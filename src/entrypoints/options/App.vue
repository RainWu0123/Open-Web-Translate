<template>
  <div class="stitch-layout" data-testid="options-page">
    <!-- ================================================================= -->
    <!-- 1. TOP HEADER (STITCH MINIMALIST NAVBAR)                          -->
    <!-- ================================================================= -->
    <header class="stitch-header">
      <div class="header-left">
        <button type="button" class="stitch-brand" @click="switchTab('subtitles')">
          <span class="brand-name">Open Web Translate</span>
        </button>
      </div>

      <div class="header-center">
        <div class="search-pill">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="text"
            v-model="globalSearchQuery"
            placeholder="搜尋設定…" aria-label="搜尋設定"
            class="search-input"
            @keydown.enter.prevent="openFirstSearchResult" @keydown.esc="globalSearchQuery = ''"
            ref="searchInputRef"
          />
          <kbd class="search-kbd">Ctrl K</kbd>
        </div>
        <div v-if="globalSearchQuery.trim()" class="search-results" aria-label="搜尋結果">
          <button v-for="item in searchResults" :key="item.tab" type="button" @click="selectSearchResult(item.tab)">
            <span>{{ item.label }}</span><span aria-hidden="true">↗</span>
          </button>
          <p v-if="!searchResults.length" role="status">沒有符合的設定，試試「字幕」或「翻譯」。</p>
        </div>
      </div>

      <div class="header-right">

        <div class="theme-select-box">
          <select v-model="theme" @change="onThemeChange" class="stitch-theme-select" aria-label="介面主題">
            <option value="system">自動</option>
            <option value="dark">深色</option>
            <option value="light">淺色</option>
          </select>
        </div>
      </div>
    </header>

    <!-- ================================================================= -->
    <!-- 2. BODY: 3-COLUMN STITCH ARCHITECTURE                             -->
    <!-- ================================================================= -->
    <div class="stitch-body">
      <!-- 2A. LEFT SIDEBAR NAVIGATION -->
      <aside class="stitch-sidebar-left">
        <!-- Top flat items -->
        <div class="sidebar-group flat-nav">
          <button
            :class="['sidebar-nav-btn', { active: activeTab === 'general' }]"
            @click="switchTab('general')"
            data-testid="tab-general"
          >
            <span>閱讀設定</span>
          </button>
          <button
            :class="['sidebar-nav-btn', { active: activeTab === 'subtitles' }]"
            @click="switchTab('subtitles')"
            data-testid="tab-subtitles"
          >
            <span>字幕設定</span>
          </button>
          <button
            :class="['sidebar-nav-btn', { active: activeTab === 'learning' }]"
            @click="switchTab('learning')"
            data-testid="tab-learning"
          >
            <span>複習單字</span>
            <span v-if="vocabItems.length && dueCardsCount > 0" class="sidebar-count-chip">{{ dueCardsCount }}</span>
          </button>
          <button
            :class="['sidebar-nav-btn', { active: activeTab === 'vocabulary' }]"
            @click="switchTab('vocabulary')"
            data-testid="tab-vocabulary"
          >
            <span>我的單字</span>
          </button>
          <button
            :class="['sidebar-nav-btn', { active: activeTab === 'models' }]"
            @click="switchTab('models')"
            data-testid="tab-providers"
          >
            <span>翻譯服務</span>
          </button>

        </div>

      </aside>

      <!-- 2B. CENTER MAIN CANVAS -->
      <main class="stitch-main" ref="mainCanvasRef">
        <div class="canvas-content-flow">
          <p v-if="feedback" :role="feedbackError ? 'alert' : 'status'" :class="['feedback', { error: feedbackError }]">{{ feedback }}</p>


          <!-- Main Title -->
          <h1 class="canvas-title">{{ currentHeadline }}</h1>

          <!-- Subtitle -->
          <p class="canvas-subtitle">{{ currentSubtitle }}</p>

          <!-- ========================================================= -->
          <!-- TAB 1: SUBTITLES                                          -->
          <!-- ========================================================= -->
          <template v-if="activeTab === 'subtitles'">
            <!-- Live Subtitle Video Preview Canvas (NO MAC DOTS) -->
            <!-- The mock video frame is always dark, whatever the page theme: scope the dark tokens to it. -->
            <div id="sub-preview" class="preview-canvas-card" data-theme="dark">
              <!-- Clean Cinema Preview Toolbar -->
              <div class="canvas-toolbar">
                <div class="toolbar-chip active">
                  <span>Netflix 外觀預覽</span>
                </div>
                <div class="toolbar-sep"></div>
                <span class="preview-hint">僅示意外觀，不代表影片已連線</span>
              </div>

              <!-- Movie scene backdrop with live dynamic subtitles -->
              <div
                class="cinema-viewport"
                :style="{ paddingBottom: (netflixConfig.bottomPosition ? Math.min(netflixConfig.bottomPosition, 140) : 60) + 'px' }"
              >
                <div class="cinema-overlay"></div>
                <div
                  class="subtitles-stack"
                  :style="{ gap: (netflixConfig.lineSpacing || 4) + 'px' }"
                >
                  <div
                    class="rendered-sub primary"
                    :style="{
                      fontSize: (netflixConfig.primarySize || 18) + 'px',
                      color: settings.subtitleOriginalColor || '#ffffff',
                    }"
                  >
                    The beginning of knowledge is the discovery of something we do not understand.
                  </div>
                  <div
                    class="rendered-sub secondary"
                    :style="{
                      fontSize: (netflixConfig.secondarySize || 22) + 'px',
                      color: settings.subtitleTranslatedColor || '#d4d4d4',
                    }"
                  >
                    知識的起點，是發現我們所不理解的事物。
                  </div>
                </div>
              </div>
            </div>

            <!-- Netflix Configuration Section -->
            <section id="sub-netflix" class="stitch-section">
              <div class="section-header-block">
                <h2 class="section-heading">Netflix 雙語字幕</h2>
                <p class="section-lead">調整原文、譯文的大小與位置。影片必須有可用的文字字幕。</p>
              </div>

              <div class="stitch-rows-container">
                <!-- Toggle -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">啟用 Netflix 雙語字幕</span>
                    <span class="row-desc">允許使用雙語字幕。在 Netflix 播放影片後，從擴充功能按「開啟雙語字幕」。</span>
                  </div>
                  <div class="row-control">
                    <label class="toggle">
                      <input aria-label="啟用 Netflix 雙語字幕"
                        type="checkbox"
                        v-model="netflixConfig.enabled"
                        @change="saveNetflix"
                        data-testid="netflix-enabled-toggle"
                      />
                      <span class="slider"></span>
                    </label>
                  </div>
                </div>

                <!-- Primary Subtitle Size -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">Netflix 原文大小</span>
                    <span class="row-desc">影片原生字幕字體大小 (12px – 48px)。</span>
                  </div>
                  <div class="row-control slider-control">
                    <input aria-label="Netflix 原文大小"
                      type="range"
                      min="12"
                      max="48"
                      v-model.number="netflixConfig.primarySize"
                      @change="saveNetflix"
                    />
                    <span class="row-val-badge">{{ netflixConfig.primarySize }}px</span>
                  </div>
                </div>

                <!-- Secondary Subtitle Size -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">Netflix 譯文大小</span>
                    <span class="row-desc">雙語翻譯字幕字體大小 (12px – 48px)。</span>
                  </div>
                  <div class="row-control slider-control">
                    <input aria-label="Netflix 譯文大小"
                      type="range"
                      min="12"
                      max="48"
                      v-model.number="netflixConfig.secondarySize"
                      @change="saveNetflix"
                    />
                    <span class="row-val-badge">{{ netflixConfig.secondarySize }}px</span>
                  </div>
                </div>

                <!-- Bottom Position -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">距離畫面底部</span>
                    <span class="row-desc">字幕距離畫面底部的邊距高度 (20px – 300px)。</span>
                  </div>
                  <div class="row-control slider-control">
                    <input aria-label="距離畫面底部"
                      type="range"
                      min="20"
                      max="300"
                      v-model.number="netflixConfig.bottomPosition"
                      @change="saveNetflix"
                    />
                    <span class="row-val-badge">{{ netflixConfig.bottomPosition }}px</span>
                  </div>
                </div>

                <!-- Line Spacing -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">兩行字幕的間距</span>
                    <span class="row-desc">主字幕與副字幕之間的垂直間隙 (0px – 40px)。</span>
                  </div>
                  <div class="row-control slider-control">
                    <input aria-label="兩行字幕的間距"
                      type="range"
                      min="0"
                      max="40"
                      v-model.number="netflixConfig.lineSpacing"
                      @change="saveNetflix"
                    />
                    <span class="row-val-badge">{{ netflixConfig.lineSpacing }}px</span>
                  </div>
                </div>

                <!-- Learning Mode -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">學習模式（單字逐詞點擊）</span>
                    <span class="row-desc">在播放器字幕上點擊任一生詞即可立即查詢並存入生詞庫。</span>
                  </div>
                  <div class="row-control">
                    <label class="toggle">
                      <input aria-label="學習模式（單字逐詞點擊）"
                        type="checkbox"
                        v-model="netflixConfig.learningMode"
                        @change="saveNetflix"
                      />
                      <span class="slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <!-- YouTube 字幕樣式 Section -->
            <section id="sub-youtube" class="stitch-section">
              <div class="section-header-block">
                <h2 class="section-heading">YouTube 字幕外觀</h2>
                <p class="section-lead">自訂 YouTube 原文字幕與譯文字幕的字體大小、顯示色彩與對比度。</p>
              </div>

              <div class="stitch-rows-container">
                <!-- Original Font Size -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">YouTube 原文字幕大小</span>
                    <span class="row-desc">設定影片原文字幕字體大小 (12px – 32px)。</span>
                  </div>
                  <div class="row-control slider-control">
                    <input aria-label="YouTube 原文字幕大小"
                      type="range"
                      min="12"
                      max="32"
                      v-model.number="settings.subtitleOriginalFontSize"
                      @change="save"
                    />
                    <span class="row-val-badge">{{ settings.subtitleOriginalFontSize }}px</span>
                  </div>
                </div>

                <!-- Translated Font Size -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">YouTube 譯文字幕大小</span>
                    <span class="row-desc">設定翻譯字幕字體大小 (14px – 40px)。</span>
                  </div>
                  <div class="row-control slider-control">
                    <input aria-label="YouTube 譯文字幕大小"
                      type="range"
                      min="14"
                      max="40"
                      v-model.number="settings.subtitleTranslatedFontSize"
                      @change="save"
                    />
                    <span class="row-val-badge">{{ settings.subtitleTranslatedFontSize }}px</span>
                  </div>
                </div>

                <!-- Original Color -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">YouTube 原文字幕顏色</span>
                    <span class="row-desc">設定影片原文字幕文字色彩。</span>
                  </div>
                  <div class="row-control color-control">
                    <input aria-label="YouTube 原文字幕顏色"
                      type="color"
                      v-model="settings.subtitleOriginalColor"
                      @change="save"
                    />
                    <span class="row-val-badge monospace">{{ settings.subtitleOriginalColor }}</span>
                  </div>
                </div>

                <!-- Translated Color -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">YouTube 譯文字幕顏色</span>
                    <span class="row-desc">設定翻譯字幕文字色彩。</span>
                  </div>
                  <div class="row-control color-control">
                    <input aria-label="YouTube 譯文字幕顏色"
                      type="color"
                      v-model="settings.subtitleTranslatedColor"
                      @change="save"
                    />
                    <span class="row-val-badge monospace">{{ settings.subtitleTranslatedColor }}</span>
                  </div>
                </div>
              </div>
            </section>

            <!-- Hotkeys Guide Section -->
            <section id="sub-hotkeys" class="stitch-section">
              <div class="section-header-block">
                <h2 class="section-heading">操作與快捷鍵</h2>
                <p class="section-lead">觀看影視雙語字幕時的專屬鍵盤快捷鍵。</p>
              </div>

              <div class="hotkey-grid">
                <div class="hotkey-card">
                  <div class="hk-keys"><kbd>Alt + Q</kbd> / <kbd>Alt + E</kbd></div>
                  <span class="hk-desc">減慢 / 加快播放速度</span>
                </div>
                <div class="hotkey-card">
                  <div class="hk-keys"><kbd>Alt + A</kbd> / <kbd>Alt + D</kbd></div>
                  <span class="hk-desc">上一個 / 下一個字幕</span>
                </div>
                <div class="hotkey-card">
                  <div class="hk-keys"><kbd>Alt + S</kbd></div>
                  <span class="hk-desc">重複播放當前字幕</span>
                </div>
                <div class="hotkey-card">
                  <div class="hk-keys"><kbd>Alt + Z</kbd> / <kbd>Alt + C</kbd></div>
                  <span class="hk-desc">開關主字幕 / 開關副字幕</span>
                </div>
              </div>
            </section>
          </template>

          <!-- ========================================================= -->
          <!-- TAB 2: LEARNING STUDIO                                    -->
          <!-- ========================================================= -->
          <template v-else-if="activeTab === 'learning'">
            <div id="learn-stage" class="learning-container">
              <FlashcardWorkbench
                :cards="learningCards" :save-review="recordSrsReview"

                @close="switchTab('vocabulary')"
              />
            </div>

            <section id="learn-anki" class="stitch-section">
              <div class="section-header-block">
                <h2 class="section-heading">匯出至 Anki</h2>
                <p class="section-lead">匯出單字、釋義與例句。在 Anki 匯入時選擇 Tab 分隔與「允許 HTML」。</p>
              </div>
              <button :disabled="!learningCards.length" @click="onExportAnki" class="btn-stitch-accent">
                匯出 Anki 牌組 (.txt)
              </button>
            </section>
          </template>

          <!-- ========================================================= -->
          <!-- TAB 3: VOCABULARY                                         -->
          <!-- ========================================================= -->
          <template v-else-if="activeTab === 'vocabulary'">
            <div id="vocab-stage" class="vocab-container">
              <GlossaryManager
                :items="vocabItems" :save-review="recordSrsReview" :save-term="addVocabItem"
                :t="t"
                @deleteItem="deleteVocabItem"
                @clearAll="clearVocabulary"
                @exportCsv="exportVocabulary"
                @recordReview="recordSrsReview"
              />
            </div>
          </template>

          <!-- ========================================================= -->
          <!-- TAB 4: AI PROVIDERS                                       -->
          <!-- ========================================================= -->
          <template v-else-if="activeTab === 'models'">
            <section id="models-provider" class="stitch-section">
              <div class="section-header-block">
                <h2 class="section-heading">選擇翻譯服務</h2>
                <p class="section-lead">選擇預設翻譯提供商與進階模型配置。</p>
              </div>

              <div class="stitch-rows-container">
                <!-- Provider Select -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">使用的服務</span>
                    <span class="row-desc">選擇翻譯服務提供商。</span>
                  </div>
                  <div class="row-control">
                    <select aria-label="使用的服務" v-model="settings.activeProviderId" @change="save" class="stitch-select">
                      <option value="google-provider">Google Translate (Free)</option>
                      <option value="gemini-provider">Google Gemini API</option>
                      <option value="deepl-provider">DeepL Translate API</option>
                      <option value="ollama-provider">Local Ollama AI (loopback only)</option>
                      <option value="local-http-provider">Local HTTP AI (loopback only)</option>
                      <option value="custom-http-provider">Custom HTTP API (remote/self-hosted)</option>
                      <option value="chrome-builtin-ai-provider" disabled>Chrome Built-in AI（暫不提供）</option>
                    </select>
                  </div>
                </div>

                <!-- Gemini Model -->
                <div class="stitch-row" v-if="settings.activeProviderId === 'gemini-provider'">
                  <div class="row-info">
                    <span class="row-title">Gemini 模型名稱</span>
                    <span class="row-desc">選擇官方驗證模型或輸入自訂模型 ID。</span>
                  </div>
                  <div class="row-control">
                    <select aria-label="Gemini 模型名稱" v-model="settings.geminiModel" @change="save" class="stitch-select">
                      <option v-for="m in activeModels" :key="m.id" :value="m.id">
                        {{ m.displayName }}{{ m.isDefaultCandidate ? ' (Recommended)' : '' }}
                      </option>
                    </select>
                  </div>
                </div>

                <!-- Gemini API Key -->
                <div class="stitch-row" v-if="settings.activeProviderId === 'gemini-provider'">
                  <div class="row-info">
                    <span class="row-title">Gemini API 金鑰</span>
                    <span class="row-desc">目前狀態：{{ settings.hasGeminiApiKey ? settings.geminiApiKeyMasked : '未設定' }}</span>
                  </div>
                  <div class="row-control input-group">
                    <input aria-label="Gemini API 金鑰"
                      type="password"
                      v-model="geminiKeyInput"
                      placeholder="貼上 Gemini 金鑰"
                      class="stitch-input"
                    />
                    <button class="btn-stitch-accent" @click="saveApiKey(geminiKeyInput)">
                      {{ saveApiKeyStatus === 'success' ? '已儲存 ✓' : saveApiKeyStatus === 'error' ? '儲存失敗' : '儲存' }}
                    </button>
                    <button class="btn-stitch-secondary" @click="clearApiKey" v-if="settings.hasGeminiApiKey">清除</button>
                  </div>
                </div>

                <!-- DeepL API Key -->
                <div class="stitch-row" v-if="settings.activeProviderId === 'deepl-provider'">
                  <div class="row-info">
                    <span class="row-title">DeepL API 金鑰</span>
                    <span class="row-desc">目前狀態：{{ settings.hasDeeplApiKey ? settings.deeplApiKeyMasked : '未設定' }}</span>
                  </div>
                  <div class="row-control input-group">
                    <input aria-label="DeepL API 金鑰"
                      type="password"
                      v-model="deeplKeyInput"
                      placeholder="貼上 DeepL 金鑰"
                      class="stitch-input"
                    />
                    <button class="btn-stitch-accent" @click="saveDeeplKey(deeplKeyInput)">
                      {{ saveDeeplKeyStatus === 'success' ? '已儲存 ✓' : saveDeeplKeyStatus === 'error' ? '儲存失敗' : '儲存' }}
                    </button>
                    <button class="btn-stitch-secondary" @click="clearDeeplKey" v-if="settings.hasDeeplApiKey">清除</button>
                  </div>
                </div>


                <div v-if="settings.activeProviderId === 'ollama-provider'" class="stitch-row vertical-row">
                  <label for="ollama-url" class="row-title">Ollama 位址</label>
                  <p class="row-desc">僅允許 localhost、127.0.0.0/8 或 ::1。請先啟動本機 Ollama，並下載要使用的模型。</p>
                  <input id="ollama-url" class="stitch-input" type="url" v-model="settings.ollamaEndpoint" @change="save" />
                  <label for="ollama-model" class="row-title">模型名稱</label>
                  <input id="ollama-model" class="stitch-input" v-model="settings.ollamaModel" @change="save" />
                </div>
                <div v-if="settings.activeProviderId === 'local-http-provider'" class="stitch-row vertical-row">
                  <label for="http-url" class="row-title">本機翻譯服務位址</label>
                  <p class="row-desc">僅允許 localhost、127.0.0.0/8 或 ::1 的相容 OpenAI 本機服務。填入根位址，擴充功能會呼叫 /v1/chat/completions。</p>
                  <input id="http-url" class="stitch-input" type="url" v-model="settings.localHttpEndpoint" @change="save" />
                  <label for="http-model" class="row-title">模型名稱</label>
                  <input id="http-model" class="stitch-input" v-model="settings.localHttpModel" @change="save" />
                  <label for="http-key" class="row-title">服務金鑰（選填）</label>
                  <p class="row-desc">目前狀態：{{ settings.hasLocalHttpApiKey ? settings.localHttpApiKeyMasked : '未設定' }}</p>
                  <div class="input-group">
                    <input id="http-key" class="stitch-input" type="password" v-model="localHttpKeyInput" placeholder="貼上服務金鑰" />
                    <button class="btn-stitch-accent" @click="saveLocalHttpKey(localHttpKeyInput)">
                      {{ saveLocalHttpKeyStatus === 'success' ? '已儲存 ✓' : saveLocalHttpKeyStatus === 'error' ? '儲存失敗' : '儲存' }}
                    </button>
                    <button class="btn-stitch-secondary" @click="clearLocalHttpKey" v-if="settings.hasLocalHttpApiKey">清除</button>
                  </div>
                </div>
                <div v-if="settings.activeProviderId === 'custom-http-provider'" class="stitch-row vertical-row">
                  <label for="custom-http-url" class="row-title">自訂 API 根位址</label>
                  <p class="row-desc">相容 OpenAI Chat Completions。遠端位址必須使用 HTTPS；翻譯內容會傳送到你指定的服務。</p>
                  <input id="custom-http-url" class="stitch-input" type="url" v-model="settings.customHttpEndpoint" @change="save" placeholder="https://api.example.com" />
                  <label for="custom-http-model" class="row-title">模型名稱</label>
                  <input id="custom-http-model" class="stitch-input" v-model="settings.customHttpModel" @change="save" placeholder="model-name" />
                  <label for="custom-http-key" class="row-title">服務金鑰（選填）</label>
                  <p class="row-desc">目前狀態：{{ settings.hasCustomHttpApiKey ? settings.customHttpApiKeyMasked : '未設定' }}</p>
                  <div class="input-group">
                    <input id="custom-http-key" class="stitch-input" type="password" v-model="customHttpKeyInput" placeholder="貼上服務金鑰" />
                    <button class="btn-stitch-accent" @click="saveCustomHttpKey(customHttpKeyInput)">
                      {{ saveCustomHttpKeyStatus === 'success' ? '已儲存 ✓' : saveCustomHttpKeyStatus === 'error' ? '儲存失敗' : '儲存' }}
                    </button>
                    <button class="btn-stitch-secondary" @click="clearCustomHttpKey" v-if="settings.hasCustomHttpApiKey">清除</button>
                  </div>
                </div>
                <div v-if="settings.activeProviderId === 'deepl-provider'" class="stitch-row">
                  <label for="deepl-plan" class="row-title">DeepL API 方案</label>
                  <select id="deepl-plan" v-model="settings.deeplApiIsPro" @change="save"><option :value="false">API Free</option><option :value="true">API Pro</option></select>
                </div>
                <p v-if="['chrome-ai-provider', 'chrome-builtin-ai-provider'].includes(settings.activeProviderId)" class="stitch-row row-desc">Chrome 內建 AI 的整合尚未完成實機驗證，目前暫不提供。請改選其他翻譯服務。</p>

                <div class="stitch-row vertical-row">
                  <span class="row-title">確認服務是否可用</span>
                  <p class="row-desc">將「Hello」送到目前選擇的服務試譯。付費服務可能計入用量。</p>
                  <button type="button" class="btn-stitch-secondary" :disabled="testingProvider" @click="testProvider">{{ testingProvider ? '正在試譯…' : '試譯一句' }}</button>
                  <p v-if="providerTestResult" role="status">{{ providerTestResult }}</p>
                </div>
                <!-- AI Translation Instructions -->
                <div v-if="['gemini-provider', 'ollama-provider', 'local-http-provider', 'custom-http-provider'].includes(settings.activeProviderId)" class="stitch-row vertical-row">
                  <div class="row-info">
                    <span class="row-title">翻譯偏好</span>
                    <span class="row-desc">提供給 Gemini、Ollama 等 AI 模型的風格與術語指引。</span>
                  </div>
                  <div class="textarea-wrapper">
                    <textarea
                      v-model="settings.aiTranslationInstructions"
                      rows="4"
                      class="stitch-textarea"
                      placeholder="例：使用自然的繁體中文口語；遇到專有名詞保留原文並附帶中文譯名。"
                      @blur="save"
                    ></textarea>
                    <div class="textarea-actions">
                      <button class="btn-stitch-secondary" @click="clearAiInstructions">清空指示</button>
                      <button class="btn-stitch-accent" @click="save">儲存指示</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </template>

          <!-- ========================================================= -->
          <!-- TAB 5: GENERAL SETTINGS                                   -->
          <!-- ========================================================= -->
          <template v-else>
            <section id="gen-settings" class="stitch-section">

              <div class="stitch-rows-container">
                <!-- Enable Translation -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">啟用網頁翻譯功能</span>
                    <span class="row-desc">開啟或關閉全網頁的雙語翻譯服務。</span>
                  </div>
                  <div class="row-control">
                    <label class="toggle">
                      <input aria-label="啟用網頁翻譯功能"
                        type="checkbox"
                        v-model="settings.enabled"
                        @change="save"
                      />
                      <span class="slider"></span>
                    </label>
                  </div>
                </div>

                <!-- Source Language -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">原文語言</span>
                    <span class="row-desc">網頁與影片字幕共用的原始語言。</span>
                  </div>
                  <div class="row-control">
                    <select aria-label="原文語言" v-model="settings.sourceLanguage" @change="save" class="stitch-select">
                      <option value="auto">自動辨識</option>
                      <option value="en">English</option>
                      <option value="zh-Hant">繁體中文</option>
                      <option value="zh-Hans">簡體中文</option>
                      <option value="ja">日本語</option>
                      <option value="ko">한국어</option>
                      <option value="es">Español</option>
                    </select>
                  </div>
                </div>

                <!-- Target Language -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">翻譯成</span>
                    <span class="row-desc">網頁與影片字幕共用的翻譯目標語言。</span>
                  </div>
                  <div class="row-control">
                    <select aria-label="翻譯成" v-model="settings.targetLanguage" @change="save" class="stitch-select">
                      <option value="zh-Hant">繁體中文</option>
                      <option value="zh-Hans">簡體中文</option>
                      <option value="en">English</option>
                      <option value="ja">日本語</option>
                      <option value="ko">한국어</option>
                      <option value="es">Español</option>
                    </select>
                  </div>
                </div>

                <!-- Display Mode -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">閱讀方式</span>
                    <span class="row-desc">選擇同時看原文與譯文，或以譯文為主。</span>
                  </div>
                  <div class="row-control">
                    <select aria-label="閱讀方式" v-model="settings.displayMode" @change="save" class="stitch-select">
                      <option value="bilingual">原文與譯文並列</option>
                      <option value="translation-first">先看譯文</option>
                      <option value="immersive">只看譯文，點擊看原文</option>
                    </select>
                  </div>
                </div>

                <!-- Floating Button -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">網頁上的翻譯按鈕</span>
                    <span class="row-desc">在網頁右下角顯示快速劃詞與翻譯按鈕。</span>
                  </div>
                  <div class="row-control">
                    <label class="toggle">
                      <input aria-label="網頁上的翻譯按鈕"
                        type="checkbox"
                        v-model="settings.showFloatingButton"
                        @change="save"
                      />
                      <span class="slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </section>
          </template>
        </div>
      </main>


    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { LearningRepository } from '@/infrastructure/storage/repositories/learning-repository';
import { useUiTheme } from '@/shared/ui/use-ui-theme';
import {
  getActiveVerifiedModels,
  getDeprecatedButFunctionalModels,
  DEFAULT_MODEL_ID,
} from '@/infrastructure/providers/gemini/model-registry';
import type { LearningCard, SrsGrade } from '@/core/domain/learning-types';
import GlossaryManager from '@/components/GlossaryManager.vue';
import FlashcardWorkbench from '@/components/learning/FlashcardWorkbench.vue';

const activeModels = getActiveVerifiedModels();
const deprecatedModels = getDeprecatedButFunctionalModels();

const activeTab = ref('general');
const activeAnchor = ref('');

const globalSearchQuery = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);
const mainCanvasRef = ref<HTMLElement | null>(null);

const geminiKeyInput = ref('');
const deeplKeyInput = ref('');
const localHttpKeyInput = ref('');
const customHttpKeyInput = ref('');
const testingProvider = ref(false);
const providerTestResult = ref('');
const saveApiKeyStatus = ref<'idle' | 'success' | 'error'>('idle');
const saveDeeplKeyStatus = ref<'idle' | 'success' | 'error'>('idle');
const saveLocalHttpKeyStatus = ref<'idle' | 'success' | 'error'>('idle');
const saveCustomHttpKeyStatus = ref<'idle' | 'success' | 'error'>('idle');

const settings = ref({
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'llama3',
  localHttpEndpoint: 'http://localhost:8080',
  hasLocalHttpApiKey: false,
  localHttpApiKeyMasked: '',
  localHttpModel: 'local-model',
  customHttpEndpoint: '',
  hasCustomHttpApiKey: false,
  customHttpApiKeyMasked: '',
  customHttpModel: 'default',
  enabled: true,
  sourceLanguage: 'auto',
  targetLanguage: 'zh-Hant',
  defaultTranslationMode: 'fast' as 'fast' | 'quality',
  activeProviderId: 'gemini-provider',
  hasGeminiApiKey: false,
  geminiApiKeyMasked: '',
  geminiModel: DEFAULT_MODEL_ID,
  aiTranslationInstructions: '',
  hasDeeplApiKey: false,
  deeplApiKeyMasked: '',
  deeplApiIsPro: false,
  displayMode: 'bilingual' as 'bilingual' | 'translation-first' | 'immersive',
  uiLanguage: 'zh-Hant',
  showFloatingButton: true,
  subtitleOriginalFontSize: 18,
  subtitleTranslatedFontSize: 22,
  subtitleOriginalColor: '#ffffff',
  subtitleTranslatedColor: '#d4d4d4',
});

const netflixConfig = ref({
  enabled: true,
  primarySize: 18,
  secondarySize: 22,
  bottomPosition: 80,
  lineSpacing: 4,
  enableBitmapRescue: true,
  learningMode: true,
});

const vocabItems = ref<LearningCard[]>([]);
const feedback = ref('');
const feedbackError = ref(false);
function reportError(message: string) { feedback.value = message; feedbackError.value = true; }
const { theme, onThemeChange } = useUiTheme(reportError);
watch(() => [settings.value.activeProviderId, settings.value.targetLanguage], () => { providerTestResult.value = ''; });

const learningCards = computed(() => vocabItems.value);

const dueCardsCount = computed(() => {
  const now = Date.now();
  return learningCards.value.filter((c) => (c.srs?.nextReviewDate || 0) <= now).length;
});



const currentHeadline = computed(() => {
  switch (activeTab.value) {
    case 'subtitles': return '字幕設定';
    case 'learning': return '複習單字';
    case 'vocabulary': return '我的單字';
    case 'models': return '翻譯服務';
    case 'general': return '閱讀設定';
    default: return 'Open Web Translate';
  }
});

const currentSubtitle = computed(() => {
  switch (activeTab.value) {
    case 'subtitles': return '先在影片頁面開啟擴充功能，再按「開啟雙語字幕」。這裡可以調整字幕外觀。';
    case 'learning': return '翻開卡片查看意思，再依記憶程度評分。我們會安排下次複習。';
    case 'vocabulary': return '收藏的單字和例句都在這裡，也可以手動新增或匯出。';
    case 'models': return 'Google 翻譯可直接使用。其他服務需先設定金鑰，或啟動本機模型。';
    case 'general': return '選擇要翻成的語言，以及網頁上原文與譯文的顯示方式。';
    default: return '次世代在地化、隱私優先、AI 驅動的開源網頁與影音翻譯工具。';
  }
});


const currentSubNavItems = computed(() => {
  switch (activeTab.value) {
    case 'subtitles':
      return [
        { id: 'sub-preview', label: '總覽' },
        { id: 'sub-netflix', label: 'Netflix 雙語字幕' },
        { id: 'sub-youtube', label: 'YouTube 字幕樣式' },
        { id: 'sub-hotkeys', label: '操作與快捷鍵' },
      ];
    case 'learning':
      return [
        { id: 'learn-stage', label: '總覽' },
        { id: 'learn-anki', label: '匯出至 Anki' },
      ];
    case 'vocabulary':
      return [
        { id: 'vocab-stage', label: '總覽' },
      ];
    case 'models':
      return [
        { id: 'models-provider', label: '總覽' },
      ];
    case 'general':
      return [
        { id: 'gen-settings', label: '總覽' },
      ];
    default:
      return [{ id: 'sub-preview', label: '總覽' }];
  }
});


function t(key: string): string {
  const dict: Record<string, string> = {
    subtitleNetflixNote: 'Netflix 字幕軌道會在播放時自動擷取。',
  };
  return dict[key] || key;
}

function switchTab(tab: string) {
  activeTab.value = tab;
  activeAnchor.value = currentSubNavItems.value[0]?.id || '';
  if (mainCanvasRef.value) {
    mainCanvasRef.value.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }
}

function scrollToAnchor(id: string) {
  activeAnchor.value = id;
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

const searchablePages = [
  { tab: 'subtitles', label: '字幕設定', keywords: 'Netflix YouTube 字幕 字級 色彩 快捷鍵 subtitles typography' },
  { tab: 'learning', label: '複習單字', keywords: '複習 學習 記憶 卡片 Anki SRS learning' },
  { tab: 'vocabulary', label: '我的單字', keywords: '單字 生詞 術語 glossary vocabulary' },
  { tab: 'models', label: '翻譯服務', keywords: '翻譯 金鑰 模型 Gemini Google DeepL Ollama AI API providers' },
  { tab: 'general', label: '閱讀設定', keywords: '語言 外觀 主題 懸浮 general preferences language' },
];
const searchResults = computed(() => {
  const query = globalSearchQuery.value.trim().toLocaleLowerCase();
  return searchablePages.filter(item => (item.label + ' ' + item.keywords).toLocaleLowerCase().includes(query));
});
function selectSearchResult(tab: string) {
  switchTab(tab);
  globalSearchQuery.value = '';
}
function openFirstSearchResult() {
  const result = searchResults.value[0];
  if (result) selectSearchResult(result.tab);
}
function handleSearchShortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    focusSearch();
  }
}
onMounted(() => window.addEventListener('keydown', handleSearchShortcut));
onUnmounted(() => window.removeEventListener('keydown', handleSearchShortcut));

function focusSearch() {
  if (searchInputRef.value) {
    searchInputRef.value.focus();
  }
}



async function loadVocabulary() {
  try {
    vocabItems.value = (await messageRouter.sendMessage({ type: 'GET_VOCAB_ITEMS' })) || [];
  } catch (e) {
    reportError('無法載入單字，請重新開啟設定頁。');
  }
}

async function addVocabItem(term: any) {
  try {
    await messageRouter.sendMessage({
      type: 'SAVE_VOCAB_ITEM' as any,
      word: term.word || term.source || '',
      translation: term.translation || term.target || '',
      context: term.context || '',
      sourceLang: settings.value.sourceLanguage,
      targetLang: settings.value.targetLanguage,
    } as any);
    await loadVocabulary();
  } catch (e) {
    reportError('單字未儲存，請再試一次。');
    throw e;
  }
}

async function deleteVocabItem(id: string) {
  try {
    await messageRouter.sendMessage({ type: 'DELETE_VOCAB_ITEM' as any, id } as any);
    await loadVocabulary();
  } catch (e) {
    reportError('刪除失敗，單字仍保留。請再試一次。');
  }
}

async function clearVocabulary() {
  if (confirm('確定清空所有單字與複習紀錄？此操作無法復原。')) {
    try {
      await messageRouter.sendMessage({ type: 'CLEAR_VOCAB_ITEMS' as any } as any);
      await loadVocabulary();
    } catch (e) {
      reportError('清空失敗，請再試一次。');
    }
  }
}

function downloadText(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportVocabulary() {
  downloadText(LearningRepository.exportToCSV(learningCards.value), 'my-vocabulary.csv', 'text/csv;charset=utf-8');
}
function onExportAnki() {
  if (!learningCards.value.length) return;
  downloadText(LearningRepository.exportToAnki(learningCards.value), 'my-vocabulary-anki.txt', 'text/plain;charset=utf-8');
}
async function recordSrsReview(id: string, grade: SrsGrade) {
  try {
    await messageRouter.sendMessage({ type: 'RECORD_SRS_REVIEW', id, grade });
    await loadVocabulary();
  } catch (e) {
    reportError('複習紀錄未儲存，請重試。');
    throw e;
  }
}

async function loadSettings() {
  try {
    const s = await SettingsStorage.get();
    if (s) {
      settings.value.ollamaEndpoint = s.ollamaEndpoint || 'http://localhost:11434';
      settings.value.ollamaModel = s.ollamaModel || 'llama3';
      settings.value.localHttpEndpoint = s.localHttpEndpoint || 'http://localhost:8080';
      settings.value.hasLocalHttpApiKey = !!s.hasLocalHttpApiKey;
      settings.value.localHttpApiKeyMasked = s.localHttpApiKeyMasked || '';
      settings.value.localHttpModel = s.localHttpModel || 'local-model';
      settings.value.customHttpEndpoint = s.customHttpEndpoint || '';
      settings.value.hasCustomHttpApiKey = !!s.hasCustomHttpApiKey;
      settings.value.customHttpApiKeyMasked = s.customHttpApiKeyMasked || '';
      settings.value.customHttpModel = s.customHttpModel || 'default';
      settings.value.enabled = s.enabled ?? true;
      settings.value.sourceLanguage = s.sourceLanguage || 'auto';
      settings.value.targetLanguage = s.targetLanguage || 'zh-Hant';
      settings.value.defaultTranslationMode = s.defaultTranslationMode || 'fast';
      settings.value.activeProviderId = s.activeProviderId || 'gemini-provider';
      settings.value.hasGeminiApiKey = !!s.hasGeminiApiKey;
      settings.value.geminiApiKeyMasked = s.geminiApiKeyMasked || '';
      settings.value.geminiModel = s.geminiModel || DEFAULT_MODEL_ID;
      settings.value.aiTranslationInstructions = s.aiTranslationInstructions || '';
      settings.value.hasDeeplApiKey = !!s.hasDeeplApiKey;
      settings.value.deeplApiKeyMasked = s.deeplApiKeyMasked || '';
      settings.value.deeplApiIsPro = !!s.deeplApiIsPro;
      settings.value.displayMode = s.displayMode || 'bilingual';
      settings.value.uiLanguage = s.uiLanguage || 'zh-Hant';
      settings.value.showFloatingButton = s.showFloatingButton ?? true;
      settings.value.subtitleOriginalFontSize = s.subtitleOriginalFontSize || 18;
      settings.value.subtitleTranslatedFontSize = s.subtitleTranslatedFontSize || 22;
      settings.value.subtitleOriginalColor = s.subtitleOriginalColor || '#ffffff';
      settings.value.subtitleTranslatedColor = s.subtitleTranslatedColor || '#d4d4d4';

      if (s.netflix) {
        netflixConfig.value.enabled = s.netflix.enabled ?? true;
        netflixConfig.value.primarySize = s.netflix.primarySize || 18;
        netflixConfig.value.secondarySize = s.netflix.secondarySize || 22;
        netflixConfig.value.bottomPosition = s.netflix.bottomPosition || 80;
        netflixConfig.value.lineSpacing = s.netflix.lineSpacing ?? 4;
        netflixConfig.value.enableBitmapRescue = s.netflix.enableBitmapRescue ?? true;
        netflixConfig.value.learningMode = s.netflix.learningMode ?? true;
      }
    }
  } catch (e) {
    console.error('Failed to load settings', e);
  }
}

async function testProvider() {
  testingProvider.value = true;
  providerTestResult.value = '';
  try {
    if (!await save()) return;
    const result = await messageRouter.sendMessage({
      type: 'TRANSLATE_REQUEST',
      bypassCache: true,
      segments: [{ id: 'connection-check', text: 'Hello' }],
      sourceLanguage: 'en', targetLanguage: settings.value.targetLanguage,
      forceProvider: settings.value.activeProviderId,
    });
    const translation = result.segments[0]?.translatedText;
    if (!translation?.trim()) throw new Error('服務未回傳譯文');
    providerTestResult.value = '收到譯文：' + translation;
  } catch (error) {
    providerTestResult.value = '試譯失敗：' + (error instanceof Error ? error.message : '請檢查金鑰、服務位址與網路。');
  } finally { testingProvider.value = false; }
}
async function save() {
  try {
    await SettingsStorage.set({
      ...settings.value,
      netflix: netflixConfig.value,
    });
    feedback.value = '設定已儲存'; feedbackError.value = false;
    return true;
  } catch (e) {
    reportError('設定未儲存，請重試。');
    return false;
  }
}

async function saveNetflix() {
  await save();
}

async function saveApiKey(key: string) {
  try {
    const trimmed = (key || '').trim();
    if (!trimmed) return;
    await messageRouter.sendMessage({ type: 'SET_API_KEY', provider: 'gemini', apiKey: trimmed });
    settings.value.hasGeminiApiKey = true;
    settings.value.geminiApiKeyMasked = SettingsStorage.maskApiKey(trimmed);
    geminiKeyInput.value = '';
    saveApiKeyStatus.value = 'success';
    setTimeout(() => {
      saveApiKeyStatus.value = 'idle';
    }, 2500);
    await loadSettings();
  } catch (e) {
    console.error('Failed to save Gemini key', e);
    saveApiKeyStatus.value = 'error';
  }
}

async function clearApiKey() {
  try {
    await messageRouter.sendMessage({ type: 'CLEAR_API_KEY', provider: 'gemini' });
    settings.value.hasGeminiApiKey = false;
    settings.value.geminiApiKeyMasked = '';
    await loadSettings();
  } catch (e) {
    console.error('Failed to clear Gemini key', e);
  }
}

async function saveDeeplKey(key: string) {
  try {
    const trimmed = (key || '').trim();
    if (!trimmed) return;
    await messageRouter.sendMessage({ type: 'SET_API_KEY', provider: 'deepl', apiKey: trimmed });
    settings.value.hasDeeplApiKey = true;
    settings.value.deeplApiKeyMasked = SettingsStorage.maskApiKey(trimmed);
    deeplKeyInput.value = '';
    saveDeeplKeyStatus.value = 'success';
    setTimeout(() => {
      saveDeeplKeyStatus.value = 'idle';
    }, 2500);
    await loadSettings();
  } catch (e) {
    console.error('Failed to save DeepL key', e);
    saveDeeplKeyStatus.value = 'error';
  }
}

async function clearDeeplKey() {
  try {
    await messageRouter.sendMessage({ type: 'CLEAR_API_KEY', provider: 'deepl' });
    settings.value.hasDeeplApiKey = false;
    settings.value.deeplApiKeyMasked = '';
    await loadSettings();
  } catch (e) {
    console.error('Failed to clear DeepL key', e);
  }
}

async function saveLocalHttpKey(key: string) {
  try {
    const trimmed = (key || '').trim();
    if (!trimmed) return;
    await messageRouter.sendMessage({ type: 'SET_API_KEY', provider: 'local-http', apiKey: trimmed });
    settings.value.hasLocalHttpApiKey = true;
    settings.value.localHttpApiKeyMasked = SettingsStorage.maskApiKey(trimmed);
    localHttpKeyInput.value = '';
    saveLocalHttpKeyStatus.value = 'success';
    setTimeout(() => {
      saveLocalHttpKeyStatus.value = 'idle';
    }, 2500);
    await loadSettings();
  } catch (e) {
    console.error('Failed to save Local HTTP key', e);
    saveLocalHttpKeyStatus.value = 'error';
  }
}

async function clearLocalHttpKey() {
  try {
    await messageRouter.sendMessage({ type: 'CLEAR_API_KEY', provider: 'local-http' });
    settings.value.hasLocalHttpApiKey = false;
    settings.value.localHttpApiKeyMasked = '';
    await loadSettings();
  } catch (e) {
    console.error('Failed to clear Local HTTP key', e);
  }
}

async function saveCustomHttpKey(key: string) {
  try {
    const trimmed = (key || '').trim();
    if (!trimmed) return;
    await messageRouter.sendMessage({ type: 'SET_API_KEY', provider: 'custom-http', apiKey: trimmed });
    settings.value.hasCustomHttpApiKey = true;
    settings.value.customHttpApiKeyMasked = SettingsStorage.maskApiKey(trimmed);
    customHttpKeyInput.value = '';
    saveCustomHttpKeyStatus.value = 'success';
    setTimeout(() => {
      saveCustomHttpKeyStatus.value = 'idle';
    }, 2500);
    await loadSettings();
  } catch (e) {
    console.error('Failed to save Custom HTTP key', e);
    saveCustomHttpKeyStatus.value = 'error';
  }
}

async function clearCustomHttpKey() {
  try {
    await messageRouter.sendMessage({ type: 'CLEAR_API_KEY', provider: 'custom-http' });
    settings.value.hasCustomHttpApiKey = false;
    settings.value.customHttpApiKeyMasked = '';
    await loadSettings();
  } catch (e) {
    console.error('Failed to clear Custom HTTP key', e);
  }
}

async function clearAiInstructions() {
  settings.value.aiTranslationInstructions = '';
  await save();
}

onMounted(async () => {
  await loadSettings();
  await loadVocabulary();
});
</script>

<style scoped>
/* ── Main Stitch Layout ─────────────────────────────────────────── */
.stitch-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
}

/* ── Top Header ─────────────────────────────────────────────────── */
.stitch-header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
}

.stitch-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.brand-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.brand-badge {
  font-size: 9.5px;
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  letter-spacing: 0.05em;
}

.header-center {
  flex: 1;
  max-width: 440px;
  margin: 0 20px;
}

.search-pill {
  display: flex;
  align-items: center;
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 5px 14px;
  gap: 8px;
  transition: border-color 0.15s ease;
}

.search-pill:focus-within {
  border-color: var(--border-light);
}

.search-icon {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.search-input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 13px;
  width: 100%;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-kbd {
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
  white-space: nowrap;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
}

.header-icon-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.header-icon-btn svg {
  width: 15px;
  height: 15px;
}

.theme-select-box {
  position: relative;
}

.stitch-theme-select {
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  outline: none;
}

.stitch-theme-select:hover {
  border-color: var(--border-light);
  color: var(--text-primary);
}

/* ── 3-Column Body ──────────────────────────────────────────────── */
.stitch-body {
  display: flex;
  flex: 1;
  min-height: calc(100vh - 64px);
}

/* ── 2A. Left Sidebar ───────────────────────────────────────────── */
.stitch-sidebar-left {
  width: 216px;
  background: var(--bg-primary);
  border-right: 1px solid var(--border-color);
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 28px;
  flex-shrink: 0;
  position: sticky;
  top: 64px;
  height: calc(100vh - 64px);
  overflow-y: auto;
}

.sidebar-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.sidebar-nav-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.sidebar-nav-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.sidebar-nav-btn.active {
  color: var(--text-primary);
  background: var(--bg-hover);
  font-weight: 600;
}

.sidebar-count-chip {
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  background: var(--border-color);
  color: var(--text-primary);
  padding: 1px 6px;
  border-radius: 999px;
}

.section-nav-header {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  margin-bottom: 8px;
  padding-left: 12px;
}

.section-nav-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sub-nav-link {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  padding: 8px 12px;
  border-radius: 6px;
  text-decoration: none;
  transition: all 0.15s ease;
}

.sub-nav-link:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

/* Stitch's iconic soft pink active pill */
.sub-nav-link.active-pill {
  background: var(--stitch-active-pill-bg);
  color: var(--on-primary);
  font-weight: 600;
  border-radius: 6px;
}

/* ── 2B. Center Main Canvas ─────────────────────────────────────── */
.stitch-main {
  flex: 1;
  padding: 52px clamp(24px, 4vw, 64px) 80px;
  min-width: 0;
  overflow-y: auto;
  background: var(--bg-primary);
}

.canvas-content-flow {
  max-width: 820px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.canvas-kicker {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-primary);
}

.canvas-title {
  font-size: clamp(26px, 2.8vw, 36px);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  line-height: 1.6;
  margin: 0;
}

.canvas-subtitle {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0 0 12px 0;
  line-height: 1.5;
  font-weight: 400;
}

/* Preview Canvas Card (Sleek container without fake OS dots) */
.preview-canvas-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  position: relative;
  box-shadow: var(--card-shadow);
}

.canvas-toolbar {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  background: rgba(12, 13, 16, 0.88);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-sm, 6px);
  padding: 4px 10px;
  gap: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 10;
}

.toolbar-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-secondary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  user-select: none;
}

.toolbar-chip.active {
  color: var(--text-primary);
  font-weight: 600;
}

.toolbar-sep {
  width: 1px;
  height: 14px;
  background: rgba(255, 255, 255, 0.14);
}

.preview-hint {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-ui, sans-serif);
}

.cinema-viewport {
  height: 220px;
  background: radial-gradient(circle at 50% 30%, #161822 0%, #0d0e14 60%, #08080b 100%);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  position: relative;
  padding-left: 24px;
  padding-right: 24px;
  transition: padding-bottom 0.2s ease;
}

.cinema-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.65) 100%);
  pointer-events: none;
}

.subtitles-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
  z-index: 2;
  transition: gap 0.2s ease;
  max-width: 90%;
}

.rendered-sub {
  font-weight: 600;
  line-height: 1.6;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9), 0 0 12px rgba(0, 0, 0, 0.7);
  transition: font-size 0.15s ease, color 0.15s ease;
}

/* ── Stitch Sections & Rows ─────────────────────────────────────── */
.stitch-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 12px;
}

.section-header-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-heading {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.section-lead {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.stitch-rows-container {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.stitch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  gap: 20px;
}

.stitch-row:last-child {
  border-bottom: none;
}

.stitch-row.vertical-row {
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-width: 60%;
}

.row-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.row-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}

.row-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 1;
}

.row-control.slider-control {
  gap: 14px;
  max-width: 280px;
}

.row-control.color-control {
  gap: 10px;
}

.row-control.color-control input[type='color'] {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 0;
  background: transparent;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.row-control.color-control input[type='color']::-webkit-color-swatch-wrapper {
  padding: 0;
}

.row-control.color-control input[type='color']::-webkit-color-swatch {
  border: none;
  border-radius: 3px;
}

.row-val-badge {
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 3px 8px;
  min-width: 48px;
  text-align: center;
}

.row-val-badge.monospace {
  min-width: 68px;
}

.input-group {
  display: flex;
  gap: 8px;
  max-width: 320px;
}

.stitch-select {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 12.5px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  outline: none;
  min-width: 180px;
}

.stitch-select:hover {
  border-color: var(--border-light);
}

.stitch-input {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 12.5px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  outline: none;
  width: 100%;
}

.stitch-input:focus {
  border-color: var(--border-light);
}

.textarea-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stitch-textarea {
  width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 12.5px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  outline: none;
  font-family: inherit;
  resize: vertical;
}

.stitch-textarea:focus {
  border-color: var(--border-light);
}

.textarea-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* Diagnostic Grid */
.diagnostic-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.diag-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.diag-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}

.diag-value {
  font-size: 13px;
  font-family: var(--font-mono, monospace);
  color: var(--text-primary);
}

.diag-value.highlight {
  color: var(--text-primary);
}

/* Hotkey Grid */
.hotkey-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.hotkey-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hk-keys {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hk-desc {
  font-size: 12px;
  color: var(--text-muted);
}

kbd {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  font-weight: 600;
}

/* Buttons */
.btn-stitch-accent {
  background: var(--primary-accent);
  color: var(--on-primary);
  font-size: 12px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
  white-space: nowrap;
}

.btn-stitch-accent:hover {
  background: var(--primary-hover);
}

.btn-stitch-secondary {
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn-stitch-secondary:hover {
  background: var(--border-color);
  border-color: var(--border-light);
}

/* ── 2C. Right Sidebar ("本頁內容") ─────────────────────────── */
.stitch-sidebar-right {
  width: 200px;
  background: var(--bg-primary);
  border-left: 1px solid var(--border-color);
  padding: 36px 20px;
  flex-shrink: 0;
  position: sticky;
  top: 64px;
  height: calc(100vh - 64px);
  overflow-y: auto;
}

.toc-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toc-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

.toc-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toc-anchor-link {
  font-size: 12.5px;
  color: var(--text-muted);
  text-decoration: none;
  padding: 4px 0;
  transition: color 0.15s ease;
  line-height: 1.6;
}

.toc-anchor-link:hover {
  color: var(--text-primary);
}

.toc-anchor-link.active {
  color: var(--text-primary);
  font-weight: 600;
}

/* Stitch Status Widget */
.stitch-status-widget {
  margin-top: 24px;
  padding: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.widget-head {
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  border-bottom: 1px dashed var(--border-color);
  padding-bottom: 6px;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.m-label {
  color: var(--text-muted);
}

.m-val {
  color: var(--text-primary);
  font-weight: 600;
  font-family: var(--font-mono, monospace);
}

.m-val.highlight {
  color: var(--text-primary);
}

.stitch-brand { border: 0; background: transparent; padding: 0; color: inherit; }
.header-center { position: relative; }
.search-input { min-width: 0; }
.search-results {
  position: absolute; inset: calc(100% + 8px) 0 auto;
  background: var(--bg-card); border: 1px solid var(--border-light);
  border-radius: var(--radius-md); padding: 6px; box-shadow: var(--card-shadow);
}
.search-results button {
  display: flex; justify-content: space-between; width: 100%;
  padding: 12px; border: 0; border-radius: var(--radius-sm);
  background: transparent; color: var(--text-primary); cursor: pointer; text-align: left;
}
.search-results button:hover { background: var(--bg-hover); }
.search-results p { padding: 12px; font-size: 13px; color: var(--text-secondary); }
.stitch-select, .stitch-theme-select {
  padding-right: 32px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='1.5'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E");
  background-position: right 10px center; background-repeat: no-repeat; background-size: 14px;
  max-width: 100%;
}
.stitch-section, .preview-canvas-card { scroll-margin-top: 88px; }
.canvas-kicker { color: var(--text-muted); margin-bottom: -12px; }
.canvas-title { text-wrap: balance; }
.row-info, .row-control { min-width: 0; }
.row-desc { max-width: 48ch; }
.metric-row { gap: 12px; align-items: flex-start; }
.m-label { flex-shrink: 0; }
.m-val { text-align: right; overflow-wrap: anywhere; font-family: var(--font-ui); }
.sidebar-nav-btn { padding: 10px 12px; }
.sidebar-nav-btn.active { background: var(--nav-active-bg); color: var(--nav-active-text); }
.sub-nav-link.active-pill { background: var(--bg-hover); color: var(--text-primary); }
@media (max-width: 1200px) {
  .stitch-sidebar-right { display: none; }
}
@media (max-width: 760px) {
  .stitch-header { height: auto; min-height: 64px; flex-wrap: wrap; gap: 12px; padding: 16px 20px; }
  .header-center { order: 3; flex-basis: 100%; max-width: none; margin: 0; }
  .search-kbd { display: none; }
  .stitch-body { flex-direction: column; }
  .stitch-sidebar-left { position: static; width: 100%; height: auto; padding: 12px 20px; border-right: 0; border-bottom: 1px solid var(--border-color); }
  .flat-nav { flex-direction: row; overflow-x: auto; gap: 6px; }
  .sidebar-nav-btn { width: auto; flex-shrink: 0; gap: 8px; white-space: nowrap; }
  .section-nav { display: none; }
  .stitch-main { padding: 32px 20px 56px; overflow: visible; }
  .canvas-content-flow { gap: 20px; }
  .stitch-row { flex-wrap: wrap; gap: 12px; padding: 18px; }
  .row-info { max-width: none; flex: 1 1 180px; }
  .row-control { flex: 1 1 180px; }
  .row-control.slider-control { max-width: none; }
  .stitch-select, .input-group { width: 100%; max-width: none; min-width: 0; }
  .diagnostic-grid { grid-template-columns: 1fr; }
  .canvas-toolbar { width: max-content; max-width: calc(100% - 24px); }
  .preview-hint, .toolbar-sep { display: none; }
  .cinema-viewport { height: 240px; }
}
@media (max-width: 400px) {
  .brand-name { font-size: 14px; }
  .header-right { gap: 6px; }
  .hotkey-grid { grid-template-columns: 1fr; }
}

.feedback { padding: 12px 16px; background: var(--bg-hover); border-radius: var(--radius-sm); font-size: 14px; }
.feedback.error { color: var(--danger-text); background: var(--danger-bg); }
.canvas-title { font-size: 28px; }
.canvas-subtitle { margin-bottom: 0; }
.row-title { font-size: 14px; }
.row-desc, .section-lead { font-size: 13px; color: var(--text-secondary); }
.stitch-main { padding-top: 32px; }
.stitch-sidebar-left { width: 200px; }
.btn-stitch-accent:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 760px) { .stitch-sidebar-left { width: 100%; } }
</style>

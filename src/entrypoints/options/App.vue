<template>
  <div class="stitch-layout" data-testid="options-page">
    <!-- ================================================================= -->
    <!-- 1. TOP HEADER (STITCH MINIMALIST NAVBAR)                          -->
    <!-- ================================================================= -->
    <header class="stitch-header">
      <div class="header-left">
        <div class="stitch-brand" @click="switchTab('subtitles')">
          <span class="brand-name">Open Web Translate</span>
        </div>
      </div>

      <div class="header-center">
        <div class="search-pill">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="text"
            v-model="globalSearchQuery"
            placeholder="Search..."
            class="search-input"
            @keydown.slash.prevent="focusSearch"
            ref="searchInputRef"
          />
          <kbd class="search-kbd">Ctrl K</kbd>
        </div>
      </div>

      <div class="header-right">
        <button class="header-icon-btn" @click="closeWindow" title="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div class="theme-select-box">
          <select v-model="theme" @change="onThemeChange" class="stitch-theme-select">
            <option value="system">Auto ▾</option>
            <option value="dark">Dark ▾</option>
            <option value="light">Light ▾</option>
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
            :class="['sidebar-nav-btn', { active: activeTab === 'subtitles' }]"
            @click="switchTab('subtitles')"
            data-testid="tab-subtitles"
          >
            <span>Subtitles</span>
          </button>
          <button
            :class="['sidebar-nav-btn', { active: activeTab === 'learning' }]"
            @click="switchTab('learning')"
            data-testid="tab-learning"
          >
            <span>Learning Studio</span>
            <span v-if="dueCardsCount > 0" class="sidebar-count-chip">{{ dueCardsCount }}</span>
          </button>
          <button
            :class="['sidebar-nav-btn', { active: activeTab === 'vocabulary' }]"
            @click="switchTab('vocabulary')"
            data-testid="tab-vocabulary"
          >
            <span>Vocabulary</span>
          </button>
          <button
            :class="['sidebar-nav-btn', { active: activeTab === 'models' }]"
            @click="switchTab('models')"
            data-testid="tab-providers"
          >
            <span>AI Providers</span>
          </button>
          <button
            :class="['sidebar-nav-btn', { active: activeTab === 'general' }]"
            @click="switchTab('general')"
            data-testid="tab-general"
          >
            <span>General Settings</span>
          </button>
        </div>

        <!-- Section Group with Stitch-style active pill -->
        <div class="sidebar-group section-nav">
          <div class="section-nav-header">
            <span>{{ currentSectionTitle }} ˅</span>
          </div>
          <div class="section-nav-items">
            <a
              v-for="(sub, idx) in currentSubNavItems"
              :key="sub.id"
              :href="'#' + sub.id"
              :class="['sub-nav-link', { 'active-pill': activeAnchor === sub.id || (idx === 0 && !activeAnchor) }]"
              @click.prevent="scrollToAnchor(sub.id)"
            >
              {{ sub.label }}
            </a>
          </div>
        </div>
      </aside>

      <!-- 2B. CENTER MAIN CANVAS -->
      <main class="stitch-main" ref="mainCanvasRef">
        <div class="canvas-content-flow">
          <!-- Kicker -->
          <div class="canvas-kicker">{{ currentKicker }}</div>

          <!-- Main Title -->
          <h1 class="canvas-title">{{ currentHeadline }}</h1>

          <!-- Subtitle -->
          <p class="canvas-subtitle">{{ currentSubtitle }}</p>

          <!-- ========================================================= -->
          <!-- TAB 1: SUBTITLES                                          -->
          <!-- ========================================================= -->
          <template v-if="activeTab === 'subtitles'">
            <!-- Live Subtitle Video Preview Canvas (NO MAC DOTS) -->
            <div id="sub-preview" class="preview-canvas-card">
              <!-- Floating Glass Toolbar like Stitch -->
              <div class="canvas-toolbar">
                <div class="toolbar-chip">
                  <span class="chip-icon">✨</span>
                  <span>Generate</span>
                  <span class="chip-caret">▾</span>
                </div>
                <div class="toolbar-chip">
                  <span class="chip-icon">✏️</span>
                  <span>Edit</span>
                  <span class="chip-caret">▾</span>
                </div>
                <div class="toolbar-chip active">
                  <span class="chip-icon">👁️</span>
                  <span>Preview</span>
                  <span class="chip-caret">▾</span>
                </div>
                <div class="toolbar-chip">
                  <span>⋯ More</span>
                </div>
                <div class="toolbar-sep"></div>
                <button class="toolbar-reaction" title="Helpful">👍</button>
                <button class="toolbar-reaction" title="Issues">👎</button>
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
                      fontSize: (settings.subtitleOriginalFontSize || 18) + 'px',
                      color: settings.subtitleOriginalColor || '#ffffff',
                    }"
                  >
                    The beginning of knowledge is the discovery of something we do not understand.
                  </div>
                  <div
                    class="rendered-sub secondary"
                    :style="{
                      fontSize: (settings.subtitleTranslatedFontSize || 22) + 'px',
                      color: settings.subtitleTranslatedColor || '#818cf8',
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
                <h2 class="section-heading">Netflix Dual Subtitles</h2>
                <p class="section-lead">配置 Netflix 雙語字幕對齊、字體排版、位置與逐句學習模式。</p>
              </div>

              <div class="stitch-rows-container">
                <!-- Toggle -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">啟用 Netflix 雙語字幕</span>
                    <span class="row-desc">在 Netflix 播放器中自動偵測並注入雙語字幕軌道。</span>
                  </div>
                  <div class="row-control">
                    <label class="toggle">
                      <input
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
                    <span class="row-title">主字幕大小 (Primary Size)</span>
                    <span class="row-desc">影片原生字幕字體大小 (12px – 48px)。</span>
                  </div>
                  <div class="row-control slider-control">
                    <input
                      type="range"
                      min="12"
                      max="48"
                      v-model.number="netflixConfig.primarySize"
                      @input="saveNetflix"
                    />
                    <span class="row-val-badge">{{ netflixConfig.primarySize }}px</span>
                  </div>
                </div>

                <!-- Secondary Subtitle Size -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">副字幕大小 (Secondary Size)</span>
                    <span class="row-desc">雙語翻譯字幕字體大小 (12px – 48px)。</span>
                  </div>
                  <div class="row-control slider-control">
                    <input
                      type="range"
                      min="12"
                      max="48"
                      v-model.number="netflixConfig.secondarySize"
                      @input="saveNetflix"
                    />
                    <span class="row-val-badge">{{ netflixConfig.secondarySize }}px</span>
                  </div>
                </div>

                <!-- Bottom Position -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">字幕垂直位置 (Bottom Position)</span>
                    <span class="row-desc">字幕距離畫面底部的邊距高度 (20px – 300px)。</span>
                  </div>
                  <div class="row-control slider-control">
                    <input
                      type="range"
                      min="20"
                      max="300"
                      v-model.number="netflixConfig.bottomPosition"
                      @input="saveNetflix"
                    />
                    <span class="row-val-badge">{{ netflixConfig.bottomPosition }}px</span>
                  </div>
                </div>

                <!-- Line Spacing -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">字幕行間距 (Line Spacing)</span>
                    <span class="row-desc">主字幕與副字幕之間的垂直間隙 (0px – 40px)。</span>
                  </div>
                  <div class="row-control slider-control">
                    <input
                      type="range"
                      min="0"
                      max="40"
                      v-model.number="netflixConfig.lineSpacing"
                      @input="saveNetflix"
                    />
                    <span class="row-val-badge">{{ netflixConfig.lineSpacing }}px</span>
                  </div>
                </div>

                <!-- Bitmap Rescue -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">圖片字幕自動救援 (Bitmap Rescue)</span>
                    <span class="row-desc">若 Netflix 使用圖片格式字幕，自動啟用救援機制。</span>
                  </div>
                  <div class="row-control">
                    <label class="toggle">
                      <input
                        type="checkbox"
                        v-model="netflixConfig.enableBitmapRescue"
                        @change="saveNetflix"
                      />
                      <span class="slider"></span>
                    </label>
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
                      <input
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

            <!-- YouTube Typography Section -->
            <section id="sub-youtube" class="stitch-section">
              <div class="section-header-block">
                <h2 class="section-heading">YouTube & Global Subtitle Typography</h2>
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
                    <input
                      type="range"
                      min="12"
                      max="32"
                      v-model.number="settings.subtitleOriginalFontSize"
                      @input="save"
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
                    <input
                      type="range"
                      min="14"
                      max="40"
                      v-model.number="settings.subtitleTranslatedFontSize"
                      @input="save"
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
                    <input
                      type="color"
                      v-model="settings.subtitleOriginalColor"
                      @input="save"
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
                    <input
                      type="color"
                      v-model="settings.subtitleTranslatedColor"
                      @input="save"
                    />
                    <span class="row-val-badge monospace">{{ settings.subtitleTranslatedColor }}</span>
                  </div>
                </div>
              </div>
            </section>

            <!-- Diagnostic HUD Section -->
            <section id="sub-diagnostics" class="stitch-section">
              <div class="section-header-block">
                <h2 class="section-heading">Diagnostic HUD & Modes</h2>
                <p class="section-lead">串流媒體字幕即時驗收診斷與音訊軌道監控。</p>
              </div>

              <div class="diagnostic-grid">
                <div class="diag-card">
                  <span class="diag-label">主軌 (Primary)</span>
                  <span class="diag-value">未載入 (No Track)</span>
                </div>
                <div class="diag-card">
                  <span class="diag-label">副軌 (Secondary)</span>
                  <span class="diag-value">未載入 (No Track)</span>
                </div>
                <div class="diag-card">
                  <span class="diag-label">運作模式 (Mode)</span>
                  <span class="diag-value highlight">原生播放器模式 (Native Only)</span>
                </div>
              </div>
            </section>

            <!-- Hotkeys Guide Section -->
            <section id="sub-hotkeys" class="stitch-section">
              <div class="section-header-block">
                <h2 class="section-heading">Controls & Hotkeys</h2>
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
                :cards="learningCards"
                :t="t"
                @review="recordSrsReview"
                @close="switchTab('vocabulary')"
              />
            </div>

            <section id="learn-anki" class="stitch-section">
              <div class="section-header-block">
                <h2 class="section-heading">Export to Anki</h2>
                <p class="section-lead">將已儲存生詞與克漏字卡片匯出為 Anki 牌組 (.txt)。</p>
              </div>
              <button @click="onExportAnki" class="btn-stitch-accent">
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
                :items="vocabItems"
                :t="t"
                @addTerm="addVocabItem"
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
                <h2 class="section-heading">Translation Engine</h2>
                <p class="section-lead">選擇預設翻譯提供商與進階模型配置。</p>
              </div>

              <div class="stitch-rows-container">
                <!-- Provider Select -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">預設翻譯引擎 (Provider)</span>
                    <span class="row-desc">選擇翻譯服務提供商。</span>
                  </div>
                  <div class="row-control">
                    <select v-model="settings.activeProviderId" @change="save" class="stitch-select">
                      <option value="google-provider">Google Translate (Free)</option>
                      <option value="gemini-provider">Google Gemini API</option>
                      <option value="deepl-provider">DeepL Translate API</option>
                      <option value="ollama-provider">Local Ollama AI</option>
                      <option value="local-http-provider">Local Custom HTTP AI</option>
                      <option value="chrome-ai-provider">Chrome Built-in AI (Prompt API)</option>
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
                    <select v-model="settings.geminiModel" @change="save" class="stitch-select">
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
                    <input
                      type="password"
                      v-model="geminiKeyInput"
                      placeholder="Enter Gemini API Key..."
                      class="stitch-input"
                    />
                    <button class="btn-stitch-accent" @click="saveApiKey(geminiKeyInput)">儲存</button>
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
                    <input
                      type="password"
                      v-model="deeplKeyInput"
                      placeholder="Enter DeepL API Key..."
                      class="stitch-input"
                    />
                    <button class="btn-stitch-accent" @click="saveDeeplKey(deeplKeyInput)">儲存</button>
                    <button class="btn-stitch-secondary" @click="clearDeeplKey" v-if="settings.hasDeeplApiKey">清除</button>
                  </div>
                </div>

                <!-- AI Translation Instructions -->
                <div class="stitch-row vertical-row">
                  <div class="row-info">
                    <span class="row-title">AI 翻譯指示 (System Prompt Guidance)</span>
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
              <div class="section-header-block">
                <h2 class="section-heading">General Preferences</h2>
                <p class="section-lead">網頁翻譯、語言配對與沉浸式閱讀設定。</p>
              </div>

              <div class="stitch-rows-container">
                <!-- Enable Translation -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">啟用網頁翻譯功能</span>
                    <span class="row-desc">開啟或關閉全網頁的雙語翻譯服務。</span>
                  </div>
                  <div class="row-control">
                    <label class="toggle">
                      <input
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
                    <span class="row-title">來源語言 (Source Language)</span>
                    <span class="row-desc">網頁與影片字幕共用的原始語言。</span>
                  </div>
                  <div class="row-control">
                    <select v-model="settings.sourceLanguage" @change="save" class="stitch-select">
                      <option value="auto">自動偵測 (Auto Detect)</option>
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
                    <span class="row-title">目標翻譯語言 (Target Language)</span>
                    <span class="row-desc">網頁與影片字幕共用的翻譯目標語言。</span>
                  </div>
                  <div class="row-control">
                    <select v-model="settings.targetLanguage" @change="save" class="stitch-select">
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
                    <span class="row-title">雙語對照佈局模式 (Display Mode)</span>
                    <span class="row-desc">雙語對照 = 左右/上下對齊，譯文優先 = 淡化原文，沉浸模式 = 點擊切換。</span>
                  </div>
                  <div class="row-control">
                    <select v-model="settings.displayMode" @change="save" class="stitch-select">
                      <option value="bilingual">雙語對照 (Bilingual)</option>
                      <option value="translation-first">譯文優先 (Translation First)</option>
                      <option value="immersive">沉浸模式 (Immersive)</option>
                    </select>
                  </div>
                </div>

                <!-- Floating Button -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">顯示懸浮翻譯按鈕 (Floating Button)</span>
                    <span class="row-desc">在網頁右下角顯示快速劃詞與翻譯按鈕。</span>
                  </div>
                  <div class="row-control">
                    <label class="toggle">
                      <input
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

      <!-- 2C. RIGHT SIDEBAR ("On this page") -->
      <aside class="stitch-sidebar-right">
        <div class="toc-wrapper">
          <div class="toc-title">On this page</div>
          <nav class="toc-links">
            <a
              v-for="anchor in currentAnchors"
              :key="anchor.id"
              :href="'#' + anchor.id"
              :class="['toc-anchor-link', { active: activeAnchor === anchor.id }]"
              @click.prevent="scrollToAnchor(anchor.id)"
            >
              {{ anchor.label }}
            </a>
          </nav>

          <!-- Stitch-style Status Widget -->
          <div class="stitch-status-widget">
            <div class="widget-head">SYSTEM METRICS</div>
            <div class="metric-row">
              <span class="m-label">AI Engine</span>
              <span class="m-val">{{ activeEngineLabel }}</span>
            </div>
            <div class="metric-row">
              <span class="m-label">Latency</span>
              <span class="m-val highlight">418ms</span>
            </div>
            <div class="metric-row">
              <span class="m-label">SM-2 Retention</span>
              <span class="m-val">96.4%</span>
            </div>
            <div class="metric-row">
              <span class="m-label">Today's Due</span>
              <span class="m-val">{{ dueCardsCount }} cards</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { VocabularyExporter } from '@/infrastructure/storage/repositories/vocabulary-exporter';
import {
  getActiveVerifiedModels,
  getDeprecatedButFunctionalModels,
  DEFAULT_MODEL_ID,
} from '@/infrastructure/providers/gemini/model-registry';
import type { LearningCard, SrsGrade } from '@/core/domain/learning-types';
import { SrsEngine } from '@/core/learning/srs-engine';
import { type ThemeMode } from '@/components/ThemeToggle.vue';
import GlossaryManager from '@/components/GlossaryManager.vue';
import FlashcardWorkbench from '@/components/learning/FlashcardWorkbench.vue';

const activeModels = getActiveVerifiedModels();
const deprecatedModels = getDeprecatedButFunctionalModels();

const activeTab = ref('subtitles');
const activeAnchor = ref('');
const theme = ref<ThemeMode>('system');
const globalSearchQuery = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);
const mainCanvasRef = ref<HTMLElement | null>(null);

const geminiKeyInput = ref('');
const deeplKeyInput = ref('');

const settings = ref({
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
  subtitleTranslatedColor: '#818cf8',
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

const vocabItems = ref<any[]>([]);

// Sample flashcards for learning stage
const sampleCards: LearningCard[] = [
  {
    id: 'sample-1',
    word: '儚い',
    lemma: '儚い',
    pos: 'い形容詞 (i-adj)',
    phonetic: 'はかない · hakanai',
    meaning: '短暫無常的、虛幻的、飄渺的 (fleeting, ephemeral)',
    contextSentence: '桜の花のように儚い命だからこそ、今この瞬間が美しいのだ。',
    contextTranslation: '正因為生命如同櫻花般短暫無常，此時此刻才顯得無比美麗。',
    sourceLang: 'ja',
    targetLang: 'zh-Hant',
    tags: ['JLPT N1', '形容詞'],
    srs: { interval: 3, repetition: 2, easeFactor: 2.5, nextReviewDate: Date.now() - 1000 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'sample-2',
    word: '切り開く',
    lemma: '切り開く',
    pos: '五段動詞 (v5k)',
    phonetic: 'きりひらく · kirihiraku',
    meaning: '開闢、開創新局、突破困境',
    contextSentence: '運命なんて信じない。自分で道を切り開くんだ。',
    contextTranslation: '我不相信命運。我會靠自己開創道路。',
    sourceLang: 'ja',
    targetLang: 'zh-Hant',
    tags: ['JLPT N2', '動詞'],
    srs: { interval: 7, repetition: 4, easeFactor: 2.5, nextReviewDate: Date.now() - 1000 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'sample-3',
    word: 'Serendipity',
    lemma: 'serendipity',
    pos: '名詞 (n. [U])',
    phonetic: '/ˌser.ənˈdɪp.ə.ti/',
    meaning: '意外發現美好事物或珍貴事物的機緣與運氣',
    contextSentence: 'Finding this book in an old bookstore was pure serendipity.',
    contextTranslation: '在舊書店邂逅這本書，完全是一場純粹的美好機緣。',
    sourceLang: 'en',
    targetLang: 'zh-Hant',
    tags: ['CEFR C1', '名詞'],
    srs: { interval: 1, repetition: 1, easeFactor: 2.5, nextReviewDate: Date.now() - 1000 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const learningCards = computed<LearningCard[]>(() => {
  if (vocabItems.value.length === 0) return sampleCards;
  return vocabItems.value.map((v) => ({
    id: v.id || v.word,
    word: v.word || v.source || '',
    lemma: v.lemma || v.word || v.source || '',
    pos: v.pos || '單詞',
    phonetic: v.phonetic || '',
    meaning: v.meaning || v.translation || v.target || '',
    contextSentence: v.contextSentence || v.context || '',
    contextTranslation: v.contextTranslation || '',
    sourceLang: v.sourceLang || 'en',
    targetLang: v.targetLang || 'zh-Hant',
    tags: v.tags || ['生詞庫'],
    srs: v.srs || SrsEngine.createInitialState(),
    createdAt: v.timestamp || Date.now(),
    updatedAt: v.timestamp || Date.now(),
  }));
});

const dueCardsCount = computed(() => {
  const now = Date.now();
  return learningCards.value.filter((c) => (c.srs?.nextReviewDate || 0) <= now).length;
});

const activeEngineLabel = computed(() => {
  const id = settings.value.activeProviderId;
  if (id === 'gemini-provider') return 'Gemini 2.5 Flash';
  if (id === 'google-provider') return 'Google Translate (Free)';
  if (id === 'deepl-provider') return 'DeepL API';
  if (id === 'ollama-provider') return 'Ollama Local';
  return 'Gemini 2.5 Flash';
});

// Stitch-specific computed headings
const currentKicker = computed(() => {
  switch (activeTab.value) {
    case 'subtitles': return 'ESSENTIALS';
    case 'learning': return 'SRS STUDIO';
    case 'vocabulary': return 'LEXICAL ARCHIVE';
    case 'models': return 'AI ENGINE';
    case 'general': return 'PREFERENCES';
    default: return 'ESSENTIALS';
  }
});

const currentHeadline = computed(() => {
  switch (activeTab.value) {
    case 'subtitles': return 'Everything you need to know about Subtitles & Streaming';
    case 'learning': return 'Everything you need to know about SRS Flashcards';
    case 'vocabulary': return 'Everything you need to know about your Vocabulary Archive';
    case 'models': return 'Everything you need to know about AI Translation Engines';
    case 'general': return 'Everything you need to know about Preferences';
    default: return 'Everything you need to know about Open Web Translate';
  }
});

const currentSubtitle = computed(() => {
  switch (activeTab.value) {
    case 'subtitles': return 'A subtly opinionated walkthrough for dual streaming subtitles, typography, and learning mode.';
    case 'learning': return 'A subtly opinionated walkthrough for SuperMemo SM-2 spaced repetition and retention.';
    case 'vocabulary': return 'A subtly opinionated walkthrough for collected vocabulary, context sentences, and Anki exports.';
    case 'models': return 'A subtly opinionated walkthrough for high-speed AI translation engines and prompt guidance.';
    case 'general': return 'A subtly opinionated walkthrough for interface and browsing options.';
    default: return 'A subtly opinionated walkthrough for Open Web Translate.';
  }
});

const currentSectionTitle = computed(() => {
  switch (activeTab.value) {
    case 'subtitles': return 'SUBTITLES';
    case 'learning': return 'SRS WORKBENCH';
    case 'vocabulary': return 'VOCABULARY';
    case 'models': return 'AI ENGINES';
    case 'general': return 'GENERAL';
    default: return 'NAVIGATION';
  }
});

const currentSubNavItems = computed(() => {
  switch (activeTab.value) {
    case 'subtitles':
      return [
        { id: 'sub-preview', label: 'Everything you need to know' },
        { id: 'sub-netflix', label: 'Netflix Dual Subtitles' },
        { id: 'sub-youtube', label: 'YouTube Typography' },
        { id: 'sub-diagnostics', label: 'Diagnostic HUD & Modes' },
        { id: 'sub-hotkeys', label: 'Controls & Hotkeys' },
      ];
    case 'learning':
      return [
        { id: 'learn-stage', label: 'Everything you need to know' },
        { id: 'learn-anki', label: 'Export to Anki' },
      ];
    case 'vocabulary':
      return [
        { id: 'vocab-stage', label: 'Everything you need to know' },
      ];
    case 'models':
      return [
        { id: 'models-provider', label: 'Everything you need to know' },
      ];
    case 'general':
      return [
        { id: 'gen-settings', label: 'Everything you need to know' },
      ];
    default:
      return [{ id: 'sub-preview', label: 'Everything you need to know' }];
  }
});

const currentAnchors = computed(() => {
  return currentSubNavItems.value.map((item, idx) => ({
    id: item.id,
    label: idx === 0 ? 'Overview' : item.label,
  }));
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
    mainCanvasRef.value.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function scrollToAnchor(id: string) {
  activeAnchor.value = id;
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function focusSearch() {
  if (searchInputRef.value) {
    searchInputRef.value.focus();
  }
}

function closeWindow() {
  if (typeof window !== 'undefined') {
    window.close();
  }
}

function onThemeChange(e: Event) {
  const select = e.target as HTMLSelectElement;
  const mode = select.value as ThemeMode;
  theme.value = mode;
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-theme', mode);
  }
}

async function loadVocabulary() {
  try {
    const gChrome = typeof window !== 'undefined' ? (window as any).chrome : undefined;
    if (!gChrome?.runtime?.sendMessage) return;
    vocabItems.value = (await messageRouter.sendMessage({ type: 'GET_VOCAB_ITEMS' as any } as any) as any) || [];
  } catch (e) {
    console.error('Failed to load vocabulary items', e);
  }
}

async function addVocabItem(term: any) {
  try {
    await messageRouter.sendMessage({
      type: 'SAVE_VOCAB_ITEM' as any,
      word: term.word || term.source || '',
      translation: term.translation || term.target || '',
      context: term.context || 'Custom term entry',
    } as any);
    await loadVocabulary();
  } catch (e) {
    console.error('Failed to save vocabulary item', e);
  }
}

async function deleteVocabItem(id: string) {
  try {
    await messageRouter.sendMessage({ type: 'DELETE_VOCAB_ITEM' as any, id } as any);
    await loadVocabulary();
  } catch (e) {
    console.error('Failed to delete vocabulary item', e);
  }
}

async function clearVocabulary() {
  if (confirm('Are you sure you want to clear all vocabulary items?')) {
    try {
      await messageRouter.sendMessage({ type: 'CLEAR_VOCAB_ITEMS' as any } as any);
      await loadVocabulary();
    } catch (e) {
      console.error('Failed to clear vocabulary items', e);
    }
  }
}

function exportVocabulary() {
  VocabularyExporter.downloadCSV(vocabItems.value);
}

function onExportAnki() {
  const lines = learningCards.value.map((c) => {
    const cloze = c.contextSentence ? c.contextSentence.replace(c.word, `{{c1::${c.word}}}`) : c.word;
    return `${c.word}\t${c.phonetic || ''}\t${c.meaning}\t${cloze}`;
  });
  const content = "# Anki Deck Generated by Open Web Translate\n" + lines.join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = "open-web-translate-anki.txt";
  a.click();
  URL.revokeObjectURL(url);
}

async function recordSrsReview(id: string, grade: SrsGrade) {
  try {
    await messageRouter.sendMessage({ type: 'RECORD_SRS_REVIEW', id, grade });
    await loadVocabulary();
  } catch (e) {
    console.error('Failed to record SRS review', e);
  }
}

async function loadSettings() {
  try {
    const gChrome = typeof window !== 'undefined' ? (window as any).chrome : undefined;
    if (!gChrome?.storage) return;
    const s = await SettingsStorage.get();
    if (s) {
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
      settings.value.subtitleTranslatedColor = s.subtitleTranslatedColor || '#818cf8';

      if (s.netflix) {
        netflixConfig.value.enabled = s.netflix.enabled ?? true;
        netflixConfig.value.primarySize = s.netflix.primarySize || 18;
        netflixConfig.value.secondarySize = s.netflix.secondarySize || 22;
        netflixConfig.value.bottomPosition = s.netflix.bottomPosition || 80;
        netflixConfig.value.lineSpacing = s.netflix.lineSpacing || 4;
        netflixConfig.value.enableBitmapRescue = s.netflix.enableBitmapRescue ?? true;
        netflixConfig.value.learningMode = s.netflix.learningMode ?? true;
      }
    }
  } catch (e) {
    console.error('Failed to load settings', e);
  }
}

async function save() {
  try {
    await SettingsStorage.set({
      ...settings.value,
      netflix: netflixConfig.value,
    });
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}

async function saveNetflix() {
  await save();
}

async function saveApiKey(key: string) {
  try {
    await messageRouter.sendMessage({ type: 'SET_API_KEY' as any, provider: 'gemini', apiKey: key } as any);
    await loadSettings();
    geminiKeyInput.value = '';
  } catch (e) {
    console.error('Failed to save Gemini key', e);
  }
}

async function clearApiKey() {
  try {
    await messageRouter.sendMessage({ type: 'CLEAR_API_KEY' as any, provider: 'gemini' } as any);
    await loadSettings();
  } catch (e) {
    console.error('Failed to clear Gemini key', e);
  }
}

async function saveDeeplKey(key: string) {
  try {
    await messageRouter.sendMessage({ type: 'SET_API_KEY' as any, provider: 'deepl', apiKey: key } as any);
    await loadSettings();
    deeplKeyInput.value = '';
  } catch (e) {
    console.error('Failed to save DeepL key', e);
  }
}

async function clearDeeplKey() {
  try {
    await messageRouter.sendMessage({ type: 'CLEAR_API_KEY' as any, provider: 'deepl' } as any);
    await loadSettings();
  } catch (e) {
    console.error('Failed to clear DeepL key', e);
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
  background-color: #0d0d0f;
  color: #e2e2e5;
  font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
}

/* ── Top Header ─────────────────────────────────────────────────── */
.stitch-header {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid #1f1f23;
  background: #0d0d0f;
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
  color: #ffffff;
}

.brand-badge {
  font-size: 9.5px;
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid #333338;
  color: #94949e;
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
  background: #161619;
  border: 1px solid #232328;
  border-radius: 999px;
  padding: 5px 14px;
  gap: 8px;
  transition: border-color 0.15s ease;
}

.search-pill:focus-within {
  border-color: #3b3b44;
}

.search-icon {
  width: 14px;
  height: 14px;
  color: #71717a;
  flex-shrink: 0;
}

.search-input {
  background: transparent;
  border: none;
  outline: none;
  color: #e2e2e5;
  font-size: 13px;
  width: 100%;
}

.search-input::placeholder {
  color: #71717a;
}

.search-kbd {
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  color: #808086;
  background: #202025;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid #2d2d35;
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
  color: #808086;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.header-icon-btn:hover {
  color: #ffffff;
  background: #1c1c20;
}

.header-icon-btn svg {
  width: 15px;
  height: 15px;
}

.theme-select-box {
  position: relative;
}

.stitch-theme-select {
  background: #161619;
  border: 1px solid #232328;
  color: #a1a1aa;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
}

.stitch-theme-select:hover {
  border-color: #3b3b44;
  color: #ffffff;
}

/* ── 3-Column Body ──────────────────────────────────────────────── */
.stitch-body {
  display: flex;
  flex: 1;
  min-height: calc(100vh - 52px);
}

/* ── 2A. Left Sidebar ───────────────────────────────────────────── */
.stitch-sidebar-left {
  width: 240px;
  background: #0d0d0f;
  border-right: 1px solid #1f1f23;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 28px;
  flex-shrink: 0;
  position: sticky;
  top: 52px;
  height: calc(100vh - 52px);
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
  color: #9ca3af;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.sidebar-nav-btn:hover {
  color: #e2e2e5;
  background: #18181c;
}

.sidebar-nav-btn.active {
  color: #ffffff;
  background: #202025;
  font-weight: 600;
}

.sidebar-count-chip {
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  background: #2a2a32;
  color: #e2e2e5;
  padding: 1px 6px;
  border-radius: 999px;
}

.section-nav-header {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #6b7280;
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
  color: #9ca3af;
  padding: 6px 12px;
  border-radius: 6px;
  text-decoration: none;
  transition: all 0.15s ease;
}

.sub-nav-link:hover {
  color: #e2e2e5;
  background: #18181c;
}

/* Stitch's iconic soft pink active pill */
.sub-nav-link.active-pill {
  background: #fce7f3;
  color: #18181b;
  font-weight: 600;
  border-radius: 6px;
}

/* ── 2B. Center Main Canvas ─────────────────────────────────────── */
.stitch-main {
  flex: 1;
  padding: 44px 56px;
  overflow-y: auto;
  background: #0d0d0f;
}

.canvas-content-flow {
  max-width: 820px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.canvas-kicker {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: #f472b6;
}

.canvas-title {
  font-size: 38px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin: 0;
}

.canvas-subtitle {
  font-size: 17px;
  color: #9ca3af;
  margin: 0 0 12px 0;
  line-height: 1.5;
  font-weight: 400;
}

/* Preview Canvas Card (Sleek container without fake OS dots) */
.preview-canvas-card {
  background: #121215;
  border: 1px solid #1f1f23;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  box-shadow: 0 16px 36px -10px rgba(0, 0, 0, 0.6);
}

.canvas-toolbar {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  background: rgba(20, 20, 24, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 4px 8px;
  gap: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 10;
}

.toolbar-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 500;
  color: #d1d5db;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}

.toolbar-chip:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.toolbar-chip.active {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
  font-weight: 600;
}

.chip-icon {
  font-size: 12px;
}

.chip-caret {
  font-size: 10px;
  color: #9ca3af;
}

.toolbar-sep {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0 4px;
}

.toolbar-reaction {
  background: transparent;
  border: none;
  font-size: 12px;
  padding: 3px 6px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s ease;
}

.toolbar-reaction:hover {
  background: rgba(255, 255, 255, 0.1);
}

.cinema-viewport {
  height: 320px;
  background: radial-gradient(circle at 50% 40%, #1e3a5f 0%, #0c1a2c 50%, #060911 100%);
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
  line-height: 1.4;
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
  color: #ffffff;
  margin: 0;
}

.section-lead {
  font-size: 13px;
  color: #808086;
  margin: 0;
}

.stitch-rows-container {
  background: #141416;
  border: 1px solid #1f1f23;
  border-radius: 8px;
  overflow: hidden;
}

.stitch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #1f1f23;
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
  color: #e2e2e5;
}

.row-desc {
  font-size: 12px;
  color: #808086;
  line-height: 1.4;
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
  border: 1px solid #282830;
  border-radius: 4px;
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
  color: #e2e2e5;
  background: #0d0d0f;
  border: 1px solid #232328;
  border-radius: 4px;
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
  background: #0d0d0f;
  border: 1px solid #232328;
  color: #e2e2e5;
  font-size: 12.5px;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
  min-width: 180px;
}

.stitch-select:hover {
  border-color: #3b3b44;
}

.stitch-input {
  background: #0d0d0f;
  border: 1px solid #232328;
  color: #e2e2e5;
  font-size: 12.5px;
  padding: 6px 12px;
  border-radius: 4px;
  outline: none;
  width: 100%;
}

.stitch-input:focus {
  border-color: #3b3b44;
}

.textarea-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stitch-textarea {
  width: 100%;
  background: #0d0d0f;
  border: 1px solid #232328;
  color: #e2e2e5;
  font-size: 12.5px;
  padding: 10px 12px;
  border-radius: 4px;
  outline: none;
  font-family: inherit;
  resize: vertical;
}

.stitch-textarea:focus {
  border-color: #3b3b44;
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
  background: #141416;
  border: 1px solid #1f1f23;
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.diag-label {
  font-size: 11px;
  font-weight: 600;
  color: #808086;
}

.diag-value {
  font-size: 13px;
  font-family: var(--font-mono, monospace);
  color: #e2e2e5;
}

.diag-value.highlight {
  color: #f472b6;
}

/* Hotkey Grid */
.hotkey-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.hotkey-card {
  background: #141416;
  border: 1px solid #1f1f23;
  border-radius: 8px;
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
  color: #808086;
}

kbd {
  background: #0d0d0f;
  border: 1px solid #232328;
  color: #e2e2e5;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  font-weight: 600;
}

/* Buttons */
.btn-stitch-accent {
  background: #e2e2e5;
  color: #101012;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
  white-space: nowrap;
}

.btn-stitch-accent:hover {
  background: #ffffff;
}

.btn-stitch-secondary {
  background: #1c1c20;
  color: #e2e2e5;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 4px;
  border: 1px solid #27272b;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn-stitch-secondary:hover {
  background: #25252a;
  border-color: #35353d;
}

/* ── 2C. Right Sidebar ("On this page") ─────────────────────────── */
.stitch-sidebar-right {
  width: 230px;
  background: #0d0d0f;
  border-left: 1px solid #1f1f23;
  padding: 36px 20px;
  flex-shrink: 0;
  position: sticky;
  top: 52px;
  height: calc(100vh - 52px);
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
  color: #ffffff;
  letter-spacing: 0.02em;
}

.toc-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toc-anchor-link {
  font-size: 12.5px;
  color: #808086;
  text-decoration: none;
  padding: 4px 0;
  transition: color 0.15s ease;
  line-height: 1.4;
}

.toc-anchor-link:hover {
  color: #e2e2e5;
}

.toc-anchor-link.active {
  color: #ffffff;
  font-weight: 600;
}

/* Stitch Status Widget */
.stitch-status-widget {
  margin-top: 24px;
  padding: 14px;
  background: #141416;
  border: 1px solid #1f1f23;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.widget-head {
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  color: #6b7280;
  letter-spacing: 0.08em;
  border-bottom: 1px dashed #232328;
  padding-bottom: 6px;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.m-label {
  color: #808086;
}

.m-val {
  color: #e2e2e5;
  font-weight: 600;
  font-family: var(--font-mono, monospace);
}

.m-val.highlight {
  color: #ffffff;
}
</style>

<template>
  <div class="stitch-layout" data-testid="options-page">
    <div
      v-if="settings.remoteProviderDisclosureVersion === 0"
      class="privacy-onboarding-backdrop"
      role="presentation"
    >
      <section
        class="privacy-onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-onboarding-title"
        aria-describedby="privacy-onboarding-description"
      >
        <p class="privacy-onboarding-kicker">{{ tr('options.firstRun') }}</p>
        <h1 id="privacy-onboarding-title">{{ tr('options.onboardingTitle') }}</h1>
        <p id="privacy-onboarding-description">
          {{ tr('options.onboardingDesc') }}
        </p>

        <div class="privacy-provider-grid">
          <article>
            <strong>{{ tr('options.localProcessing') }}</strong>
            <span>{{ tr('options.localProcessingDesc') }}</span>
          </article>
          <article>
            <strong>{{ tr('options.remoteServices') }}</strong>
            <span>{{ tr('options.remoteServicesDesc') }}</span>
          </article>
        </div>

        <p class="privacy-onboarding-note">
          {{ tr('options.privacyNote') }}
        </p>

        <div class="privacy-onboarding-actions">
          <a
            href="https://github.com/RainWu0123/Open-Web-Translate/blob/master/PRIVACY.md"
            target="_blank"
            rel="noreferrer"
            class="btn-stitch-secondary"
          >{{ tr('options.viewPrivacy') }}</a>
          <button class="btn-stitch-accent" type="button" @click="acknowledgeRemoteDataNotice">
            {{ tr('options.acceptPrivacy') }}
          </button>
        </div>
      </section>
    </div>

    <!-- ================================================================= -->
    <!-- 1. TOP HEADER (STITCH MINIMALIST NAVBAR)                          -->
    <!-- ================================================================= -->
    <header class="stitch-header">
      <div class="header-left">
        <button type="button" class="stitch-brand" @click="switchTab('subtitles')">
          <BrandMark width="20" height="20" />
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
            :placeholder="tr('options.searchPlaceholder')" :aria-label="tr('options.searchLabel')"
            class="search-input"
            @keydown.enter.prevent="openFirstSearchResult" @keydown.esc="globalSearchQuery = ''"
            ref="searchInputRef"
          />
          <kbd class="search-kbd">Ctrl K</kbd>
        </div>
        <div v-if="globalSearchQuery.trim()" class="search-results" :aria-label="tr('options.searchResults')">
          <button v-for="item in searchResults" :key="item.tab" type="button" @click="selectSearchResult(item.tab)">
            <span>{{ item.label }}</span><span aria-hidden="true">↗</span>
          </button>
          <p v-if="!searchResults.length" role="status">{{ tr('options.noSearchResults') }}</p>
        </div>
      </div>

      <div class="header-right">

        <ThemeButton :language="settings.uiLanguage" :dark="resolvedTheme === 'dark'" @toggle="toggleTheme" />
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
            <span>{{ tr('nav.reading') }}</span>
          </button>
          <button
            :class="['sidebar-nav-btn', { active: activeTab === 'subtitles' }]"
            @click="switchTab('subtitles')"
            data-testid="tab-subtitles"
          >
            <span>{{ tr('nav.subtitles') }}</span>
          </button>
          <button
            :class="['sidebar-nav-btn', { active: activeTab === 'learning' }]"
            @click="switchTab('learning')"
            data-testid="tab-learning"
          >
            <span>{{ tr('nav.review') }}</span>
            <span v-if="vocabItems.length && dueCardsCount > 0" class="sidebar-count-chip">{{ dueCardsCount }}</span>
          </button>
          <button
            :class="['sidebar-nav-btn', { active: activeTab === 'vocabulary' }]"
            @click="switchTab('vocabulary')"
            data-testid="tab-vocabulary"
          >
            <span>{{ tr('nav.vocabulary') }}</span>
          </button>
          <button
            :class="['sidebar-nav-btn', { active: activeTab === 'models' }]"
            @click="switchTab('models')"
            data-testid="tab-providers"
          >
            <span>{{ tr('nav.providers') }}</span>
          </button>

        </div>

      </aside>

      <!-- 2B. CENTER MAIN CANVAS -->
      <main class="stitch-main" ref="mainCanvasRef">
        <div class="canvas-content-flow">
          <div
            v-if="feedback"
            :role="feedbackError ? 'alert' : 'status'"
            :class="['feedback', { error: feedbackError }]"
          >
            <span>{{ feedback }}</span>
            <button
              type="button"
              class="feedback-close-btn"
              aria-label="Close"
              @click="clearFeedback"
            >×</button>
          </div>


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
                  <span>{{ tr('options.previewNetflix') }}</span>
                </div>
                <div class="toolbar-sep"></div>
                <span class="preview-hint">{{ tr('options.previewHint') }}</span>
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
                    {{ tr('options.previewQuote') }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Netflix Configuration Section -->
            <section id="sub-netflix" class="stitch-section">
              <div class="section-header-block">
                <h2 class="section-heading">{{ tr('options.netflixTitle') }}</h2>
                <p class="section-lead">{{ tr('options.netflixDesc') }}</p>
              </div>

              <div class="stitch-rows-container">
                <!-- Toggle -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">{{ tr('options.netflixEnable') }}</span>
                    <span class="row-desc">{{ tr('options.netflixEnableDesc') }}</span>
                  </div>
                  <div class="row-control">
                    <label class="toggle">
                      <input :aria-label="tr('options.netflixEnable')"
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
                    <span class="row-title">{{ tr('options.netflixOriginalSize') }}</span>
                    <span class="row-desc">{{ tr('options.netflixOriginalSizeDesc') }}</span>
                  </div>
                  <div class="row-control slider-control">
                    <input :aria-label="tr('options.netflixOriginalSize')"
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
                    <span class="row-title">{{ tr('options.netflixTranslatedSize') }}</span>
                    <span class="row-desc">{{ tr('options.netflixTranslatedSizeDesc') }}</span>
                  </div>
                  <div class="row-control slider-control">
                    <input :aria-label="tr('options.netflixTranslatedSize')"
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
                    <span class="row-title">{{ tr('options.netflixBottom') }}</span>
                    <span class="row-desc">{{ tr('options.netflixBottomDesc') }}</span>
                  </div>
                  <div class="row-control slider-control">
                    <input :aria-label="tr('options.netflixBottom')"
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
                    <span class="row-title">{{ tr('options.netflixSpacing') }}</span>
                    <span class="row-desc">{{ tr('options.netflixSpacingDesc') }}</span>
                  </div>
                  <div class="row-control slider-control">
                    <input :aria-label="tr('options.netflixSpacing')"
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
                    <span class="row-title">{{ tr('options.netflixLearning') }}</span>
                    <span class="row-desc">{{ tr('options.netflixLearningDesc') }}</span>
                  </div>
                  <div class="row-control">
                    <label class="toggle">
                      <input :aria-label="tr('options.netflixLearning')"
                        type="checkbox"
                        v-model="netflixConfig.learningMode"
                        @change="saveNetflix"
                      />
                      <span class="slider"></span>
                    </label>
                  </div>
                </div>
                <div v-if="netflixConfig.learningMode" class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">{{ tr('options.autoPause') }}</span>
                    <span class="row-desc">{{ tr('options.autoPauseDesc') }}</span>
                  </div>
                  <div class="row-control">
                    <label class="toggle">
                      <input type="checkbox" :aria-label="tr('options.autoPause')" v-model="netflixConfig.autoPause" @change="saveNetflix" />
                      <span class="slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <!-- YouTube 字幕樣式 Section -->
            <section id="sub-youtube" class="stitch-section">
              <div class="section-header-block">
                <h2 class="section-heading">{{ tr('options.youtubeAppearance') }}</h2>
                <p class="section-lead">{{ tr('options.youtubeAppearanceDesc') }}</p>
              </div>

              <div class="stitch-rows-container">
                <!-- Original Font Size -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">{{ tr('options.youtubeOriginalSize') }}</span>
                    <span class="row-desc">{{ tr('options.youtubeOriginalSizeDesc') }}</span>
                  </div>
                  <div class="row-control slider-control">
                    <input :aria-label="tr('options.youtubeOriginalSize')"
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
                    <span class="row-title">{{ tr('options.youtubeTranslatedSize') }}</span>
                    <span class="row-desc">{{ tr('options.youtubeTranslatedSizeDesc') }}</span>
                  </div>
                  <div class="row-control slider-control">
                    <input :aria-label="tr('options.youtubeTranslatedSize')"
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
                    <span class="row-title">{{ tr('options.youtubeOriginalColor') }}</span>
                    <span class="row-desc">{{ tr('options.youtubeOriginalColorDesc') }}</span>
                  </div>
                  <div class="row-control color-control">
                    <input :aria-label="tr('options.youtubeOriginalColor')"
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
                    <span class="row-title">{{ tr('options.youtubeTranslatedColor') }}</span>
                    <span class="row-desc">{{ tr('options.youtubeTranslatedColorDesc') }}</span>
                  </div>
                  <div class="row-control color-control">
                    <input :aria-label="tr('options.youtubeTranslatedColor')"
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
                <h2 class="section-heading">{{ tr('options.hotkeysTitle') }}</h2>
                <p class="section-lead">{{ tr('options.hotkeysDesc') }}</p>
              </div>

              <div class="hotkey-grid">
                <div class="hotkey-card">
                  <div class="hk-keys"><kbd>Alt + Q</kbd> / <kbd>Alt + E</kbd></div>
                  <span class="hk-desc">{{ tr('options.slowerFaster') }}</span>
                </div>
                <div class="hotkey-card">
                  <div class="hk-keys"><kbd>Alt + A</kbd> / <kbd>Alt + D</kbd></div>
                  <span class="hk-desc">{{ tr('options.prevNext') }}</span>
                </div>
                <div class="hotkey-card">
                  <div class="hk-keys"><kbd>Alt + S</kbd></div>
                  <span class="hk-desc">{{ tr('options.replay') }}</span>
                </div>
                <div class="hotkey-card">
                  <div class="hk-keys"><kbd>Alt + Z</kbd> / <kbd>Alt + C</kbd></div>
                  <span class="hk-desc">{{ tr('options.toggleLines') }}</span>
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
                <h2 class="section-heading">{{ tr('options.ankiTitle') }}</h2>
                <p class="section-lead">{{ tr('options.ankiDesc') }}</p>
              </div>
              <button :disabled="!learningCards.length" @click="onExportAnki" class="btn-stitch-accent">
                {{ tr('options.ankiExport') }}
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
                <h2 class="section-heading">{{ tr('options.providerTitle') }}</h2>
                <p class="section-lead">{{ tr('options.providerDesc') }}</p>
              </div>

              <div class="stitch-rows-container">
                <!-- Provider Select -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">{{ tr('options.providerUsed') }}</span>
                    <span class="row-desc">{{ tr('options.providerUsedDesc') }}</span>
                  </div>
                  <div class="row-control">
                    <select :aria-label="tr('options.providerUsed')" v-model="settings.activeProviderId" @change="save" class="stitch-select">
                      <option value="google-provider">{{ tr('provider.google') }}</option>
                      <option value="gemini-provider">{{ tr('provider.gemini') }}</option>
                      <option value="deepl-provider">{{ tr('provider.deepl') }}</option>
                      <option value="openrouter-provider">{{ tr('provider.openrouter') }}</option>
                      <option value="nvidia-nim-provider">{{ tr('provider.nvidia') }}</option>
                      <option value="ollama-provider">{{ tr('provider.ollama') }}</option>
                      <option value="local-http-provider">{{ tr('provider.localHttp') }}</option>
                      <option value="custom-http-provider">{{ tr('provider.customHttp') }}</option>
                      <option value="chrome-builtin-ai-provider" disabled>{{ tr('provider.chromeUnavailable') }}</option>
                    </select>
                  </div>
                </div>

                <!-- Gemini Model -->
                <div class="stitch-row" v-if="settings.activeProviderId === 'gemini-provider'">
                  <div class="row-info">
                    <span class="row-title">{{ tr('options.geminiModel') }}</span>
                    <span class="row-desc">{{ tr('options.geminiModelDesc') }}</span>
                  </div>
                  <div class="row-control">
                    <div class="input-group">
                      <input
                        :aria-label="tr('options.geminiModel')"
                        v-model.trim="settings.geminiModel"
                        @change="save"
                        class="stitch-input"
                        list="gemini-model-suggestions"
                        placeholder="例：gemini-3.5-flash"
                      />
                      <datalist id="gemini-model-suggestions">
                        <option v-for="m in activeModels" :key="m.id" :value="m.id">
                          {{ m.displayName }}{{ m.isDefaultCandidate ? ' (Recommended)' : '' }}
                        </option>
                        <option v-for="m in deprecatedModels" :key="m.id" :value="m.id">
                          {{ m.displayName }} (Deprecated)
                        </option>
                      </datalist>
                    </div>
                  </div>
                </div>

                <!-- Gemini API Key -->
                <div class="stitch-row" v-if="settings.activeProviderId === 'gemini-provider'">
                  <div class="row-info">
                    <span class="row-title">Gemini {{ tr('options.apiKey') }}</span>
                    <span class="row-desc">{{ tr('options.currentStatus', { status: settings.hasGeminiApiKey ? settings.geminiApiKeyMasked : tr('common.notConfigured') }) }}</span>
                  </div>
                  <div class="row-control input-group">
                    <input :aria-label="`Gemini ${tr('options.apiKey')}`"
                      type="password"
                      v-model="geminiKeyInput"
                      :placeholder="tr('options.pasteGeminiKey')"
                      class="stitch-input"
                    />
                    <button class="btn-stitch-accent" @click="saveApiKey(geminiKeyInput)">
                      {{ saveApiKeyStatus === 'success' ? tr('common.saved') : saveApiKeyStatus === 'error' ? tr('common.saveFailed') : tr('common.save') }}
                    </button>
                    <button class="btn-stitch-secondary" @click="clearApiKey" v-if="settings.hasGeminiApiKey">{{ tr('common.clear') }}</button>
                  </div>
                </div>

                <!-- OpenRouter -->
                <div v-if="settings.activeProviderId === 'openrouter-provider'" class="stitch-row vertical-row">
                  <label for="openrouter-model" class="row-title">{{ tr('options.openrouterModel') }}</label>
                  <p class="row-desc">{{ tr('options.openrouterModelDesc') }}</p>
                  <input id="openrouter-model" class="stitch-input" v-model.trim="settings.openRouterModel" @change="save" list="openrouter-model-suggestions" placeholder="openrouter/auto" />
                  <datalist id="openrouter-model-suggestions">
                    <option value="openrouter/auto"></option>
                    <option value="openrouter/free"></option>
                  </datalist>
                  <label for="openrouter-key" class="row-title">OpenRouter {{ tr('options.apiKey') }}</label>
                  <p class="row-desc">{{ tr('options.currentStatus', { status: settings.hasOpenRouterApiKey ? settings.openRouterApiKeyMasked : tr('common.notConfigured') }) }}</p>
                  <div class="input-group">
                    <input id="openrouter-key" class="stitch-input" type="password" v-model="openRouterKeyInput" placeholder="sk-or-v1-…" />
                    <button class="btn-stitch-accent" @click="saveOpenRouterKey(openRouterKeyInput)">
                      {{ saveOpenRouterKeyStatus === 'success' ? tr('common.saved') : saveOpenRouterKeyStatus === 'error' ? tr('common.saveFailed') : tr('common.save') }}
                    </button>
                    <button class="btn-stitch-secondary" @click="clearOpenRouterKey" v-if="settings.hasOpenRouterApiKey">{{ tr('common.clear') }}</button>
                  </div>
                </div>

                <!-- NVIDIA NIM -->
                <div v-if="settings.activeProviderId === 'nvidia-nim-provider'" class="stitch-row vertical-row">
                  <label for="nvidia-nim-url" class="row-title">{{ tr('options.nvidiaEndpoint') }}</label>
                  <p class="row-desc">{{ tr('options.nvidiaEndpointDesc') }}</p>
                  <input id="nvidia-nim-url" class="stitch-input" type="url" v-model.trim="settings.nvidiaNimEndpoint" @change="save" />
                  <label for="nvidia-nim-model" class="row-title">{{ tr('options.nvidiaModel') }}</label>
                  <input id="nvidia-nim-model" class="stitch-input" v-model.trim="settings.nvidiaNimModel" @change="save" list="nvidia-nim-model-suggestions" placeholder="meta/llama-3.1-8b-instruct" />
                  <datalist id="nvidia-nim-model-suggestions">
                    <option value="meta/llama-3.1-8b-instruct"></option>
                    <option value="meta/llama-3.1-70b-instruct"></option>
                  </datalist>
                  <label for="nvidia-nim-key" class="row-title">NVIDIA {{ tr('options.apiKey') }}</label>
                  <p class="row-desc">{{ tr('options.nvidiaKeyDesc', { status: settings.hasNvidiaNimApiKey ? settings.nvidiaNimApiKeyMasked : tr('common.notConfigured') }) }}</p>
                  <div class="input-group">
                    <input id="nvidia-nim-key" class="stitch-input" type="password" v-model="nvidiaNimKeyInput" placeholder="nvapi-…" />
                    <button class="btn-stitch-accent" @click="saveNvidiaNimKey(nvidiaNimKeyInput)">
                      {{ saveNvidiaNimKeyStatus === 'success' ? tr('common.saved') : saveNvidiaNimKeyStatus === 'error' ? tr('common.saveFailed') : tr('common.save') }}
                    </button>
                    <button class="btn-stitch-secondary" @click="clearNvidiaNimKey" v-if="settings.hasNvidiaNimApiKey">{{ tr('common.clear') }}</button>
                  </div>
                </div>

                <!-- DeepL API Key -->
                <div class="stitch-row" v-if="settings.activeProviderId === 'deepl-provider'">
                  <div class="row-info">
                    <span class="row-title">DeepL {{ tr('options.apiKey') }}</span>
                    <span class="row-desc">{{ tr('options.currentStatus', { status: settings.hasDeeplApiKey ? settings.deeplApiKeyMasked : tr('common.notConfigured') }) }}</span>
                  </div>
                  <div class="row-control input-group">
                    <input :aria-label="`DeepL ${tr('options.apiKey')}`"
                      type="password"
                      v-model="deeplKeyInput"
                      :placeholder="tr('options.pasteDeepLKey')"
                      class="stitch-input"
                    />
                    <button class="btn-stitch-accent" @click="saveDeeplKey(deeplKeyInput)">
                      {{ saveDeeplKeyStatus === 'success' ? tr('common.saved') : saveDeeplKeyStatus === 'error' ? tr('common.saveFailed') : tr('common.save') }}
                    </button>
                    <button class="btn-stitch-secondary" @click="clearDeeplKey" v-if="settings.hasDeeplApiKey">{{ tr('common.clear') }}</button>
                  </div>
                </div>


                <div v-if="settings.activeProviderId === 'ollama-provider'" class="stitch-row vertical-row">
                  <label for="ollama-url" class="row-title">{{ tr('options.ollamaEndpoint') }}</label>
                  <p class="row-desc">{{ tr('options.ollamaEndpointDesc') }}</p>
                  <input id="ollama-url" class="stitch-input" type="url" v-model="settings.ollamaEndpoint" @change="save" />
                  <label for="ollama-model" class="row-title">{{ tr('options.modelLabel') }}</label>
                  <input id="ollama-model" class="stitch-input" v-model="settings.ollamaModel" @change="save" />
                </div>
                <div v-if="settings.activeProviderId === 'local-http-provider'" class="stitch-row vertical-row">
                  <label for="http-url" class="row-title">{{ tr('options.localHttpEndpoint') }}</label>
                  <p class="row-desc">{{ tr('options.localHttpEndpointDesc') }}</p>
                  <input id="http-url" class="stitch-input" type="url" v-model="settings.localHttpEndpoint" @change="save" />
                  <label for="http-model" class="row-title">{{ tr('options.modelLabel') }}</label>
                  <input id="http-model" class="stitch-input" v-model="settings.localHttpModel" @change="save" />
                  <label for="http-key" class="row-title">{{ tr('options.serviceKeyOptional') }}</label>
                  <p class="row-desc">{{ tr('options.currentStatus', { status: settings.hasLocalHttpApiKey ? settings.localHttpApiKeyMasked : tr('common.notConfigured') }) }}</p>
                  <div class="input-group">
                    <input id="http-key" class="stitch-input" type="password" v-model="localHttpKeyInput" :placeholder="tr('options.pasteServiceKey')" />
                    <button class="btn-stitch-accent" @click="saveLocalHttpKey(localHttpKeyInput)">
                      {{ saveLocalHttpKeyStatus === 'success' ? tr('common.saved') : saveLocalHttpKeyStatus === 'error' ? tr('common.saveFailed') : tr('common.save') }}
                    </button>
                    <button class="btn-stitch-secondary" @click="clearLocalHttpKey" v-if="settings.hasLocalHttpApiKey">{{ tr('common.clear') }}</button>
                  </div>
                </div>
                <div v-if="settings.activeProviderId === 'custom-http-provider'" class="stitch-row vertical-row">
                  <label for="custom-http-url" class="row-title">{{ tr('options.customEndpoint') }}</label>
                  <p class="row-desc">{{ tr('options.customEndpointDesc') }}</p>
                  <input id="custom-http-url" class="stitch-input" type="url" v-model="settings.customHttpEndpoint" @change="save" placeholder="https://api.example.com" />
                  <label for="custom-http-model" class="row-title">{{ tr('options.modelLabel') }}</label>
                  <input id="custom-http-model" class="stitch-input" v-model="settings.customHttpModel" @change="save" placeholder="model-name" />
                  <label for="custom-http-key" class="row-title">{{ tr('options.serviceKeyOptional') }}</label>
                  <p class="row-desc">{{ tr('options.currentStatus', { status: settings.hasCustomHttpApiKey ? settings.customHttpApiKeyMasked : tr('common.notConfigured') }) }}</p>
                  <div class="input-group">
                    <input id="custom-http-key" class="stitch-input" type="password" v-model="customHttpKeyInput" :placeholder="tr('options.pasteServiceKey')" />
                    <button class="btn-stitch-accent" @click="saveCustomHttpKey(customHttpKeyInput)">
                      {{ saveCustomHttpKeyStatus === 'success' ? tr('common.saved') : saveCustomHttpKeyStatus === 'error' ? tr('common.saveFailed') : tr('common.save') }}
                    </button>
                    <button class="btn-stitch-secondary" @click="clearCustomHttpKey" v-if="settings.hasCustomHttpApiKey">{{ tr('common.clear') }}</button>
                  </div>
                </div>
                <div v-if="settings.activeProviderId === 'deepl-provider'" class="stitch-row">
                  <label for="deepl-plan" class="row-title">{{ tr('options.deeplPlan') }}</label>
                  <select id="deepl-plan" v-model="settings.deeplApiIsPro" @change="save"><option :value="false">API Free</option><option :value="true">API Pro</option></select>
                </div>
                <p v-if="['chrome-ai-provider', 'chrome-builtin-ai-provider'].includes(settings.activeProviderId)" class="stitch-row row-desc">{{ tr('options.chromeInfo') }}</p>

                <div class="stitch-row vertical-row">
                  <span class="row-title">{{ tr('options.testProvider') }}</span>
                  <p class="row-desc">{{ tr('options.testProviderDesc') }}</p>
                  <button type="button" class="btn-stitch-secondary" :disabled="testingProvider" @click="testProvider">{{ testingProvider ? tr('options.testing') : tr('options.testOne') }}</button>
                  <p v-if="providerTestResult" role="status">{{ providerTestResult }}</p>
                </div>
                <!-- AI Translation Instructions -->
                <div v-if="['gemini-provider', 'openrouter-provider', 'nvidia-nim-provider', 'ollama-provider', 'local-http-provider', 'custom-http-provider'].includes(settings.activeProviderId)" class="stitch-row vertical-row">
                  <div class="row-info">
                    <span class="row-title">{{ tr('options.translationPrefs') }}</span>
                    <span class="row-desc">{{ tr('options.translationPrefsDesc') }}</span>
                  </div>
                  <div class="textarea-wrapper">
                    <textarea
                      v-model="settings.aiTranslationInstructions"
                      rows="4"
                      class="stitch-textarea"
                      :placeholder="tr('options.instructionsPlaceholder')"
                      @blur="save"
                    ></textarea>
                    <div class="textarea-actions">
                      <button class="btn-stitch-secondary" @click="clearAiInstructions">{{ tr('options.clearInstructions') }}</button>
                      <button class="btn-stitch-accent" @click="save">{{ tr('options.saveInstructions') }}</button>
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
                    <span class="row-title">{{ tr('options.enableWeb') }}</span>
                    <span class="row-desc">{{ tr('options.enableWebDesc') }}</span>
                  </div>
                  <div class="row-control">
                    <label class="toggle">
                      <input :aria-label="tr('options.enableWeb')"
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
                    <span class="row-title">{{ tr('language.source') }}</span>
                    <span class="row-desc">{{ tr('options.sourceDesc') }}</span>
                  </div>
                  <div class="row-control">
                    <select :aria-label="tr('language.source')" v-model="settings.sourceLanguage" @change="save" class="stitch-select">
                      <option value="auto">{{ tr('language.detectAuto') }}</option>
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
                    <span class="row-title">{{ tr('language.target') }}</span>
                    <span class="row-desc">{{ tr('options.targetDesc') }}</span>
                  </div>
                  <div class="row-control">
                    <select :aria-label="tr('language.target')" v-model="settings.targetLanguage" @change="save" class="stitch-select">
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
                    <span class="row-title">{{ tr('options.readingMode') }}</span>
                    <span class="row-desc">{{ tr('options.readingModeDesc') }}</span>
                  </div>
                  <div class="row-control">
                    <select :aria-label="tr('options.readingMode')" v-model="settings.displayMode" @change="save" class="stitch-select">
                      <option value="bilingual">{{ tr('options.bilingual') }}</option>
                      <option value="translation-first">{{ tr('options.translationFirst') }}</option>
                      <option value="immersive">{{ tr('options.immersive') }}</option>
                    </select>
                  </div>
                </div>

                <!-- Floating Button -->
                <div class="stitch-row">
                  <div class="row-info">
                    <span class="row-title">{{ tr('options.floatingButton') }}</span>
                    <span class="row-desc">{{ tr('options.floatingButtonDesc') }}</span>
                  </div>
                  <div class="row-control">
                    <label class="toggle">
                      <input :aria-label="tr('options.floatingButton')"
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
            <section class="stitch-section interface-section">
              <h2 class="section-heading">{{ tr('ui.preferences') }}</h2>
              <div class="stitch-rows-container">
                <div class="stitch-row">
                  <label class="row-title" for="interface-language">{{ tr('ui.language') }}</label>
                  <div class="row-control">
                    <select id="interface-language" :aria-label="tr('ui.language')" v-model="settings.uiLanguage" @change="save" class="stitch-select">
                      <option v-for="option in uiLanguageOptions(settings.uiLanguage)" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </select>
                  </div>
                </div>
                <div class="stitch-row">
                  <label class="row-title" for="interface-theme">{{ tr('theme.label') }}</label>
                  <div class="row-control">
                    <select id="interface-theme" :value="theme" :aria-label="tr('theme.label')" @change="onThemeChange" class="stitch-select">
                      <option value="system">{{ tr('common.system') }}</option>
                      <option value="dark">{{ tr('common.dark') }}</option>
                      <option value="light">{{ tr('common.light') }}</option>
                    </select>
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
import ThemeButton from '@/components/ThemeButton.vue';
import BrandMark from '@/components/BrandMark.vue';
import {
  getActiveVerifiedModels,
  getDeprecatedButFunctionalModels,
  DEFAULT_MODEL_ID,
} from '@/infrastructure/providers/gemini/model-registry';
import type { LearningCard, SrsGrade } from '@/core/domain/learning-types';
import GlossaryManager from '@/components/GlossaryManager.vue';
import FlashcardWorkbench from '@/components/learning/FlashcardWorkbench.vue';
import { translate, uiLanguageOptions, type TranslationKey } from '@/shared/i18n';

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
const openRouterKeyInput = ref('');
const nvidiaNimKeyInput = ref('');
const testingProvider = ref(false);
const providerTestResult = ref('');
const saveApiKeyStatus = ref<'idle' | 'success' | 'error'>('idle');
const saveDeeplKeyStatus = ref<'idle' | 'success' | 'error'>('idle');
const saveLocalHttpKeyStatus = ref<'idle' | 'success' | 'error'>('idle');
const saveCustomHttpKeyStatus = ref<'idle' | 'success' | 'error'>('idle');
const saveOpenRouterKeyStatus = ref<'idle' | 'success' | 'error'>('idle');
const saveNvidiaNimKeyStatus = ref<'idle' | 'success' | 'error'>('idle');

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
  openRouterModel: 'openrouter/auto',
  hasOpenRouterApiKey: false,
  openRouterApiKeyMasked: '',
  nvidiaNimEndpoint: 'https://integrate.api.nvidia.com/v1',
  nvidiaNimModel: 'meta/llama-3.1-8b-instruct',
  hasNvidiaNimApiKey: false,
  nvidiaNimApiKeyMasked: '',
  enabled: true,
  sourceLanguage: 'auto',
  targetLanguage: 'zh-Hant',
  defaultTranslationMode: 'fast' as 'fast' | 'quality',
  activeProviderId: 'gemini-provider',
  remoteProviderDisclosureVersion: 1,
  hasGeminiApiKey: false,
  geminiApiKeyMasked: '',
  geminiModel: DEFAULT_MODEL_ID,
  aiTranslationInstructions: '',
  hasDeeplApiKey: false,
  deeplApiKeyMasked: '',
  deeplApiIsPro: false,
  displayMode: 'bilingual' as 'bilingual' | 'translation-first' | 'immersive',
  uiLanguage: 'auto' as 'auto' | 'zh-Hant' | 'zh-Hans' | 'en' | 'ja',
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
  learningMode: false,
  autoPause: false,
});

const vocabItems = ref<LearningCard[]>([]);
const feedback = ref('');
const feedbackError = ref(false);
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

function clearFeedback() {
  if (feedbackTimer) {
    clearTimeout(feedbackTimer);
    feedbackTimer = null;
  }
  feedback.value = '';
  feedbackError.value = false;
}

function showFeedback(message: string, isError = false, durationMs = 3500) {
  clearFeedback();
  feedback.value = message;
  feedbackError.value = isError;
  if (durationMs > 0) {
    feedbackTimer = setTimeout(() => {
      clearFeedback();
    }, durationMs);
  }
}

function reportError(message: string) {
  showFeedback(message, true, 5000);
}
const tr = (key: TranslationKey, vars?: Record<string, string | number>) =>
  translate(settings.value.uiLanguage, key, vars);

const { theme, resolvedTheme, onThemeChange, toggleTheme } = useUiTheme(reportError);
watch(() => [settings.value.activeProviderId, settings.value.targetLanguage], () => { providerTestResult.value = ''; });

const learningCards = computed(() => vocabItems.value);

const dueCardsCount = computed(() => {
  const now = Date.now();
  return learningCards.value.filter((c) => (c.srs?.nextReviewDate || 0) <= now).length;
});



const currentHeadline = computed(() => {
  switch (activeTab.value) {
    case 'subtitles': return tr('options.subtitleHeadline');
    case 'learning': return tr('options.learningHeadline');
    case 'vocabulary': return tr('options.vocabHeadline');
    case 'models': return tr('options.providersHeadline');
    case 'general': return tr('options.readingHeadline');
    default: return 'Open Web Translate';
  }
});

const currentSubtitle = computed(() => {
  switch (activeTab.value) {
    case 'subtitles': return tr('options.subtitleSubtitle');
    case 'learning': return tr('options.learningSubtitle');
    case 'vocabulary': return tr('options.vocabSubtitle');
    case 'models': return tr('options.providersSubtitle');
    case 'general': return tr('options.readingSubtitle');
    default: return tr('options.defaultSubtitle');
  }
});


const currentSubNavItems = computed(() => {
  switch (activeTab.value) {
    case 'subtitles':
      return [
        { id: 'sub-preview', label: tr('common.overview') },
        { id: 'sub-netflix', label: tr('options.netflixTitle') },
        { id: 'sub-youtube', label: tr('options.youtubeAppearance') },
        { id: 'sub-hotkeys', label: tr('options.hotkeysTitle') },
      ];
    case 'learning':
      return [
        { id: 'learn-stage', label: tr('common.overview') },
        { id: 'learn-anki', label: tr('options.ankiTitle') },
      ];
    case 'vocabulary':
      return [
        { id: 'vocab-stage', label: tr('common.overview') },
      ];
    case 'models':
      return [
        { id: 'models-provider', label: tr('common.overview') },
      ];
    case 'general':
      return [
        { id: 'gen-settings', label: tr('common.overview') },
      ];
    default:
      return [{ id: 'sub-preview', label: tr('common.overview') }];
  }
});


function t(key: string): string {
  if (key === 'subtitleNetflixNote') {
    return settings.value.uiLanguage === 'ja'
      ? 'Netflix の字幕トラックは再生中に自動取得されます。'
      : settings.value.uiLanguage === 'zh-Hans'
        ? 'Netflix 字幕轨道会在播放时自动获取。'
        : settings.value.uiLanguage === 'en'
          ? 'Netflix subtitle tracks are discovered automatically during playback.'
          : 'Netflix 字幕軌道會在播放時自動擷取。';
  }
  return key;
}

function switchTab(tab: string) {
  clearFeedback();
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

const searchablePages = computed(() => [
  { tab: 'subtitles', label: tr('nav.subtitles'), keywords: 'Netflix YouTube 字幕 字幕设置 subtitles typography' },
  { tab: 'learning', label: tr('nav.review'), keywords: '複習 复习 学习 記憶 记忆 カード Anki SRS learning' },
  { tab: 'vocabulary', label: tr('nav.vocabulary'), keywords: '單字 单词 生詞 生词 vocabulary glossary' },
  { tab: 'models', label: tr('nav.providers'), keywords: '翻譯 翻译 API key 金鑰 密钥 model 模型 Gemini Google DeepL Ollama OpenRouter NVIDIA providers' },
  { tab: 'general', label: tr('nav.reading'), keywords: '語言 语言 外觀 外观 主題 主题 language preferences' },
]);
const searchResults = computed(() => {
  const query = globalSearchQuery.value.trim().toLocaleLowerCase();
  return searchablePages.value.filter(item => (item.label + ' ' + item.keywords).toLocaleLowerCase().includes(query));
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
onUnmounted(() => {
  window.removeEventListener('keydown', handleSearchShortcut);
  clearFeedback();
});

function focusSearch() {
  if (searchInputRef.value) {
    searchInputRef.value.focus();
  }
}



async function loadVocabulary() {
  try {
    vocabItems.value = (await messageRouter.sendMessage({ type: 'GET_VOCAB_ITEMS' })) || [];
  } catch (e) {
    reportError(tr('options.loadVocabFailed'));
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
    reportError(tr('options.saveVocabFailed'));
    throw e;
  }
}

async function deleteVocabItem(id: string) {
  try {
    await messageRouter.sendMessage({ type: 'DELETE_VOCAB_ITEM' as any, id } as any);
    await loadVocabulary();
  } catch (e) {
    reportError(tr('options.deleteVocabFailed'));
  }
}

async function clearVocabulary() {
  if (confirm(tr('options.clearVocabConfirm'))) {
    try {
      await messageRouter.sendMessage({ type: 'CLEAR_VOCAB_ITEMS' as any } as any);
      await loadVocabulary();
    } catch (e) {
      reportError(tr('options.clearVocabFailed'));
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
    reportError(tr('options.reviewSaveFailed'));
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
      settings.value.openRouterModel = s.openRouterModel || 'openrouter/auto';
      settings.value.hasOpenRouterApiKey = !!s.hasOpenRouterApiKey;
      settings.value.openRouterApiKeyMasked = s.openRouterApiKeyMasked || '';
      settings.value.nvidiaNimEndpoint = s.nvidiaNimEndpoint || 'https://integrate.api.nvidia.com/v1';
      settings.value.nvidiaNimModel = s.nvidiaNimModel || 'meta/llama-3.1-8b-instruct';
      settings.value.hasNvidiaNimApiKey = !!s.hasNvidiaNimApiKey;
      settings.value.nvidiaNimApiKeyMasked = s.nvidiaNimApiKeyMasked || '';
      settings.value.enabled = s.enabled ?? true;
      settings.value.sourceLanguage = s.sourceLanguage || 'auto';
      settings.value.targetLanguage = s.targetLanguage || 'zh-Hant';
      settings.value.defaultTranslationMode = s.defaultTranslationMode || 'fast';
      settings.value.activeProviderId = s.activeProviderId || 'google-provider';
      settings.value.remoteProviderDisclosureVersion = s.remoteProviderDisclosureVersion ?? 1;
      settings.value.hasGeminiApiKey = !!s.hasGeminiApiKey;
      settings.value.geminiApiKeyMasked = s.geminiApiKeyMasked || '';
      settings.value.geminiModel = s.geminiModel || DEFAULT_MODEL_ID;
      settings.value.aiTranslationInstructions = s.aiTranslationInstructions || '';
      settings.value.hasDeeplApiKey = !!s.hasDeeplApiKey;
      settings.value.deeplApiKeyMasked = s.deeplApiKeyMasked || '';
      settings.value.deeplApiIsPro = !!s.deeplApiIsPro;
      settings.value.displayMode = s.displayMode || 'bilingual';
      settings.value.uiLanguage = s.uiLanguage || 'auto';
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
        netflixConfig.value.learningMode = s.netflix.learningMode ?? false;
        netflixConfig.value.autoPause = s.netflix.autoPause ?? false;
      }
    }
  } catch (e) {
    console.error('Failed to load settings', e);
  }
}

function formatProviderTestError(error: unknown): string {
  const candidate = error as { message?: unknown; code?: unknown } | null;
  const message = error instanceof Error
    ? error.message
    : typeof candidate?.message === 'string' ? candidate.message : '';

  if (candidate?.code === 'ABORTED' || /\babort(?:ed)?\b/i.test(message)) {
    return tr('options.providerAbortedHelp');
  }
  if (/timed out|timeout|逾時/i.test(message)) {
    return tr('options.providerTimeoutHelp');
  }
  if (candidate?.code === 'CONFIGURATION_ERROR') {
    return message || tr('options.providerConfigHelp');
  }
  if (candidate?.code === 'QUOTA_EXCEEDED') {
    return message || tr('options.providerQuotaHelp');
  }
  return message || tr('options.providerGenericHelp');
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
    if (!translation?.trim()) throw new Error(tr('options.providerNoTranslation'));
    providerTestResult.value = tr('options.providerReply', { text: translation });
  } catch (error) {
    providerTestResult.value = tr('options.providerTestFailed', {
      message: formatProviderTestError(error),
    });
  } finally { testingProvider.value = false; }
}
async function save() {
  try {
    await SettingsStorage.set({
      ...settings.value,
      netflix: netflixConfig.value,
    });
    showFeedback(tr('options.settingsSaved'), false, 3000);
    return true;
  } catch (e) {
    reportError(tr('error.saveSettings'));
    return false;
  }
}

async function saveNetflix() {
  await save();
}

async function acknowledgeRemoteDataNotice() {
  try {
    settings.value.remoteProviderDisclosureVersion = 1;
    await SettingsStorage.set({ remoteProviderDisclosureVersion: 1 });
    showFeedback(tr('options.disclosureSaved'), false, 3000);
  } catch {
    settings.value.remoteProviderDisclosureVersion = 0;
    reportError(tr('error.saveSettings'));
  }
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

async function saveOpenRouterKey(key: string) {
  try {
    const trimmed = (key || '').trim();
    if (!trimmed) return;
    await messageRouter.sendMessage({ type: 'SET_API_KEY', provider: 'openrouter', apiKey: trimmed });
    settings.value.hasOpenRouterApiKey = true;
    settings.value.openRouterApiKeyMasked = SettingsStorage.maskApiKey(trimmed);
    openRouterKeyInput.value = '';
    saveOpenRouterKeyStatus.value = 'success';
    setTimeout(() => { saveOpenRouterKeyStatus.value = 'idle'; }, 2500);
    await loadSettings();
  } catch (e) {
    console.error('Failed to save OpenRouter key', e);
    saveOpenRouterKeyStatus.value = 'error';
  }
}

async function clearOpenRouterKey() {
  try {
    await messageRouter.sendMessage({ type: 'CLEAR_API_KEY', provider: 'openrouter' });
    settings.value.hasOpenRouterApiKey = false;
    settings.value.openRouterApiKeyMasked = '';
    await loadSettings();
  } catch (e) {
    console.error('Failed to clear OpenRouter key', e);
  }
}

async function saveNvidiaNimKey(key: string) {
  try {
    const trimmed = (key || '').trim();
    if (!trimmed) return;
    await messageRouter.sendMessage({ type: 'SET_API_KEY', provider: 'nvidia-nim', apiKey: trimmed });
    settings.value.hasNvidiaNimApiKey = true;
    settings.value.nvidiaNimApiKeyMasked = SettingsStorage.maskApiKey(trimmed);
    nvidiaNimKeyInput.value = '';
    saveNvidiaNimKeyStatus.value = 'success';
    setTimeout(() => { saveNvidiaNimKeyStatus.value = 'idle'; }, 2500);
    await loadSettings();
  } catch (e) {
    console.error('Failed to save NVIDIA NIM key', e);
    saveNvidiaNimKeyStatus.value = 'error';
  }
}

async function clearNvidiaNimKey() {
  try {
    await messageRouter.sendMessage({ type: 'CLEAR_API_KEY', provider: 'nvidia-nim' });
    settings.value.hasNvidiaNimApiKey = false;
    settings.value.nvidiaNimApiKeyMasked = '';
    await loadSettings();
  } catch (e) {
    console.error('Failed to clear NVIDIA NIM key', e);
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
/* ── First-run privacy / provider disclosure ───────────────────── */
.privacy-onboarding-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--bg-primary) 82%, transparent);
  backdrop-filter: blur(8px);
}

.privacy-onboarding-card {
  width: min(620px, 100%);
  padding: 28px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg, 12px);
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: var(--card-shadow);
}

.privacy-onboarding-kicker {
  margin: 0 0 10px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
}

.privacy-onboarding-card h1 {
  margin: 0 0 10px;
  font-size: 24px;
  line-height: 1.35;
  letter-spacing: -.02em;
}

.privacy-onboarding-card > p {
  color: var(--text-secondary);
  line-height: 1.7;
}

.privacy-provider-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 22px 0;
}

.privacy-provider-grid article {
  display: grid;
  gap: 7px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md, 8px);
  background: var(--bg-primary);
}

.privacy-provider-grid strong {
  font-size: 13px;
}

.privacy-provider-grid span,
.privacy-onboarding-note {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.65;
}

.privacy-onboarding-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.privacy-onboarding-actions a {
  text-decoration: none;
}

@media (max-width: 620px) {
  .privacy-provider-grid { grid-template-columns: 1fr; }
  .privacy-onboarding-actions { flex-direction: column; }
  .privacy-onboarding-actions > * { width: 100%; text-align: center; }
}

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
  padding: 0 28px;
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
  padding: 9px 14px;
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
  padding: 28px 16px;
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
  color: var(--nav-active-text);
  background: var(--nav-active-bg);
  font-weight: 600;
}

.sidebar-nav-btn.active .sidebar-count-chip {
  color: var(--nav-active-text);
  background: color-mix(in srgb, var(--nav-active-text) 14%, transparent);
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
  padding: 44px clamp(24px, 4vw, 64px) 72px;
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
  line-height: 1.25;
  margin: 0;
}

.canvas-subtitle {
  font-size: 13px;
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
  padding: 16px 20px;
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
.sidebar-nav-btn { padding: 11px 14px; }
.sidebar-nav-btn.active { background: var(--nav-active-bg); color: var(--nav-active-text); box-shadow: none; }
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

.feedback { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; background: var(--bg-hover); border-radius: var(--radius-sm); font-size: 14px; }
.feedback.error { color: var(--danger-text); background: var(--danger-bg); }
.feedback-close-btn { background: transparent; border: none; color: inherit; font-size: 18px; line-height: 1; cursor: pointer; opacity: 0.6; padding: 0 4px; }
.feedback-close-btn:hover { opacity: 1; }
.canvas-title { font-size: 26px; font-weight: 600; }
.canvas-subtitle { margin-bottom: 0; }
.row-title { font-size: 14px; }
.row-desc, .section-lead { font-size: 13px; color: var(--text-secondary); }
.stitch-main { padding-top: 44px; }
.stitch-sidebar-left { width: 208px; }
.btn-stitch-accent:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 760px) { .stitch-sidebar-left { width: 100%; } }
.stitch-header { display: grid; grid-template-columns: 208px minmax(0, 440px) 208px; justify-content: space-between; gap: 24px; }
.header-center { width: 100%; margin: 0; }
.header-right { justify-content: flex-end; }
.canvas-content-flow { max-width: 760px; gap: 12px; }
.canvas-subtitle { max-width: 60ch; color: var(--text-muted); line-height: 1.7; }
.stitch-section { margin-top: 20px; gap: 14px; }
.stitch-row:not(.vertical-row) { min-height: 76px; }
.row-info { gap: 5px; }
.row-title { font-size: 13px; font-weight: 600; }
.row-desc { font-size: 12px; color: var(--text-muted); }
.stitch-select { min-height: 36px; min-width: 200px; border-radius: 7px; background-color: var(--bg-input); }
.stitch-input { min-height: 36px; }
.section-heading { font-size: 17px; font-weight: 600; }
.stitch-rows-container { border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.stitch-row { border-bottom-color: color-mix(in srgb, var(--border-color) 55%, transparent); padding-left: 0; padding-right: 0; }
.interface-section .stitch-row { min-height: 60px; }
.stitch-row.vertical-row .row-info { max-width: 100%; }
@media (max-width: 980px) {
  .stitch-header { grid-template-columns: auto minmax(0, 1fr) auto; gap: 24px; }
}
@media (max-width: 760px) {
  .stitch-header { grid-template-columns: minmax(0, 1fr) auto; gap: 14px; padding: 16px 20px; }
  .header-center { grid-column: 1 / -1; grid-row: 2; }
  .stitch-main { padding-top: 28px; }
  .stitch-section { margin-top: 12px; }
  .stitch-row:not(.vertical-row) { min-height: 0; }
}
</style>

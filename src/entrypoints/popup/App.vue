<template>
  <div class="popup-container" data-testid="popup-page">
    <!-- ================================================================= -->
    <!-- 1. TOP HEADER (STITCH MINIMALIST NAVBAR)                          -->
    <!-- ================================================================= -->
    <header class="popup-header">
      <div class="header-left">
        <button type="button" class="app-brand" @click="openOptions">
          <svg class="brand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
          <span class="brand-name">Open Web Translate</span>
        </button>
      </div>

      <div class="header-right">
        <select v-model="theme" @change="onThemeChange" class="stitch-theme-select" aria-label="介面主題">
          <option value="system">自動</option>
          <option value="dark">深色</option>
          <option value="light">淺色</option>
        </select>
      </div>
    </header>

    <!-- ================================================================= -->
    <!-- 2. POPUP BODY (STITCH UNIFIED SETTINGS ROWS)                      -->
    <!-- ================================================================= -->
    <div class="popup-body">
      <!-- Master Toggle Row -->
      <div class="stitch-rows-container">
        <div class="stitch-row">
          <div class="row-info">
            <span class="row-title">啟用網頁翻譯</span>
            <span class="row-desc">開啟後可翻譯網頁與選取的文字</span>
          </div>
          <div class="row-control">
            <label class="toggle">
              <input
                type="checkbox"
                :checked="settings.enabled"
                @change="onToggleEnabled"
                data-testid="popup-toggle-enabled" aria-label="啟用網頁翻譯"
              />
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- Language & Provider Configuration -->
      <div class="stitch-rows-container" data-testid="translation-language-card">
        <!-- Horizontal Capsule Language Selector -->
        <div class="lang-capsule-row">
          <div class="lang-select-box">
            <span class="lang-label">原文語言</span>
            <select
              class="stitch-select lang-dropdown"
              :value="settings.sourceLanguage"
              @change="onSourceLanguageChange"
              data-testid="source-language-select" aria-label="來源語言"
            >
              <option value="auto">自動偵測</option>
              <option value="en">English</option>
              <option value="zh-Hant">繁體中文</option>
              <option value="zh-Hans">简体中文</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
              <option value="es">Español</option>
            </select>
          </div>

          <button
            class="lang-swap-btn"
            @click="swapLanguages"
            :disabled="settings.sourceLanguage === 'auto'"
            title="對調語言"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </button>

          <div class="lang-select-box">
            <span class="lang-label">翻譯成</span>
            <select
              class="stitch-select lang-dropdown"
              :value="settings.targetLanguage"
              @change="onTargetLanguageChange"
              data-testid="target-language-select" aria-label="目標語言"
            >
              <option value="zh-Hant">繁體中文</option>
              <option value="zh-Hans">简体中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
              <option value="es">Español</option>
            </select>
          </div>
        </div>

        <!-- Provider Select -->
        <div class="stitch-row" data-testid="active-provider-card">
          <div class="row-info">
            <span class="row-title">翻譯服務</span>
            <span class="row-desc">選擇翻譯方式</span>
          </div>
          <div class="row-control">
            <select
              class="stitch-select"
              :value="settings.activeProviderId"
              @change="onProviderChange"
              data-testid="popup-provider-select" aria-label="翻譯服務"
            >
              <option value="google-provider">Google 翻譯 (免金鑰)</option>
              <option value="gemini-provider">Google Gemini AI</option>
              <option value="deepl-provider">DeepL 翻譯</option>
              <option value="chrome-builtin-ai-provider" disabled>Chrome 內建 AI（暫不提供）</option>
              <option value="ollama-provider">Ollama 本機端</option>
              <option value="local-http-provider">本機 HTTP API</option>
            </select>
          </div>
        </div>

        <!-- Status indicator bar -->
        <div class="status-indicator-row">
          <div class="status-left">
            <span class="pulse-dot" :class="{ warn: needsApiKeySetup || providerUnavailable }"></span>
            <span>{{ activeProviderDetail }}</span>
          </div>
          <button v-if="needsApiKeySetup" class="provider-config-btn" @click="openOptions">
            設定金鑰 ➔
          </button>
          <span v-else-if="providerUnavailable" class="status-badge">暫不提供</span>
          <span v-else class="status-badge">尚未測試連線</span>
        </div>
      </div>

      <!-- Subtitle Panel (Netflix / YouTube) -->
      <div v-if="isSubtitleTab" class="stitch-rows-container" data-testid="subtitle-quick-settings">
        <div class="stitch-row subtitle-head-row">
          <div class="row-info">
            <span class="row-title highlight">
              {{ isNetflixTab ? 'Netflix 雙語字幕' : 'YouTube 雙語字幕' }}
            </span>
            <span class="row-desc">播放影片後開啟，需有可用字幕</span>
          </div>
          <div class="row-control">
            <span
              v-if="isNetflixTab"
              :class="['sub-state-pill', netflixHud.isActive ? 'active' : 'inactive']"
              data-testid="netflix-summary"
            >
              {{ netflixHud.isActive ? (netflixHud.dualTrack ? '雙軌已對齊' : '執行中') : '未啟用' }}
            </span>
            <span
              v-else-if="isYouTubeTab"
              :class="['sub-state-pill', ytActive ? 'active' : 'inactive']"
              data-testid="youtube-summary"
            >
              {{ ytActive ? '雙語字幕運行中' : '未啟用' }}
            </span>
          </div>
        </div>

        <div class="toggle-btn-wrapper">
          <button
            :class="['btn-main-toggle', { active: subtitleActive }]"
            @click="toggleSubtitles"
            data-testid="subtitle-toggle"
          >
            {{ subtitleActive ? '關閉雙語字幕' : '開啟雙語字幕' }}
          </button>
        </div>

        <!-- Netflix Learning Mode -->
        <div v-if="isNetflixTab" class="stitch-row">
          <div class="row-info">
            <span class="row-title">學習模式 (逐句暫停・點詞查詢)</span>
            <span class="row-desc">字幕點擊即查生詞庫</span>
          </div>
          <div class="row-control">
            <label class="toggle">
              <input
                type="checkbox"
                :checked="learningMode"
                @change="onLearningModeToggle"
                data-testid="popup-learning-mode-toggle"
              />
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <!-- Netflix Subtitle Source -->
        <div v-if="isNetflixTab" class="stitch-row">
          <div class="row-info">
            <span class="row-title">字幕來源</span>
            <span class="row-desc">優先選取軌道</span>
          </div>
          <div class="row-control">
            <select
              class="stitch-select"
              :value="sourceSelectionValue"
              @change="onSourceSelectionChange"
              data-testid="subtitle-source-select"
            >
              <option value="auto">自動（優先原生）</option>
              <option value="ai">僅 AI / 機翻</option>
              <option v-for="t in netflixHud.tracks" :key="t.id" :value="`track:${t.id}`">
                {{ t.label }}{{ t.isCC ? ' (CC)' : '' }}
              </option>
            </select>
          </div>
        </div>

        <!-- YouTube Subtitle Source -->
        <div v-if="isYouTubeTab && ytTracks.length > 0" class="stitch-row">
          <div class="row-info">
            <span class="row-title">字幕來源</span>
            <span class="row-desc">優先選取軌道</span>
          </div>
          <div class="row-control">
            <select
              class="stitch-select"
              :value="ytSelectedTrackId || 'auto'"
              @change="onYouTubeTrackChange"
              data-testid="youtube-track-select"
            >
              <option value="auto">自動（優先原生）</option>
              <option v-for="t in ytTracks" :key="t.id" :value="t.languageCode">
                {{ t.label }}{{ t.kind === 'asr' ? ' (自動產生)' : '' }}
              </option>
            </select>
          </div>
        </div>

        <!-- Original Subtitle Size -->
        <div class="stitch-row">
          <div class="row-info">
            <span class="row-title">原文字幕大小</span>
            <span class="row-desc">{{ settings.subtitleOriginalFontSize }}px</span>
          </div>
          <div class="row-control slider-control">
            <input
              type="range"
              min="12"
              max="32"
              step="1"
              :value="settings.subtitleOriginalFontSize"
              @input="onSubtitleSizeChange('subtitleOriginalFontSize', $event)"
              data-testid="popup-orig-size-slider"
            />
          </div>
        </div>

        <!-- Translated Subtitle Size -->
        <div class="stitch-row">
          <div class="row-info">
            <span class="row-title">譯文字幕大小</span>
            <span class="row-desc">{{ settings.subtitleTranslatedFontSize }}px</span>
          </div>
          <div class="row-control slider-control">
            <input
              type="range"
              min="14"
              max="40"
              step="1"
              :value="settings.subtitleTranslatedFontSize"
              @input="onSubtitleSizeChange('subtitleTranslatedFontSize', $event)"
              data-testid="popup-trans-size-slider"
            />
          </div>
        </div>

        <div v-if="isYouTubeTab" class="stitch-callout" style="margin: 8px 12px 12px;">
          <span class="callout-icon">💡</span>
          <span>需開啟影片「CC 字幕」。若兩行皆為中文，請至播放器「⚙️ 設定 ➔ 字幕」切換為「原文語言」，勿選「自動翻譯」。</span>
        </div>
      </div>

      <!-- Warning Banner if Gemini API Key not set -->
      <div v-if="isGeminiUnconfigured" class="stitch-warning-banner" data-testid="gemini-unconfigured-banner">
        <span>Gemini API Key 未設定，請至設定頁面配置金鑰。</span>
        <button class="banner-link-btn" @click="openOptions">前往設定 ➔</button>
      </div>

      <div v-if="providerUnavailable" class="stitch-warning-banner" data-testid="provider-unavailable-banner">
        <span>Chrome 內建 AI 目前暫不提供，請改選其他翻譯服務。</span>
        <button class="banner-link-btn" @click="openOptions">前往設定 ➔</button>
      </div>

      <!-- Tip Callout (Regular Webpage) -->
      <div v-if="!isSubtitleTab" class="stitch-callout" data-testid="selection-hint">
        <span class="callout-icon">💡</span>
        <span>反白選取文字即可劃詞翻譯；亦可透過右鍵選單快速翻譯目前頁面。</span>
      </div>

      <!-- Action Buttons (Regular Webpage) -->
      <div v-if="!isSubtitleTab" class="action-group">
        <button
          class="btn-stitch-accent"
          :disabled="isLoading || !settings.enabled || needsApiKeySetup || providerUnavailable"
          @click="translateCurrentPage"
          data-testid="translate-page-btn"
        >
          <span v-if="isTranslating" class="spinner"></span>
          <span>{{ isTranslating ? '翻譯中...' : '翻譯目前頁面' }}</span>
        </button>

        <button
          class="btn-stitch-secondary"
          :disabled="isLoading"
          @click="restorePage"
          data-testid="restore-page-btn"
        >
          <span v-if="isRestoring" class="spinner"></span>
          <span>{{ isRestoring ? '還原中...' : '還原頁面' }}</span>
        </button>
      </div>

      <!-- Error & Status Banners -->
      <div v-if="errorMessage" class="stitch-error-banner" data-testid="error-banner">
        <span>{{ errorMessage }}</span>
      </div>

      <div v-if="statusMessage" class="stitch-status-banner" data-testid="status-banner">
        <span>{{ statusMessage }}</span>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- 3. FOOTER                                                         -->
    <!-- ================================================================= -->
    <footer class="popup-footer">
      <button class="footer-btn" @click="openOptions" data-testid="options-link-btn">
        <svg class="footer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span>更多設定</span>
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { useUiTheme } from '@/shared/ui/use-ui-theme';
import { ref, onMounted, computed, watch } from 'vue';
import { extensionBridge } from '@/infrastructure/messaging/extension-bridge';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { useNetflixSession } from '@/core/session/subtitle-session-store';

const settings = ref({
  enabled: true,
  sourceLanguage: 'auto',
  targetLanguage: 'zh-Hant',
  activeProviderId: 'google-provider',
  hasGeminiApiKey: false,
  geminiModel: 'gemini-2.5-flash',
  hasDeeplApiKey: false,
  deeplApiIsPro: false,
  subtitleOriginalFontSize: 18,
  subtitleTranslatedFontSize: 22,
});

const { theme, onThemeChange } = useUiTheme(message => { errorMessage.value = message; });
const isTranslating = ref(false);
const isRestoring = ref(false);
const isLoading = computed(() => isTranslating.value || isRestoring.value);

const isNetflixTab = ref(false);
const isYouTubeTab = ref(false);
const isSubtitleTab = computed(() => isNetflixTab.value || isYouTubeTab.value);
const { hudInfo: netflixHud } = useNetflixSession();

const learningMode = ref(true);

const ytActive = ref(false);
const ytTracks = ref<Array<{ id: string; label: string; languageCode: string; kind?: string }>>([]);
const ytSelectedTrackId = ref<string | null>(null);
const subtitleActive = computed(() => (isNetflixTab.value ? netflixHud.value.isActive : ytActive.value));

const sourceSelectionValue = computed(() =>
  netflixHud.value.selectedTrackId === 'ai-translate'
    ? 'ai'
    : netflixHud.value.selectionMode === 'manual' && netflixHud.value.selectedTrackId
      ? `track:${netflixHud.value.selectedTrackId}`
      : 'auto',
);


async function toggleSubtitles() {
  const target = !subtitleActive.value;
  try {
    const tabId = await extensionBridge.queryActiveTabId();
    if (!tabId) return;
    if (isNetflixTab.value) {
      await extensionBridge.sendTabCommand(tabId, { type: 'SET_NETFLIX_ACTIVE', active: target });
    } else {
      await extensionBridge.sendTabCommand(tabId, { type: 'SET_YOUTUBE_ACTIVE', active: target });
      ytActive.value = target;
      if (target) {
        if (settings.value.sourceLanguage && settings.value.sourceLanguage !== 'auto') {
          await extensionBridge.sendTabCommand(tabId, {
            type: 'SET_YOUTUBE_TRACK',
            trackId: settings.value.sourceLanguage,
          });
        }
        await refreshYouTubeState();
      }
    }
  } catch {
    errorMessage.value = '無法切換雙語字幕（分頁未回應）';
  }
}

async function onSourceSelectionChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value;
  if (value.startsWith('track:')) {
    await setSubtitleSource('track', value.slice('track:'.length));
  } else {
    await setSubtitleSource(value as 'auto' | 'ai');
  }
}

async function refreshYouTubeState() {
  try {
    const tabId = await extensionBridge.queryActiveTabId();
    if (!tabId) return;
    const state = await extensionBridge.sendTabCommand<{
      isActive: boolean;
      tracks?: Array<{ id: string; label: string; languageCode: string; kind?: string }>;
      selectedTrackId?: string | null;
    }>(tabId, { type: 'GET_YOUTUBE_STATE' });
    if (state) {
      ytActive.value = state.isActive;
      if (Array.isArray(state.tracks)) {
        ytTracks.value = state.tracks;
      }
      if (state.selectedTrackId !== undefined) {
        ytSelectedTrackId.value = state.selectedTrackId;
      }
    }
  } catch {
    // tab not ready
  }
}

async function onYouTubeTrackChange(e: Event) {
  const code = (e.target as HTMLSelectElement).value;
  ytSelectedTrackId.value = code;
  try {
    const tabId = await extensionBridge.queryActiveTabId();
    if (!tabId) return;
    await extensionBridge.sendTabCommand(tabId, { type: 'SET_YOUTUBE_TRACK', trackId: code });
  } catch {
    errorMessage.value = '無法切換 YouTube 字幕軌道';
  }
}

watch(
  () => netflixHud.value.learningMode,
  (mode) => {
    if (mode !== undefined) {
      learningMode.value = mode;
    }
  },
);

function onProviderChange(e: Event) {
  const providerId = (e.target as HTMLSelectElement).value;
  settings.value.activeProviderId = providerId;
  save();
}

const needsApiKeySetup = computed(() => {
  if (settings.value.activeProviderId === 'gemini-provider' && !settings.value.hasGeminiApiKey) return true;
  if (settings.value.activeProviderId === 'deepl-provider' && !settings.value.hasDeeplApiKey) return true;
  return false;
});

const providerUnavailable = computed(() =>
  settings.value.activeProviderId === 'chrome-ai-provider' ||
  settings.value.activeProviderId === 'chrome-builtin-ai-provider',
);

const activeProviderDetail = computed(() => {
  switch (settings.value.activeProviderId) {
    case 'gemini-provider':
      return settings.value.hasGeminiApiKey
        ? `Gemini (${settings.value.geminiModel || 'gemini-2.5-flash'})`
        : `Gemini 尚未設定金鑰`;
    case 'deepl-provider':
      return settings.value.hasDeeplApiKey
        ? `DeepL (${settings.value.deeplApiIsPro ? 'Pro' : 'Free'})`
        : `DeepL 尚未設定金鑰`;
    case 'chrome-builtin-ai-provider':
      return 'Chrome 內建 AI';
    case 'ollama-provider':
      return 'Ollama 本機端（僅 loopback）';
    case 'local-http-provider':
      return '本機 HTTP API（僅 loopback）';
    case 'google-provider':
    default:
      return 'Google 翻譯 · 預設免金鑰';
  }
});

function swapLanguages() {
  if (settings.value.sourceLanguage === 'auto') return;
  const temp = settings.value.sourceLanguage;
  settings.value.sourceLanguage = settings.value.targetLanguage;
  settings.value.targetLanguage = temp;
  save();
}

function onTargetLanguageChange(e: Event) {
  settings.value.targetLanguage = (e.target as HTMLSelectElement).value;
  save();
}

function onSourceLanguageChange(e: Event) {
  settings.value.sourceLanguage = (e.target as HTMLSelectElement).value;
  save();
  if (isYouTubeTab.value && settings.value.sourceLanguage && settings.value.sourceLanguage !== 'auto') {
    void (async () => {
      const tabId = await extensionBridge.queryActiveTabId();
      if (tabId) {
        await extensionBridge.sendTabCommand(tabId, {
          type: 'SET_YOUTUBE_TRACK',
          trackId: settings.value.sourceLanguage,
        });
        ytSelectedTrackId.value = settings.value.sourceLanguage;
      }
    })();
  }
}

function onSubtitleSizeChange(key: 'subtitleOriginalFontSize' | 'subtitleTranslatedFontSize', e: Event) {
  settings.value[key] = Number((e.target as HTMLInputElement).value);
  saveSubtitleSizes();
}

async function saveSubtitleSizes() {
  try {
    await SettingsStorage.set({
      subtitleOriginalFontSize: settings.value.subtitleOriginalFontSize,
      subtitleTranslatedFontSize: settings.value.subtitleTranslatedFontSize,
    });
  } catch {
    errorMessage.value = '儲存字幕設定失敗';
  }
}

async function onLearningModeToggle(e: Event) {
  const enabled = (e.target as HTMLInputElement).checked;
  learningMode.value = enabled;
  try {
    const current = (await SettingsStorage.get()).netflix ?? {
      enabled: true,
      primarySize: 18,
      secondarySize: 22,
      bottomPosition: 80,
      lineSpacing: 4,
      enableBitmapRescue: true,
      learningMode: true,
    };
    await SettingsStorage.set({ netflix: { ...current, learningMode: enabled } });
  } catch {
    errorMessage.value = '無法更新學習模式設定';
  }
}

async function setSubtitleSource(source: 'auto' | 'ai' | 'track', trackId?: string) {
  try {
    const tabId = await extensionBridge.queryActiveTabId();
    if (!tabId) return;
    await extensionBridge.sendTabCommand(tabId, { type: 'SET_NETFLIX_SELECTION', source, trackId });
    netflixHud.value = {
      ...netflixHud.value,
      selectionMode: source === 'auto' ? 'auto' : 'manual',
      selectedTrackId: source === 'ai' ? 'ai-translate' : trackId ?? netflixHud.value.selectedTrackId,
    };
  } catch {
    errorMessage.value = '無法切換字幕來源（分頁未回應）';
  }
}

function onToggleEnabled(e: Event) {
  settings.value.enabled = (e.target as HTMLInputElement).checked;
  save();
}

const isGeminiUnconfigured = computed(() => {
  return settings.value.activeProviderId === 'gemini-provider' && !settings.value.hasGeminiApiKey;
});

const errorMessage = ref('');
const statusMessage = ref('');

onMounted(async () => {
  try {
    const url = await extensionBridge.queryActiveTabUrl();
    const tabId = await extensionBridge.queryActiveTabId();

    const isYtUrl = Boolean(url && (url.includes('youtube.com') || url.includes('youtu.be')));
    const isNfUrl = Boolean(url && url.includes('netflix.com'));

    if (isYtUrl) {
      isYouTubeTab.value = true;
      isNetflixTab.value = false;
    } else if (isNfUrl) {
      isNetflixTab.value = true;
      isYouTubeTab.value = false;
    } else if (tabId) {
      const ytState = await extensionBridge.sendTabCommand<{ isActive: boolean }>(tabId, { type: 'GET_YOUTUBE_STATE' });
      if (ytState && typeof ytState.isActive === 'boolean') {
        isYouTubeTab.value = true;
        isNetflixTab.value = false;
        ytActive.value = ytState.isActive;
      } else {
        const nfState = await extensionBridge.sendTabCommand<{ primaryStatus?: string }>(tabId, { type: 'GET_NETFLIX_STATE' });
        if (nfState && typeof nfState.primaryStatus === 'string') {
          isNetflixTab.value = true;
          isYouTubeTab.value = false;
        }
      }
    }

    if (isYouTubeTab.value) {
      await refreshYouTubeState();
    }

    const s = await SettingsStorage.get();
    if (s) {
      learningMode.value = s.netflix?.learningMode ?? true;
      settings.value.enabled = s.enabled;
      settings.value.sourceLanguage = s.sourceLanguage || 'auto';
      settings.value.targetLanguage = s.targetLanguage;
      settings.value.activeProviderId = s.activeProviderId || 'google-provider';
      settings.value.hasGeminiApiKey = Boolean(s.hasGeminiApiKey);
      settings.value.geminiModel = s.geminiModel || 'gemini-2.5-flash';
      settings.value.hasDeeplApiKey = Boolean(s.hasDeeplApiKey);
      settings.value.deeplApiIsPro = Boolean(s.deeplApiIsPro);
      settings.value.subtitleOriginalFontSize = s.subtitleOriginalFontSize ?? 18;
      settings.value.subtitleTranslatedFontSize = s.subtitleTranslatedFontSize ?? 22;
    }
  } catch (err) {
    console.warn('[Popup] Failed to initialize popup settings:', err);
  }
});

async function save() {
  try {
    await SettingsStorage.set({
      enabled: settings.value.enabled,
      sourceLanguage: settings.value.sourceLanguage,
      targetLanguage: settings.value.targetLanguage,
      activeProviderId: settings.value.activeProviderId,
    });
  } catch {
    errorMessage.value = '儲存設定失敗';
  }
}

async function translateCurrentPage() {
  errorMessage.value = '';
  statusMessage.value = '';
  isTranslating.value = true;
  try {
    const res = await messageRouter.sendMessage({ type: 'TRANSLATE_ACTIVE_TAB' });
    if (res?.success) {
      statusMessage.value = `翻譯完成 (共 ${res.translatedCount || 0} 個段落)`;
    } else {
      errorMessage.value = res?.error?.message || '頁面翻譯失敗';
    }
  } catch (err: any) {
    errorMessage.value = err?.message || '通訊錯誤，請確認頁面已載入';
  } finally {
    isTranslating.value = false;
  }
}

async function restorePage() {
  errorMessage.value = '';
  statusMessage.value = '';
  isRestoring.value = true;
  try {
    const res = await messageRouter.sendMessage({ type: 'RESTORE_ACTIVE_TAB' });
    if (res?.success) {
      statusMessage.value = `已還原頁面 (共 ${res.restoredCount || 0} 個段落)`;
    } else {
      errorMessage.value = res?.error?.message || '頁面還原失敗';
    }
  } catch (err: any) {
    errorMessage.value = err?.message || '通訊錯誤';
  } finally {
    isRestoring.value = false;
  }
}

function openOptions() {
  extensionBridge.openOptionsPage();
}
</script>

<style scoped>
/* ── Main Popup Container ───────────────────────────────────────── */
.popup-container {
  width: 380px;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ── Top Header ─────────────────────────────────────────────────── */
.popup-header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.header-left {
  display: flex;
  align-items: center;
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.brand-icon {
  color: var(--text-primary);
  flex-shrink: 0;
}

.brand-name {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.brand-badge {
  font-size: 9px;
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  letter-spacing: 0.05em;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stitch-theme-select {
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 3px 8px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  outline: none;
  transition: all 0.15s ease;
}

.stitch-theme-select:hover {
  border-color: var(--border-light);
  color: var(--text-primary);
}

/* ── Popup Body ─────────────────────────────────────────────────── */
.popup-body {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Stitch Rows Container ──────────────────────────────────────── */
.stitch-rows-container {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md, 10px);
  overflow: hidden;
  box-shadow: var(--card-shadow);
}

.stitch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  border-bottom: 1px solid var(--border-color);
  gap: 12px;
}

.stitch-row:last-child {
  border-bottom: none;
}

/* ── Horizontal Language Capsule ────────────────────────────────── */
.lang-capsule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  border-bottom: 1px solid var(--border-color);
  gap: 8px;
}

.lang-select-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.lang-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.lang-dropdown {
  width: 100%;
  min-width: 0;
  text-align: left;
  padding: 6px 10px;
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 6px);
  font-size: 12px;
  font-weight: 500;
}

.lang-dropdown:hover {
  border-color: var(--border-light);
}

.lang-swap-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-top: 14px;
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.lang-swap-btn:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--border-light);
  background: var(--border-light);
}

.lang-swap-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.row-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.row-title.highlight {
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
}

.row-control.slider-control {
  width: 130px;
}

/* ── Custom Controls ────────────────────────────────────────────── */
.stitch-select {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 12px;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  outline: none;
  min-width: 130px;
  text-align: right;
  transition: border-color 0.15s ease;
}

.stitch-select:hover {
  border-color: var(--border-light);
}

/* Range Slider */
input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  background: var(--border-color);
  border-radius: 2px;
  outline: none;
}

input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--primary-accent);
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

/* Toggle Switch */
.toggle {
  position: relative;
  display: inline-block;
  width: 38px;
  height: 20px;
  flex-shrink: 0;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--border-color);
  transition: 0.2s;
  border-radius: 20px;
}

.slider:before {
  position: absolute;
  content: '';
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: var(--text-muted);
  transition: 0.2s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: var(--primary-accent);
}

input:checked + .slider:before {
  transform: translateX(18px);
  background-color: var(--on-primary);
}

/* ── Subtitle Head Row & Pill ───────────────────────────────────── */
.subtitle-head-row {
  background: var(--bg-hover);
}

.sub-state-pill {
  font-size: 10.5px;
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.sub-state-pill.active {
  background: var(--stitch-active-pill-bg);
  color: var(--on-primary);
}

.sub-state-pill.inactive {
  background: var(--bg-hover);
  color: var(--text-muted);
}

.toggle-btn-wrapper {
  padding: 14px;
}

.btn-main-toggle {
  width: 100%;
  padding: 8px 0;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  background: var(--primary-accent);
  color: var(--on-primary);
  transition: all 0.15s ease;
}

.btn-main-toggle:hover {
  background: var(--primary-hover);
}

.btn-main-toggle.active {
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

/* ── Status Indicator Bar ───────────────────────────────────────── */
.status-indicator-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  background: var(--bg-primary);
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted);
}

.status-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary-accent);
}

.pulse-dot.warn {
  background: var(--text-secondary);
}

.status-badge {
  color: var(--text-primary);
  font-weight: 600;
}

.provider-config-btn {
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

/* ── Callout Tip ────────────────────────────────────────────────── */
.stitch-callout {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.45;
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.callout-icon {
  font-size: 13px;
  flex-shrink: 0;
  margin-top: -1px;
}

/* ── Action Buttons ─────────────────────────────────────────────── */
.action-group {
  display: flex;
  gap: 8px;
}

.btn-stitch-accent {
  flex: 1;
  background: var(--primary-accent);
  color: var(--on-primary);
  font-size: 13px;
  font-weight: 700;
  height: 42px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-shadow: none;
  transition: all 0.15s ease;
}

.btn-stitch-accent:hover:not(:disabled) {
  background: var(--primary-hover);
  transform: translateY(-1px);
}

.btn-stitch-accent:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.btn-stitch-secondary {
  flex: 1;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  height: 42px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.btn-stitch-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--text-muted);
}

.btn-stitch-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Banners ────────────────────────────────────────────────────── */
.stitch-warning-banner,
.stitch-error-banner,
.stitch-status-banner {
  padding: 9px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stitch-warning-banner {
  background: var(--warning-bg);
  border: 1px solid var(--border-light);
  color: var(--warning-text);
}

.stitch-error-banner {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: var(--danger-text);
}

.stitch-status-banner {
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.banner-link-btn {
  background: none;
  border: none;
  color: var(--warning-text);
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  white-space: nowrap;
}

/* ── Footer ─────────────────────────────────────────────────────── */
.popup-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.footer-btn {
  width: 100%;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 7px 0;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.footer-btn:hover {
  color: var(--text-primary);
  background: var(--bg-card);
  border-color: var(--border-light);
}

.footer-icon {
  width: 13px;
  height: 13px;
}

.app-brand { border: 0; background: transparent; padding: 0; color: inherit; }
.stitch-select, .stitch-theme-select {
  padding-right: 28px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='1.5'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 8px center; background-size: 14px;
}
.lang-dropdown { min-width: 0; text-align: left; }
.lang-select-box, .row-info { min-width: 0; }
.lang-label { font-size: 11px; }
.lang-swap-btn { width: 32px; height: 36px; }
.status-indicator-row { padding: 10px 14px; gap: 8px; font-family: var(--font-ui); }
.status-left { min-width: 0; }
.pulse-dot { flex-shrink: 0; }
.status-badge { white-space: nowrap; font-size: 11px; font-weight: 500; color: var(--text-secondary); }
.popup-footer { padding: 0 18px 18px; border-top: 0; }
.footer-btn { min-height: 38px; }
</style>

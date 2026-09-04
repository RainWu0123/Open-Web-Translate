<template>
  <div class="popup" data-testid="popup-page">
    <header class="popup-header">
      <div class="header-left">
        <div class="logo">OWT</div>
        <h1>Open Web Translate</h1>
      </div>

      <ThemeToggle compact v-model="theme" />
    </header>

    <div class="popup-body">
      <div class="language-card" data-testid="translation-language-card">
        <div class="sq-row">
          <span class="sq-label">來源語言</span>
          <select
            class="sq-select"
            :value="settings.sourceLanguage"
            @change="onSourceLanguageChange"
            data-testid="source-language-select"
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
        <div class="sq-row">
          <span class="sq-label">目標語言</span>
          <select
            class="sq-select"
            :value="settings.targetLanguage"
            @change="onTargetLanguageChange"
            data-testid="target-language-select"
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

      <!-- Active Translation Provider Card -->
      <div class="provider-card" data-testid="active-provider-card">
        <div class="sq-row">
          <span class="sq-label">
            <svg class="row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            翻譯服務
          </span>
          <select
            class="sq-select"
            :value="settings.activeProviderId"
            @change="onProviderChange"
            data-testid="popup-provider-select"
          >
            <option value="google-provider">Google 翻譯 (免金鑰)</option>
            <option value="gemini-provider">Google Gemini AI</option>
            <option value="deepl-provider">DeepL 翻譯</option>
            <option value="chrome-builtin-ai-provider">Chrome 內建 AI</option>
            <option value="ollama-provider">Ollama 本機端</option>
            <option value="local-http-provider">自訂 HTTP API</option>
          </select>
        </div>
        <div class="provider-status-row">
          <span :class="['provider-status-pill', providerStatusClass]">
            {{ activeProviderDetail }}
          </span>
          <button v-if="needsApiKeySetup" class="provider-config-btn" @click="openOptions">
            設定金鑰 ➔
          </button>
        </div>
      </div>

      <!-- Quick enable toggle (settings live in the full options page) -->
      <div class="quick-toggle">
        <span class="quick-toggle-label">
          <svg class="row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          {{ settings.enabled ? '翻譯已啟用' : '翻譯已暫停' }}
        </span>
        <label class="toggle">
          <input
            type="checkbox"
            :checked="settings.enabled"
            @change="onToggleEnabled"
            data-testid="popup-toggle-enabled"
          />
          <span class="slider"></span>
        </label>
      </div>

      <!-- Subtitle panel (Netflix / YouTube tabs) — one compact card -->
      <div v-if="isSubtitleTab" class="subtitle-quick-settings" data-testid="subtitle-quick-settings">
        <div class="sq-head">
          <span class="sq-head-title">
            <svg class="row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2" y="4" width="20" height="16" rx="3" /><path d="M7 9l4 3-4 3zM13 15h5" />
            </svg>
            {{ isNetflixTab ? 'Netflix 字幕' : 'YouTube 字幕' }}
          </span>
          <span v-if="isNetflixTab" :class="['sq-status', netflixHud.isActive ? 'ok' : 'muted']" data-testid="netflix-summary">
            {{ netflixHud.isActive ? (netflixHud.dualTrack ? '雙軌已對齊' : '執行中') : '未啟用' }}
          </span>
          <span v-else-if="isYouTubeTab" :class="['sq-status', ytActive ? 'ok' : 'muted']" data-testid="youtube-summary">
            {{ ytActive ? '雙語字幕運行中' : '未啟用' }}
          </span>
        </div>

        <button
          :class="['sq-main-toggle', { active: subtitleActive }]"
          @click="toggleSubtitles"
          data-testid="subtitle-toggle"
        >
          <svg v-if="!subtitleActive" class="btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11-6.86a1.04 1.04 0 0 0 0-1.76l-11-6.86A1.04 1.04 0 0 0 8 5.14z" />
          </svg>
          <svg v-else class="btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          {{ subtitleActive ? '關閉雙語字幕' : '開啟雙語字幕' }}
        </button>

        <div v-if="isNetflixTab" class="sq-row">
          <span class="sq-label">學習模式（逐句暫停・點詞查詢）</span>
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

        <div v-if="isNetflixTab" class="sq-row">
          <span class="sq-label">字幕來源</span>
          <select
            class="sq-select"
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

        <div v-if="isYouTubeTab && ytTracks.length > 0" class="sq-row">
          <span class="sq-label">字幕來源</span>
          <select
            class="sq-select"
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

        <div class="sq-row">
          <span class="sq-label">原文字幕 {{ settings.subtitleOriginalFontSize }}px</span>
          <input
            type="range" min="12" max="32" step="1"
            :value="settings.subtitleOriginalFontSize"
            @input="onSubtitleSizeChange('subtitleOriginalFontSize', $event)"
            data-testid="popup-orig-size-slider"
          />
        </div>

        <div class="sq-row">
          <span class="sq-label">譯文字幕 {{ settings.subtitleTranslatedFontSize }}px</span>
          <input
            type="range" min="14" max="40" step="1"
            :value="settings.subtitleTranslatedFontSize"
            @input="onSubtitleSizeChange('subtitleTranslatedFontSize', $event)"
            data-testid="popup-trans-size-slider"
          />
        </div>

        <div v-if="isYouTubeTab" class="sq-hint" style="font-size: 11px; color: var(--text-muted); line-height: 1.5; padding-top: 6px;">
          💡 <b>提示</b>：需開啟影片底部的「CC 字幕」。若兩行皆顯示中文，請至播放器右下角「⚙️ 設定 ➔ 字幕」切換為「原文語言」（如日語），勿選取「自動翻譯」。
        </div>
      </div>

      <div v-if="isGeminiUnconfigured" class="warning-banner" data-testid="gemini-unconfigured-banner">
        <span>Gemini API Key 未設定，請至設定頁面設定 API Key。</span>
        <button class="link-btn" @click="openOptions">前往設定</button>
      </div>

      <div v-if="!isSubtitleTab" class="selection-hint" data-testid="selection-hint">
        反白選取文字即可劃詞翻譯；右鍵選單也有「翻譯這個分頁／選取文字」
      </div>

      <div v-if="!isSubtitleTab" class="action-buttons">
        <button
          class="btn btn-primary"
          :disabled="isLoading || !settings.enabled || isGeminiUnconfigured"
          @click="translateCurrentPage"
          data-testid="translate-page-btn"
        >
          <span v-if="isTranslating" class="spinner"></span>
          {{ isTranslating ? '翻譯中...' : '翻譯目前頁面' }}
        </button>

        <button
          class="btn btn-secondary"
          :disabled="isLoading || !settings.enabled"
          @click="restorePage"
          data-testid="restore-page-btn"
        >
          <span v-if="isRestoring" class="spinner"></span>
          {{ isRestoring ? '還原中...' : '還原頁面' }}
        </button>
      </div>

      <div v-if="errorMessage" class="error-banner" data-testid="error-banner">
        <span>{{ errorMessage }}</span>
      </div>

      <div v-if="statusMessage" class="status-banner" data-testid="status-banner">
        <span>{{ statusMessage }}</span>
      </div>
    </div>

    <footer class="popup-footer">
      <button class="open-settings-btn" @click="openOptions" data-testid="options-link-btn">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        開啟完整設定
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { extensionBridge } from '@/infrastructure/messaging/extension-bridge';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import ThemeToggle from '@/components/ThemeToggle.vue';
import { useNetflixSession } from '@/core/session/subtitle-session-store';

const settings = ref({
  enabled: true,
  sourceLanguage: 'auto',
  targetLanguage: 'zh-Hant',
  activeProviderId: 'google-provider',
  hasGeminiApiKey: false,
  geminiModel: 'gemini-3.5-flash',
  hasDeeplApiKey: false,
  deeplApiIsPro: false,
  subtitleOriginalFontSize: 18,
  subtitleTranslatedFontSize: 22,
});

const theme = ref<'light' | 'dark' | 'system'>('system');
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

const netflixSource = computed<'auto' | 'ai'>(() =>
  netflixHud.value.selectionMode === 'manual' && netflixHud.value.selectedTrackId === 'ai-translate'
    ? 'ai'
    : 'auto',
);

// Keep the toggle honest once the tab reports its real state.
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

const providerStatusClass = computed(() => {
  if (needsApiKeySetup.value) return 'warn';
  return 'ok';
});

const activeProviderDetail = computed(() => {
  switch (settings.value.activeProviderId) {
    case 'gemini-provider':
      return settings.value.hasGeminiApiKey
        ? `🟢 Gemini (${settings.value.geminiModel || 'gemini-3.5-flash'})`
        : `⚠️ Gemini 尚未設定金鑰`;
    case 'deepl-provider':
      return settings.value.hasDeeplApiKey
        ? `🟢 DeepL (${settings.value.deeplApiIsPro ? 'Pro' : 'Free'})`
        : `⚠️ DeepL 尚未設定金鑰`;
    case 'chrome-builtin-ai-provider':
      return '🧠 Chrome 內建本機 AI';
    case 'ollama-provider':
      return '🖥️ Ollama (本機端)';
    case 'local-http-provider':
      return '🌐 自訂 HTTP API';
    case 'google-provider':
    default:
      return '⚡ Google 翻譯 (免金鑰・預設)';
  }
});

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
    const current = (await SettingsStorage.get()).netflix ?? { enabled: true, primarySize: 18, secondarySize: 22, bottomPosition: 80, lineSpacing: 4, enableBitmapRescue: true, learningMode: true };
    await SettingsStorage.set({ netflix: { ...current, learningMode: enabled } });
    // The content script applies it via SettingsStorage.watch.
  } catch {
    errorMessage.value = '無法更新學習模式設定';
  }
}

async function setSubtitleSource(source: 'auto' | 'ai' | 'track', trackId?: string) {
  try {
    const tabId = await extensionBridge.queryActiveTabId();
    if (!tabId) return;
    await extensionBridge.sendTabCommand(tabId, { type: 'SET_NETFLIX_SELECTION', source, trackId });
    // Optimistic UI; the 1s HUD poll reconciles with the tab's real state.
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
      // Fallback only if queryActiveTabUrl is unavailable
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
      settings.value.hasGeminiApiKey = Boolean(s.hasGeminiApiKey || s.geminiApiKey);
      settings.value.geminiModel = s.geminiModel || 'gemini-3.5-flash';
      settings.value.hasDeeplApiKey = Boolean(s.deeplApiKey);
      settings.value.deeplApiIsPro = Boolean(s.deeplApiIsPro);
      settings.value.subtitleOriginalFontSize = s.subtitleOriginalFontSize ?? 18;
      settings.value.subtitleTranslatedFontSize = s.subtitleTranslatedFontSize ?? 22;
    }
  } catch (err) {
    loggerWarn('Failed to initialize popup settings:', err);
  }
});

function loggerWarn(...args: any[]) {
  console.warn('[Popup]', ...args);
}

function onSettingsPartialUpdate(partial: Record<string, any>) {
  settings.value = { ...settings.value, ...partial };
}

async function save() {
  try {
    await SettingsStorage.set({
      enabled: settings.value.enabled,
      sourceLanguage: settings.value.sourceLanguage,
      targetLanguage: settings.value.targetLanguage,
      activeProviderId: settings.value.activeProviderId,
    });
  } catch (err) {
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
/* Compact by design: popup fits comfortably within extension bounds */
.popup {
  width: 360px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-ui, system-ui, -apple-system, 'Segoe UI', sans-serif);
  overflow: hidden;
  box-shadow: var(--card-shadow);
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px 8px;
  background: var(--bg-primary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  background: linear-gradient(135deg, var(--primary-accent), #0ea5e9);
  color: #ffffff;
  font-weight: 800;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: var(--radius-xs, 4px);
  letter-spacing: 0.8px;
  box-shadow: 0 2px 6px var(--primary-glow);
}

.row-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.popup-header h1 {
  font-size: 14px;
  margin: 0;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.popup-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 14px 12px;
}

/* ── Cards & Containers ───────────────────────────────────────── */
.language-card,
.provider-card,
.quick-toggle,
.subtitle-quick-settings {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--card-rim-light);
  border-radius: var(--radius-md, 10px);
  transition: border-color 0.18s ease;
}

.language-card:hover,
.provider-card:hover,
.quick-toggle:hover,
.subtitle-quick-settings:hover {
  border-color: rgba(20, 184, 166, 0.35);
}

.language-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
}

.provider-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
}

.provider-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 2px;
}

.provider-status-pill {
  font-size: 11px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.provider-status-pill.ok {
  color: var(--text-secondary);
}

.provider-status-pill.warn {
  color: #f59e0b;
  font-weight: 600;
}

.provider-config-btn {
  background: transparent;
  border: none;
  color: var(--primary-accent);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 4px;
  text-decoration: underline;
  transition: opacity 0.15s ease;
}

.provider-config-btn:hover {
  opacity: 0.8;
}

.quick-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
}

.quick-toggle-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* ── Subtitle Quick Settings ──────────────────────────────────── */
.subtitle-quick-settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 11px 12px;
}

.sq-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--primary-accent);
}

.sq-head-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sq-head .sq-status {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--radius-full);
}

.sq-head .sq-status.ok {
  background: var(--accent-badge-bg);
  color: var(--accent-badge-text);
}

.sq-head .sq-status.muted {
  background: var(--border-color);
  color: var(--text-muted);
}

.sq-main-toggle {
  width: 100%;
  padding: 8px 0;
  border: none;
  border-radius: var(--radius-sm, 8px);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: linear-gradient(135deg, var(--primary-accent), #0d9488);
  color: #ffffff;
  box-shadow: 0 2px 8px var(--primary-glow);
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.sq-main-toggle:hover {
  filter: brightness(1.08);
  box-shadow: 0 4px 12px var(--primary-glow);
}

.sq-main-toggle.active {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  box-shadow: none;
}

.sq-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}

.sq-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.sq-select {
  font-size: 12px;
  padding: 5px 28px 5px 10px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--border-color);
  background-color: var(--bg-input);
  color: var(--text-primary);
  font-family: inherit;
  width: auto;
  max-width: 170px;
}

.sq-row input[type='range'] {
  width: 130px;
}

/* ── Banners & Notifications ──────────────────────────────────── */
.link-btn {
  background: none;
  border: none;
  color: var(--primary-accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 0 0;
  text-align: left;
}

.link-btn:hover {
  text-decoration: underline;
}

.warning-banner,
.error-banner,
.status-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  border-radius: var(--radius-sm, 8px);
  font-size: 12px;
  line-height: 1.4;
}

.selection-hint {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-secondary);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-sm, 8px);
  padding: 8px 11px;
  line-height: 1.4;
}

.warning-banner {
  background: var(--warning-bg);
  color: var(--warning-text);
  border: 1px solid rgba(251, 191, 36, 0.25);
}

.error-banner {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid rgba(248, 113, 113, 0.25);
}

.status-banner {
  background: var(--accent-badge-bg);
  color: var(--accent-badge-text);
  border: 1px solid rgba(20, 184, 166, 0.25);
}

/* ── Action Buttons ───────────────────────────────────────────── */
.action-buttons {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.btn {
  flex: 1;
  padding: 9px 12px;
  border-radius: var(--radius-sm, 8px);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

.btn:active:not(:disabled) {
  transform: scale(0.97);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, var(--primary-accent), #0d9488);
  color: #ffffff;
  box-shadow: 0 2px 8px var(--primary-glow);
}

.btn-primary:not(:disabled):hover {
  background: linear-gradient(135deg, var(--primary-hover), var(--primary-accent));
  box-shadow: 0 4px 14px var(--primary-glow);
}

.btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  box-shadow: var(--card-rim-light);
}

.btn-secondary:not(:disabled):hover {
  background: var(--bg-input);
  border-color: var(--text-muted);
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.btn-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Footer ───────────────────────────────────────────────────── */
.popup-footer {
  padding: 10px 14px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
}

.popup-footer .open-settings-btn {
  width: 100%;
  padding: 8px 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 8px);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.popup-footer .open-settings-btn:hover {
  background: var(--bg-input);
  border-color: var(--primary-accent);
  color: var(--primary-accent);
}
</style>

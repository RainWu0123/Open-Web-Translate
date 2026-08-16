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
      <!-- Quick enable toggle (settings live in the full options page) -->
      <div class="quick-toggle">
        <span class="quick-toggle-label">🌐 {{ settings.enabled ? '翻譯已啟用' : '翻譯已暫停' }}</span>
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
          🎬 {{ isNetflixTab ? 'Netflix 字幕' : 'YouTube 字幕' }}
          <span v-if="isNetflixTab" :class="['sq-status', netflixHud.isActive ? 'ok' : 'muted']" data-testid="netflix-summary">
            {{ netflixHud.isActive ? (netflixHud.dualTrack ? '雙軌已對齊' : '執行中') : '未啟用' }}
          </span>
        </div>

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

        <div class="sq-row">
          <span class="sq-label">雙語字幕語言</span>
          <select
            class="sq-select"
            :value="settings.targetLanguage"
            @change="onTargetLanguageChange"
            data-testid="subtitle-language-select"
          >
            <option value="zh-Hant">繁體中文</option>
            <option value="zh-Hans">简体中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
            <option value="es">Español</option>
          </select>
        </div>

        <div v-if="isNetflixTab" class="sq-row">
          <span class="sq-label">字幕來源</span>
          <div class="sq-segment" data-testid="subtitle-source-segment">
            <button
              :class="['sq-seg-btn', { active: netflixSource !== 'ai' }]"
              @click="setSubtitleSource('auto')"
              data-testid="subtitle-source-auto"
            >自動（優先原生）</button>
            <button
              :class="['sq-seg-btn', { active: netflixSource === 'ai' }]"
              @click="setSubtitleSource('ai')"
              data-testid="subtitle-source-ai"
            >僅 AI / 機翻</button>
          </div>
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
      </div>

      <div v-if="isGeminiUnconfigured" class="warning-banner" data-testid="gemini-unconfigured-banner">
        <span>⚠️ Gemini API Key 未設定，請至設定頁面設定 API Key。</span>
        <button class="link-btn" @click="openOptions">⚙ 前往設定</button>
      </div>

      <div v-if="!isSubtitleTab" class="selection-hint" data-testid="selection-hint">
        💡 反白選取文字即可劃詞翻譯；右鍵選單也有「翻譯這個分頁／選取文字」
      </div>

      <div v-if="!isNetflixTab" class="action-buttons">
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
        <span>⚠️ {{ errorMessage }}</span>
      </div>

      <div v-if="statusMessage" class="status-banner" data-testid="status-banner">
        <span>ℹ️ {{ statusMessage }}</span>
      </div>
    </div>

    <footer class="popup-footer">
      <button class="open-settings-btn" @click="openOptions" data-testid="options-link-btn">
        ⚙ 開啟完整設定
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
  targetLanguage: 'zh-Hant',
  activeProviderId: 'mock-provider',
  hasGeminiApiKey: false,
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

function onTargetLanguageChange(e: Event) {
  settings.value.targetLanguage = (e.target as HTMLSelectElement).value;
  save();
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

async function setSubtitleSource(source: 'auto' | 'ai') {
  try {
    const tabId = await extensionBridge.queryActiveTabId();
    if (!tabId) return;
    await extensionBridge.sendTabMessage(tabId, { type: 'SET_NETFLIX_SELECTION', source });
    // Optimistic UI; the 1s HUD poll reconciles with the tab's real state.
    netflixHud.value = {
      ...netflixHud.value,
      selectionMode: source === 'ai' ? 'manual' : 'auto',
      selectedTrackId: source === 'ai' ? 'ai-translate' : netflixHud.value.selectedTrackId,
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
    if (url?.includes('youtube.com')) {
      isYouTubeTab.value = true;
    }

    const tabId = await extensionBridge.queryActiveTabId();
    if (tabId) {
      const state = await extensionBridge.sendTabMessage<{ primaryStatus?: string }>(tabId, { type: 'GET_NETFLIX_STATE' });
      if (state) {
        isNetflixTab.value = true;
      }
    }

    const s = await SettingsStorage.get();
    if (s) {
      learningMode.value = s.netflix?.learningMode ?? true;
      settings.value.enabled = s.enabled;
      settings.value.targetLanguage = s.targetLanguage;
      settings.value.activeProviderId = s.activeProviderId || 'mock-provider';
      settings.value.hasGeminiApiKey = Boolean(s.hasGeminiApiKey);
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
/* Compact by design: the popup must fit without scrolling at ~600px.*/
/* All colors come from src/assets/styles/tokens.css (--bg-*, --text-*,
   --primary-accent...) so light/dark themes stay consistent with the
   options page. */

.popup {
  width: 360px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--card-shadow);
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px 6px;
  background: var(--bg-primary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  background: linear-gradient(135deg, var(--primary-accent), #8b5cf6);
  color: white;
  font-weight: 800;
  font-size: 11px;
  padding: 4px 7px;
  border-radius: 7px;
  letter-spacing: 0.5px;
}

.popup-header h1 {
  font-size: 14px;
  margin: 0;
  font-weight: 700;
}

.popup-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px 12px 10px;
}

/* ── Quick toggle ─────────────────────────────────────────────── */
.quick-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.quick-toggle-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle .slider {
  position: absolute;
  inset: 0;
  background: var(--border-color);
  border-radius: 999px;
  transition: background 0.2s ease;
  cursor: pointer;
}

.toggle .slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

.toggle input:checked + .slider {
  background: var(--primary-accent);
}

.toggle input:checked + .slider::before {
  transform: translateX(20px);
}

/* ── Subtitle quick settings ───────────────────────────────────── */
.subtitle-quick-settings {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.sq-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--primary-accent);
}

.sq-head .sq-status {
  font-size: 11px;
  font-weight: 600;
}

.sq-head .sq-status.ok {
  color: var(--accent-badge-text);
}

.sq-head .sq-status.muted {
  color: var(--text-muted);
}

.sq-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-height: 26px;
}

.sq-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.sq-select {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-primary);
}

.sq-segment {
  display: flex;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.sq-seg-btn {
  font-size: 11px;
  font-weight: 600;
  padding: 5px 8px;
  border: none;
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
}

.sq-seg-btn.active {
  background: var(--primary-accent);
  color: #fff;
}

.sq-row input[type='range'] {
  width: 130px;
  accent-color: var(--primary-accent);
}

/* ── Banners & links ──────────────────────────────────────────── */
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
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.35;
}

.selection-hint {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-secondary);
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  padding: 7px 10px;
  line-height: 1.4;
}

.warning-banner {
  background: var(--warning-bg);
  color: var(--warning-text);
}

.error-banner {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.status-banner {
  background: var(--accent-badge-bg);
  color: var(--accent-badge-text);
}

/* ── Action buttons ───────────────────────────────────────────── */
.action-buttons {
  display: flex;
  gap: 8px;
}

.btn {
  flex: 1;
  padding: 8px 10px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--primary-accent);
  color: #fff;
}

.btn-primary:not(:disabled):hover {
  background: var(--primary-hover);
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-secondary:not(:disabled):hover {
  background: var(--bg-input);
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Footer ───────────────────────────────────────────────────── */
.popup-footer {
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
}

.popup-footer .open-settings-btn {
  width: 100%;
  padding: 8px 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.popup-footer .open-settings-btn:hover {
  background: var(--bg-input);
  border-color: var(--primary-accent);
  color: var(--primary-accent);
}
</style>

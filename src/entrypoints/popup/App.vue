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

      <!-- Netflix context summary -->
      <div v-if="isNetflixTab" class="netflix-summary" data-testid="netflix-summary">
        <div class="netflix-summary-head">🎬 Netflix 雙語字幕</div>
        <div class="netflix-summary-row">
          <span>狀態</span>
          <span :class="netflixHud.isActive ? 'ok' : 'muted'">
            {{ netflixHud.isActive ? '執行中' : '未啟用（點播放器上的 OWT 按鈕）' }}
          </span>
        </div>
        <div class="netflix-summary-row">
          <span>偵測軌道</span>
          <span>{{ netflixHud.discoveredTracksCount }}</span>
        </div>
        <div class="netflix-summary-row">
          <span>運作模式</span>
          <span>{{ netflixHud.modeLabel }}</span>
        </div>
        <button class="link-btn" @click="openOptions" data-testid="netflix-open-subtitle-settings">
          ⚙ 前往字幕設定
        </button>
      </div>

      <div v-if="isGeminiUnconfigured" class="warning-banner" data-testid="gemini-unconfigured-banner">
        <span>⚠️ Gemini API Key 未設定，請至設定頁面設定 API Key。</span>
        <button class="link-btn" @click="openOptions">⚙ 前往設定</button>
      </div>

      <div class="action-buttons">
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
import { ref, onMounted, computed } from 'vue';
import { extensionBridge } from '@/infrastructure/messaging/extension-bridge';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import ThemeToggle from '@/components/ThemeToggle.vue';
import { useNetflixSession } from '@/core/session/subtitle-session-store';

const settings = ref({
  enabled: true,
  targetLanguage: 'zh-Hant',
  activeProviderId: 'mock-provider',
  hasGeminiApiKey: false,
});

const theme = ref<'light' | 'dark' | 'system'>('system');
const isTranslating = ref(false);
const isRestoring = ref(false);
const isLoading = computed(() => isTranslating.value || isRestoring.value);

const isNetflixTab = ref(false);
const { hudInfo: netflixHud } = useNetflixSession();

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
    const tabId = await extensionBridge.queryActiveTabId();
    if (tabId) {
      const state = await extensionBridge.sendTabMessage<{ primaryStatus?: string }>(tabId, { type: 'GET_NETFLIX_STATE' });
      if (state) {
        isNetflixTab.value = true;
      }
    }

    const s = await messageRouter.sendMessage({ type: 'GET_SETTINGS' });
    if (s) {
      settings.value.enabled = s.enabled;
      settings.value.targetLanguage = s.targetLanguage;
      settings.value.activeProviderId = s.activeProviderId || 'mock-provider';
      settings.value.hasGeminiApiKey = Boolean(s.hasGeminiApiKey);
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
    await messageRouter.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: {
        enabled: settings.value.enabled,
        targetLanguage: settings.value.targetLanguage,
        activeProviderId: settings.value.activeProviderId,
      },
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
.popup {
  width: 360px;
  background: var(--owt-bg-primary, #0f172a);
  color: var(--owt-text-primary, #f8fafc);
  font-family: system-ui, -apple-system, sans-serif;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--owt-bg-secondary, #1e293b);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  color: white;
  font-weight: 800;
  font-size: 11px;
  padding: 3px 6px;
  border-radius: 6px;
}

.popup-header h1 {
  font-size: 14px;
  margin: 0;
  font-weight: 700;
}

.quick-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  background: var(--owt-bg-card, #fff);
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}

.quick-toggle-label {
  font-size: 14px;
  font-weight: 500;
  color: #111827;
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
  background: #d1d5db;
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
  background: #4f46e5;
}

.toggle input:checked + .slider::before {
  transform: translateX(20px);
}

.netflix-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: rgba(99, 102, 241, 0.06);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: 12px;
}

.netflix-summary-head {
  font-size: 13px;
  font-weight: 700;
  color: #4f46e5;
  margin-bottom: 2px;
}

.netflix-summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #6b7280;
}

.netflix-summary-row .ok {
  color: #059669;
  font-weight: 600;
}

.netflix-summary-row .muted {
  color: #9ca3af;
}

.tab-bar {
  display: flex;
  background: #1e293b;
  padding: 4px 12px;
  gap: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.tab-bar button {
  flex: 1;
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 6px 0;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.tab-bar button.active {
  color: #38bdf8;
  border-bottom-color: #38bdf8;
}

.popup-body {
  display: flex;
  flex-direction: column;
  gap: 12px;

  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.btn {
  flex: 1;
  padding: 8px 12px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-secondary {
  background: #334155;
  color: #e2e8f0;
}

.popup-footer {
  padding: 10px 16px;
  background: #1e293b;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.popup-footer .open-settings-btn {
  width: 100%;
  padding: 10px 0;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.popup-footer .open-settings-btn:hover {
  background: #e5e7eb;
}
</style>

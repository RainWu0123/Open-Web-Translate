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
      <DisplaySettings
        compact
        :settings="settings"
        @update:settings="onSettingsPartialUpdate"
        @change="save"
      />

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

      <div class="status">
        <span :class="settings.enabled ? 'dot active' : 'dot'"></span>
        {{ settings.enabled ? 'Active' : 'Paused' }}
      </div>
    </div>

    <footer class="popup-footer">
      <button @click="openOptions" data-testid="options-link-btn">⚙ Settings</button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { browser } from 'wxt/browser';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import DisplaySettings from '@/components/DisplaySettings.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';

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

const isGeminiUnconfigured = computed(() => {
  return settings.value.activeProviderId === 'gemini-provider' && !settings.value.hasGeminiApiKey;
});

const errorMessage = ref('');
const statusMessage = ref('');

onMounted(async () => {
  try {
    const s = await messageRouter.sendMessage({ type: 'GET_SETTINGS' });
    if (s) {
      settings.value.enabled = s.enabled;
      settings.value.targetLanguage = s.targetLanguage;
      settings.value.activeProviderId = s.activeProviderId || 'mock-provider';
      settings.value.hasGeminiApiKey = Boolean(s.hasGeminiApiKey);
    }
  } catch (e) {
    console.error('Failed to load settings', e);
  }
});

function onSettingsPartialUpdate(updated: Partial<typeof settings.value>) {
  Object.assign(settings.value, updated);
  save();
}

async function save() {
  try {
    await messageRouter.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: {
        enabled: settings.value.enabled,
        targetLanguage: settings.value.targetLanguage,
      },
    });
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}

async function translateCurrentPage() {
  errorMessage.value = '';
  statusMessage.value = '';
  isTranslating.value = true;

  try {
    const res = await messageRouter.sendMessage({ type: 'TRANSLATE_ACTIVE_TAB' });
    if (!res || !res.success) {
      errorMessage.value = res?.error?.message || '翻譯失敗';
    } else {
      statusMessage.value = `成功翻譯 ${res.translatedCount ?? 0} 個區塊`;
    }
  } catch (err: any) {
    errorMessage.value = err?.message || '傳送翻譯請求失敗';
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
    if (!res || !res.success) {
      errorMessage.value = res?.error?.message || '還原失敗';
    } else {
      statusMessage.value = `已還原 ${res.restoredCount ?? 0} 個區塊`;
    }
  } catch (err: any) {
    errorMessage.value = err?.message || '傳送還原請求失敗';
  } finally {
    isRestoring.value = false;
  }
}

function openOptions() {
  browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
}
</script>

<style scoped>
.popup {
  width: 320px;
  background-color: var(--bg-secondary, #1e293b);
  color: var(--text-primary, #f8fafc);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color, #334155);
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  background: rgba(255, 255, 255, 0.2);
  padding: 4px 10px;
  border-radius: 8px;
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 1px;
  color: #fff;
}

.popup-header h1 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}

.popup-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.warning-banner {
  background: var(--warning-bg, rgba(245, 158, 11, 0.15));
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: var(--warning-text, #fbbf24);
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.link-btn {
  align-self: flex-end;
  background: transparent;
  border: none;
  color: var(--primary-accent, #3b82f6);
  cursor: pointer;
  font-size: 11px;
  text-decoration: underline;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background-color: var(--primary-accent, #2563eb);
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--primary-hover, #1d4ed8);
}

.btn-secondary {
  background-color: var(--bg-input, #0f172a);
  border: 1px solid var(--border-color, #334155);
  color: var(--text-secondary, #cbd5e1);
}

.btn-secondary:hover:not(:disabled) {
  background-color: var(--border-color, #334155);
  color: var(--text-primary, #f8fafc);
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #ffffff;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-banner {
  background: var(--danger-bg, rgba(239, 68, 68, 0.15));
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: var(--danger-text, #fca5a5);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
}

.status-banner {
  background: var(--accent-badge-bg, rgba(16, 185, 129, 0.15));
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: var(--accent-badge-text, #6ee7b7);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted, #888);
  padding-top: 4px;
  border-top: 1px solid var(--border-color, #334155);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  transition: background 0.3s;
}

.dot.active {
  background: #10b981;
}

.popup-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-color, #334155);
  text-align: center;
}

.popup-footer button {
  background: transparent;
  color: var(--primary-accent, #3b82f6);
  border: 1px solid var(--primary-accent, #3b82f6);
  padding: 6px 18px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
}

.popup-footer button:hover {
  background: var(--primary-accent, #3b82f6);
  color: #fff;
}
</style>

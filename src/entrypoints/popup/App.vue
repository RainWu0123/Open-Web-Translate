<template>
  <div class="popup" data-testid="popup-page">
    <header class="popup-header">
      <div class="header-left">
        <div class="logo">OWT</div>
        <h1>Open Web Translate</h1>
      </div>
      <ThemeToggle compact v-model="theme" />
    </header>

    <div v-if="isNetflixTab" class="tab-bar">
      <button :class="{ active: activeMode === 'netflix' }" @click="activeMode = 'netflix'">
        🎬 Netflix 雙語字幕
      </button>
      <button :class="{ active: activeMode === 'general' }" @click="activeMode = 'general'">
        🌐 一般網頁翻譯
      </button>
    </div>

    <div class="popup-body">
      <template v-if="isNetflixTab && activeMode === 'netflix'">
        <NetflixSubtitleConfigCard />
      </template>

      <template v-else>
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
      </template>
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
import NetflixSubtitleConfigCard from '@/components/NetflixSubtitleConfigCard.vue';
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

const isNetflixTab = ref(false);
const activeMode = ref<'netflix' | 'general'>('netflix');

const isGeminiUnconfigured = computed(() => {
  return settings.value.activeProviderId === 'gemini-provider' && !settings.value.hasGeminiApiKey;
});

const errorMessage = ref('');
const statusMessage = ref('');

onMounted(async () => {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentUrl = tabs[0]?.url || '';
    if (currentUrl.includes('netflix.com')) {
      isNetflixTab.value = true;
      activeMode.value = 'netflix';
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
  if (browser.runtime.openOptionsPage) {
    browser.runtime.openOptionsPage();
  } else {
    window.open(browser.runtime.getURL('/options.html'));
  }
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

.popup-footer button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
}
</style>

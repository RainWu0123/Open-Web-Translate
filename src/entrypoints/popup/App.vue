<template>
  <div class="popup">
    <header class="popup-header">
      <div class="logo">OWT</div>
      <h1>Open Web Translate</h1>
    </header>

    <div class="popup-body">
      <div class="setting-row">
        <span class="label">Translation</span>
        <label class="toggle">
          <input type="checkbox" v-model="settings.enabled" @change="save" />
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <span class="label">Target</span>
        <select v-model="settings.targetLanguage" @change="save">
          <option value="en">English</option>
          <option value="zh-Hant">繁體中文</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="es">Español</option>
        </select>
      </div>

      <div v-if="isGeminiUnconfigured" class="warning-banner">
        <span>⚠️ Gemini API Key 未設定，請至設定頁面設定 API Key。</span>
        <button class="link-btn" @click="openOptions">⚙ 前往設定</button>
      </div>

      <div class="action-buttons">
        <button
          class="btn btn-primary"
          :disabled="isLoading || !settings.enabled || isGeminiUnconfigured"
          @click="translateCurrentPage"
        >
          <span v-if="isTranslating" class="spinner"></span>
          {{ isTranslating ? '翻譯中...' : '翻譯目前頁面' }}
        </button>

        <button
          class="btn btn-secondary"
          :disabled="isLoading || !settings.enabled"
          @click="restorePage"
        >
          <span v-if="isRestoring" class="spinner"></span>
          {{ isRestoring ? '還原中...' : '還原頁面' }}
        </button>
      </div>

      <div v-if="errorMessage" class="error-banner">
        <span>⚠️ {{ errorMessage }}</span>
      </div>

      <div v-if="statusMessage" class="status-banner">
        <span>ℹ️ {{ statusMessage }}</span>
      </div>

      <div class="status">
        <span :class="settings.enabled ? 'dot active' : 'dot'"></span>
        {{ settings.enabled ? 'Active' : 'Paused' }}
      </div>
    </div>

    <footer class="popup-footer">
      <button @click="openOptions">⚙ Settings</button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { browser } from 'wxt/browser';
import { messageRouter } from '@/infrastructure/messaging/message-router';

const settings = ref({
  enabled: true,
  targetLanguage: 'zh-Hant',
  activeProviderId: 'mock-provider',
  hasGeminiApiKey: false,
});

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
  background: #1a1a2e;
  color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  border-radius: 12px;
  overflow: hidden;
}

.popup-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.logo {
  background: rgba(255, 255, 255, 0.2);
  padding: 4px 10px;
  border-radius: 8px;
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 1px;
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

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label {
  font-size: 13px;
  color: #aaa;
}

/* Toggle switch */
.toggle { position: relative; width: 44px; height: 24px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute; inset: 0;
  background: #444;
  border-radius: 24px;
  transition: 0.3s;
  cursor: pointer;
}
.slider::before {
  content: '';
  position: absolute;
  width: 18px; height: 18px;
  left: 3px; bottom: 3px;
  background: #ccc;
  border-radius: 50%;
  transition: 0.3s;
}
.toggle input:checked + .slider { background: #667eea; }
.toggle input:checked + .slider::before {
  transform: translateX(20px);
  background: #fff;
}

select {
  background: #16213e;
  color: #e0e0e0;
  border: 1px solid #334;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.warning-banner {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #fbbf24;
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
  color: #667eea;
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
  background: #667eea;
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  background: #5a67d8;
}

.btn-secondary {
  background: #334155;
  color: #cbd5e1;
}

.btn-secondary:hover:not(:disabled) {
  background: #475569;
  color: #ffffff;
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
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
}

.status-banner {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
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
  color: #888;
  padding-top: 4px;
  border-top: 1px solid #222;
}

.dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #f44;
  transition: background 0.3s;
}
.dot.active { background: #4caf50; }

.popup-footer {
  padding: 12px 20px;
  border-top: 1px solid #222;
  text-align: center;
}

.popup-footer button {
  background: transparent;
  color: #667eea;
  border: 1px solid #667eea;
  padding: 6px 18px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
}
.popup-footer button:hover {
  background: #667eea;
  color: #fff;
}
</style>

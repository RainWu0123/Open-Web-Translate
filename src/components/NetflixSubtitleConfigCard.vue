<template>
  <div class="netflix-config-card" data-testid="netflix-subtitle-config-card">
    <div class="card-header">
      <div class="header-status">
        <span :class="['status-badge', config.enabled ? 'active' : 'inactive']">
          {{ config.enabled ? '運行中' : '已停用' }}
        </span>
      </div>
      <button class="toggle-btn" :class="{ active: config.enabled }" @click="toggleEnabled">
        {{ config.enabled ? '停用' : '開啟' }}
      </button>
    </div>

    <div class="sliders-section">
      <div class="slider-group">
        <div class="slider-label">
          <span>主字幕大小</span>
          <span class="value-text">{{ config.primarySize }}px</span>
        </div>
        <input
          type="range"
          min="12"
          max="48"
          v-model.number="config.primarySize"
          @input="onConfigChange"
          data-testid="primary-size-slider"
        />
      </div>

      <div class="slider-group">
        <div class="slider-label">
          <span>副字幕大小</span>
          <span class="value-text">{{ config.secondarySize }}px</span>
        </div>
        <input
          type="range"
          min="12"
          max="48"
          v-model.number="config.secondarySize"
          @input="onConfigChange"
          data-testid="secondary-size-slider"
        />
      </div>

      <div class="slider-group">
        <div class="slider-label">
          <span>字幕位置</span>
          <span class="value-text">{{ config.bottomPosition }}px</span>
        </div>
        <input
          type="range"
          min="20"
          max="300"
          v-model.number="config.bottomPosition"
          @input="onConfigChange"
          data-testid="bottom-position-slider"
        />
      </div>

      <div class="slider-group">
        <div class="slider-label">
          <span>字幕間距</span>
          <span class="value-text">{{ config.lineSpacing }}px</span>
        </div>
        <input
          type="range"
          min="0"
          max="40"
          v-model.number="config.lineSpacing"
          @input="onConfigChange"
          data-testid="line-spacing-slider"
        />
      </div>
    </div>

    <div class="options-section">
      <label class="checkbox-label">
        <input
          type="checkbox"
          v-model="config.enableBitmapRescue"
          @change="onConfigChange"
          data-testid="bitmap-rescue-checkbox"
        />
        <span>使用圖片字幕自動救援</span>
      </label>

      <label class="checkbox-label">
        <input
          type="checkbox"
          v-model="config.learningMode"
          @change="onConfigChange"
          data-testid="learning-mode-checkbox"
        />
        <span>學習模式</span>
      </label>
    </div>

    <div class="hotkeys-guide">
      <h4>快捷鍵對照 (Alt + 組合鍵)</h4>
      <ul>
        <li><kbd>Alt + Q</kbd> / <kbd>Alt + E</kbd> : 減慢 / 加快播放速度</li>
        <li><kbd>Alt + A</kbd> / <kbd>Alt + D</kbd> : 上一個 / 下一個字幕</li>
        <li><kbd>Alt + S</kbd> : 重複播放當前字幕</li>
        <li><kbd>Alt + Z</kbd> / <kbd>Alt + C</kbd> : 開關主字幕 / 開關副字幕</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { browser } from 'wxt/browser';
import type { NetflixConfig } from '@/core/contracts/messages';

const config = ref<NetflixConfig>({
  enabled: true,
  primarySize: 18,
  secondarySize: 22,
  bottomPosition: 80,
  lineSpacing: 4,
  enableBitmapRescue: true,
  learningMode: false,
});

onMounted(async () => {
  try {
    const res = await browser.storage.sync.get('owt_netflix_config');
    if (res?.owt_netflix_config) {
      config.value = { ...config.value, ...res.owt_netflix_config };
    }
  } catch {
    // fallback
  }
});

async function toggleEnabled() {
  config.value.enabled = !config.value.enabled;
  await onConfigChange();
}

async function onConfigChange() {
  try {
    await browser.storage.sync.set({ owt_netflix_config: { ...config.value } });

    // Broadcast message to active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      await browser.tabs.sendMessage(tabs[0].id, {
        type: 'UPDATE_NETFLIX_CONFIG',
        payload: { ...config.value },
      }).catch(() => {
        // Tab might not have content script ready
      });
    }
  } catch {
    // ignore
  }
}
</script>

<style scoped>
.netflix-config-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--owt-bg-secondary, #1e293b);
  border-radius: 10px;
  color: #e2e8f0;
  font-family: system-ui, -apple-system, sans-serif;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.status-badge {
  font-size: 13px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
}
.status-badge.active {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}
.status-badge.inactive {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.toggle-btn {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}
.toggle-btn.active {
  background: #ef4444;
}

.sliders-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.slider-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.slider-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #94a3b8;
}

.value-text {
  color: #38bdf8;
  font-weight: 600;
}

input[type='range'] {
  accent-color: #38bdf8;
  cursor: pointer;
}

.options-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #cbd5e1;
  cursor: pointer;
}

.hotkeys-guide {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
}

.hotkeys-guide h4 {
  margin: 0 0 6px 0;
  font-size: 12px;
  color: #94a3b8;
}

.hotkeys-guide ul {
  margin: 0;
  padding-left: 16px;
  font-size: 11px;
  color: #cbd5e1;

}

.hotkeys-guide li {
  margin-bottom: 3px;
}

kbd {
  background: #334155;
  color: #f8fafc;
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 10px;
  font-family: monospace;
}
</style>

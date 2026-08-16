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

    <!-- Diagnostic Evidence HUD -->
    <div class="diagnostic-hud" data-testid="diagnostic-hud">
      <div class="hud-header">⚙ 字幕驗收診斷 (Diagnostic HUD)</div>
      <div class="hud-row">
        <span>主軌 (Primary):</span>
        <span class="hud-value">{{ hudInfo.primaryStatus }}</span>
      </div>
      <div class="hud-row">
        <span>副軌 (Secondary):</span>
        <span class="hud-value">{{ hudInfo.secondaryStatus }}</span>
      </div>
      <div class="hud-row">
        <span>運作模式 (Mode):</span>
        <span :class="['hud-mode', hudInfo.modeClass]">{{ hudInfo.modeLabel }}</span>
      </div>
      <div v-if="hudInfo.activePreview" class="hud-preview">
        <div class="preview-line primary">{{ hudInfo.activePreview.primary }}</div>
        <div class="preview-line secondary">{{ hudInfo.activePreview.secondary }}</div>
      </div>
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
          @change="onConfigChange"
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
          @change="onConfigChange"
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
        <span>學習模式 (單字逐詞點擊)</span>
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
import { useNetflixSession } from '@/core/session/subtitle-session-store';

const { config, hudInfo, updateConfig } = useNetflixSession();

async function toggleEnabled() {
  config.value.enabled = !config.value.enabled;
  await onConfigChange();
}

async function onConfigChange() {
  await updateConfig(config.value);
}
</script>

<style scoped>
.netflix-config-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--bg-card, #1e293b);
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

.diagnostic-hud {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hud-header {
  font-weight: 700;
  color: #38bdf8;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
  padding-bottom: 4px;
  margin-bottom: 2px;
}

.hud-row {
  display: flex;
  justify-content: space-between;
  color: #94a3b8;
}

.hud-value {
  color: #f1f5f9;
  font-family: monospace;
}

.hud-mode.dual-native {
  color: #4ade80;
  font-weight: 700;
}

.hud-mode.ai-mode {
  color: #fbbf24;
  font-weight: 700;
}

.hud-mode.native-only {
  color: #f87171;
  font-weight: 700;
}

.hud-preview {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11px;
}

.preview-line.primary {
  color: #ffffff;
  font-weight: 600;
}

.preview-line.secondary {
  color: #818cf8;
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

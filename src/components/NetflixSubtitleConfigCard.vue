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
      <div class="hud-header">字幕驗收診斷 (Diagnostic HUD)</div>
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
        <span class="slider-label">主字幕大小</span>
        <input
          type="range"
          min="12"
          max="48"
          v-model.number="config.primarySize"
          @input="onConfigChange"
          @change="onConfigChange"
          data-testid="primary-size-slider"
        />
        <span class="value-text">{{ config.primarySize }}px</span>
      </div>

      <div class="slider-group">
        <span class="slider-label">副字幕大小</span>
        <input
          type="range"
          min="12"
          max="48"
          v-model.number="config.secondarySize"
          @input="onConfigChange"
          @change="onConfigChange"
          data-testid="secondary-size-slider"
        />
        <span class="value-text">{{ config.secondarySize }}px</span>
      </div>

      <div class="slider-group">
        <span class="slider-label">字幕位置</span>
        <input
          type="range"
          min="20"
          max="300"
          v-model.number="config.bottomPosition"
          @input="onConfigChange"
          data-testid="bottom-position-slider"
        />
        <span class="value-text">{{ config.bottomPosition }}px</span>
      </div>

      <div class="slider-group">
        <span class="slider-label">字幕間距</span>
        <input
          type="range"
          min="0"
          max="40"
          v-model.number="config.lineSpacing"
          @input="onConfigChange"
          data-testid="line-spacing-slider"
        />
        <span class="value-text">{{ config.lineSpacing }}px</span>
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
        <span>學習模式（單字逐詞點擊）</span>
      </label>
    </div>

    <!-- Hotkeys Quick Guide -->
    <div class="hotkeys-guide">
      <div class="hotkeys-title">快捷鍵對照 (Alt + 組合鍵)</div>
      <div class="hotkey-grid">
        <div class="hotkey-item"><kbd>Alt + Q</kbd> / <kbd>Alt + E</kbd> <span>減慢 / 加快播放速度</span></div>
        <div class="hotkey-item"><kbd>Alt + A</kbd> / <kbd>Alt + D</kbd> <span>上一個 / 下一個字幕</span></div>
        <div class="hotkey-item"><kbd>Alt + S</kbd> <span>重複播放當前字幕</span></div>
        <div class="hotkey-item"><kbd>Alt + Z</kbd> / <kbd>Alt + C</kbd> <span>開關主字幕 / 開關副字幕</span></div>
      </div>
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
  gap: 16px;
  padding: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--card-rim-light), var(--card-shadow);
  border-radius: var(--radius-lg, 14px);
  color: var(--text-secondary);
  font-family: var(--font-ui, system-ui, -apple-system, 'Segoe UI', sans-serif);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.status-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 2px;
}

.status-badge.active {
  background: #181d19;
  color: #7d9b85;
  border: 1px solid #212c24;
}

.status-badge.inactive {
  background: #241a1a;
  color: #b07070;
  border: 1px solid #362222;
}

.toggle-btn {
  background: var(--primary-accent, #e2e2e5);
  color: var(--on-primary, #101012);
  border: 1px solid transparent;
  padding: 6px 14px;
  border-radius: 2px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.toggle-btn:hover:not(.active) {
  background: #ffffff;
}

.toggle-btn.active {
  background: #241a1a;
  color: #b07070;
  border-color: #362222;
  box-shadow: none;
}

.diagnostic-hud {
  background: var(--bg-input, #0a0a0c);
  border: 1px solid var(--border-color, #222225);
  border-radius: 2px;
  padding: 12px 14px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hud-header {
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.02em;
  border-bottom: 1px dashed var(--border-color);
  padding-bottom: 6px;
  margin-bottom: 4px;
  font-size: 12px;
}

.hud-row {
  display: flex;
  justify-content: space-between;
  color: var(--text-muted);
}

.hud-value {
  color: var(--text-primary);
  font-family: monospace;
}

.hud-mode.dual-native {
  color: var(--accent-badge-text);
  font-weight: 700;
}

.hud-mode.ai-mode {
  color: var(--warning-text);
  font-weight: 700;
}

.hud-mode.native-only {
  color: var(--danger-text);
  font-weight: 700;
}

.hud-preview {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
}

.preview-line.primary {
  color: var(--text-primary);
  font-weight: 600;
}

.preview-line.secondary {
  color: var(--accent-badge-text);
}

.sliders-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.slider-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.slider-label {
  font-size: 13px;
  color: var(--text-secondary);
  width: 100px;
  flex-shrink: 0;
}

.slider-group input[type='range'] {
  flex: 1;
}

.value-text {
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  font-weight: 600;
  color: var(--text-primary, #e2e2e5);
  background: var(--bg-input, #0a0a0c);
  border: 1px solid var(--border-color, #222225);
  border-radius: 2px;
  padding: 2px 6px;
  min-width: 46px;
  text-align: center;
}

.options-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  accent-color: var(--primary-accent, #e2e2e5);
  width: 15px;
  height: 15px;
  cursor: pointer;
}

.hotkeys-guide {
  margin-top: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color, #222225);
}

.hotkeys-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #808086);
  margin-bottom: 8px;
}

.hotkey-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px;
}

.hotkey-item {
  font-size: 12px;
  color: var(--text-secondary, #b0b0b6);
  display: flex;
  align-items: center;
  gap: 6px;
}

kbd {
  background: var(--bg-input, #0a0a0c);
  border: 1px solid var(--border-color, #222225);
  color: var(--text-primary, #e2e2e5);
  padding: 2px 6px;
  border-radius: 2px;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  font-weight: 500;
}
</style>

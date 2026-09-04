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
  border-radius: var(--radius-full);
}

.status-badge.active {
  background: var(--accent-badge-bg);
  color: var(--accent-badge-text);
  border: 1px solid rgba(20, 184, 166, 0.25);
}

.status-badge.inactive {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid rgba(248, 113, 113, 0.25);
}

.toggle-btn {
  background: var(--primary-accent);
  color: var(--on-primary, #ffffff);
  border: 1px solid transparent;
  padding: 6px 14px;
  border-radius: var(--radius-sm, 8px);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1), 0 2px 8px var(--primary-glow);
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

.toggle-btn:hover:not(.active) {
  background: var(--primary-hover);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15), 0 4px 12px var(--primary-glow);
}

.toggle-btn.active {
  background: var(--danger-bg);
  color: var(--danger-text);
  border-color: rgba(248, 113, 113, 0.3);
  box-shadow: none;
}

.diagnostic-hud {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 8px);
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
  flex-direction: column;
  gap: 4px;
}

.slider-label {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-secondary);
}

.value-text {
  color: var(--primary-accent);
  font-weight: 600;
  font-family: monospace;
}

input[type='range'] {
  accent-color: var(--primary-accent);
  cursor: pointer;
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

.hotkeys-guide {
  margin-top: 6px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-color);
}

.hotkeys-guide h4 {
  margin: 0 0 6px 0;
  font-size: 12px;
  color: var(--text-muted);
}

.hotkeys-guide ul {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.hotkeys-guide li {
  margin-bottom: 3px;
}

kbd {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 2px 5px;
  border-radius: var(--radius-xs, 4px);
  font-size: 11px;
  font-family: monospace;
}
</style>

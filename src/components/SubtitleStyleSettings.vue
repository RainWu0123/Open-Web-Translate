<template>
  <div class="card subtitle-style-settings" data-testid="subtitle-style-settings">
    <div class="card-header">
      <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" />
      </svg>
      <div>
        <span class="card-title">{{ translate('subtitleStyleTitle') }}</span>
        <span class="card-desc">{{ translate('subtitleStyleDesc') }}</span>
      </div>
    </div>

    <!-- Subtitle Original Font Size -->
    <div class="setting-item">
      <div class="setting-label">
        <span class="title">{{ translate('subtitleOriginalFontSize') }}</span>
        <span class="desc">{{ translate('subtitleOriginalFontSizeDesc') }}</span>
      </div>
      <div class="range-control">
        <input
          type="range"
          min="12"
          max="32"
          step="1"
          :value="localSettings.subtitleOriginalFontSize || 18"
          @input="onRangeChange('subtitleOriginalFontSize', $event)"
          data-testid="range-orig-font-size"
        />
        <span class="range-val">{{ localSettings.subtitleOriginalFontSize || 18 }}px</span>
      </div>
    </div>

    <!-- Subtitle Translated Font Size -->
    <div class="setting-item">
      <div class="setting-label">
        <span class="title">{{ translate('subtitleTranslatedFontSize') }}</span>
        <span class="desc">{{ translate('subtitleTranslatedFontSizeDesc') }}</span>
      </div>
      <div class="range-control">
        <input
          type="range"
          min="14"
          max="40"
          step="1"
          :value="localSettings.subtitleTranslatedFontSize || 22"
          @input="onRangeChange('subtitleTranslatedFontSize', $event)"
          data-testid="range-trans-font-size"
        />
        <span class="range-val">{{ localSettings.subtitleTranslatedFontSize || 22 }}px</span>
      </div>
    </div>

    <!-- Subtitle Original Color -->
    <div class="setting-item">
      <div class="setting-label">
        <span class="title">{{ translate('subtitleOriginalColor') }}</span>
        <span class="desc">{{ translate('subtitleOriginalColorDesc') }}</span>
      </div>
      <div class="color-control">
        <input
          type="color"
          :value="localSettings.subtitleOriginalColor || '#ffffff'"
          @input="onColorChange('subtitleOriginalColor', $event)"
          data-testid="color-orig-color"
        />
        <span class="color-val">{{ localSettings.subtitleOriginalColor || '#ffffff' }}</span>
      </div>
    </div>

    <!-- Subtitle Translated Color -->
    <div class="setting-item">
      <div class="setting-label">
        <span class="title">{{ translate('subtitleTranslatedColor') }}</span>
        <span class="desc">{{ translate('subtitleTranslatedColorDesc') }}</span>
      </div>
      <div class="color-control">
        <input
          type="color"
          :value="localSettings.subtitleTranslatedColor || '#818cf8'"
          @input="onColorChange('subtitleTranslatedColor', $event)"
          data-testid="color-trans-color"
        />
        <span class="color-val">{{ localSettings.subtitleTranslatedColor || '#818cf8' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ExtensionSettings } from '@/core/contracts/messages';

const props = withDefaults(
  defineProps<{
    settings?: Partial<ExtensionSettings>;
    t?: (key: string) => string;
  }>(),
  {
    settings: () => ({}),
    t: undefined,
  },
);

const emit = defineEmits<{
  (e: 'update:settings', settings: Partial<ExtensionSettings>): void;
  (e: 'change', key: string, value: unknown): void;
  (e: 'change', settings: Partial<ExtensionSettings>): void;
}>();

const localSettings = computed(() => props.settings || {});

const builtinTranslations: Record<string, string> = {
  subtitleStyleTitle: '字幕樣式',
  subtitleStyleDesc: '雙語字幕的字體大小與顏色（適用於 YouTube 與 Netflix 疊加字幕）',
  subtitleOriginalFontSize: '原文字幕大小',
  subtitleOriginalFontSizeDesc: '影片原文字幕字體大小 (12px – 32px)',
  subtitleTranslatedFontSize: '譯文字幕大小',
  subtitleTranslatedFontSizeDesc: '翻譯字幕字體大小 (14px – 40px)',
  subtitleOriginalColor: '原文字幕顏色',
  subtitleOriginalColorDesc: '影片原文字幕顯示顏色',
  subtitleTranslatedColor: '譯文字幕顏色',
  subtitleTranslatedColorDesc: '翻譯字幕顯示顏色',
};

function translate(key: string): string {
  if (props.t) return props.t(key);
  return builtinTranslations[key] ?? key;
}

function updateSetting(key: keyof ExtensionSettings, value: unknown) {
  const updated = { ...localSettings.value, [key]: value };
  emit('update:settings', updated);
  emit('change', key, value);
  emit('change', updated);
}

function onRangeChange(key: keyof ExtensionSettings, e: Event) {
  updateSetting(key, Number((e.target as HTMLInputElement).value));
}

function onColorChange(key: keyof ExtensionSettings, e: Event) {
  updateSetting(key, (e.target as HTMLInputElement).value);
}
</script>

<style scoped>
.subtitle-style-settings {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--card-rim-light), var(--card-shadow);
  border-radius: var(--radius-lg, 14px);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-color);
}

.card-icon {
  width: 20px;
  height: 20px;
  color: var(--primary-accent);
  flex-shrink: 0;
}

.card-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-desc {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-width: 55%;
}

.title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

.range-control {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  justify-content: flex-end;
}

.range-control input[type='range'] {
  width: 140px;
  accent-color: var(--primary-accent);
}

.range-val,
.color-val {
  font-size: 12px;
  font-family: monospace;
  color: var(--primary-accent);
  min-width: 52px;
  text-align: right;
}

.color-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-control input[type='color'] {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 6px);
  padding: 0;
  cursor: pointer;
  background: var(--bg-input);
  -webkit-appearance: none;
  appearance: none;
}
</style>

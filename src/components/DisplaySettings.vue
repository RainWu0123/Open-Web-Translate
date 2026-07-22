<template>
  <div class="owt-display-settings" data-testid="display-settings">
    <!-- Compact Mode for Popup -->
    <div v-if="compact" class="compact-settings">
      <div class="setting-row">
        <span class="label">{{ translate('enableTranslation') }}</span>
        <label class="toggle">
          <input
            type="checkbox"
            :checked="localSettings.enabled !== false"
            @change="onToggleEnabled"
            data-testid="toggle-enabled"
          />
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <span class="label">{{ translate('targetLanguage') }}</span>
        <select
          :value="localSettings.targetLanguage"
          @change="onTargetLanguageChange"
          data-testid="target-language-select"
        >
          <option value="en">English</option>
          <option value="zh-Hant">繁體中文</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="es">Español</option>
        </select>
      </div>
    </div>

    <!-- Full Mode for Options Page -->
    <div v-else class="card full-settings">
      <!-- Enable Translation -->
      <div class="setting-item">
        <div class="setting-label">
          <span class="title">{{ translate('enableTranslation') }}</span>
          <span class="desc">{{ translate('enableTranslationDesc') }}</span>
        </div>
        <label class="toggle">
          <input
            type="checkbox"
            :checked="localSettings.enabled !== false"
            @change="onToggleEnabled"
            data-testid="toggle-enabled"
          />
          <span class="slider"></span>
        </label>
      </div>

      <!-- Target Language -->
      <div class="setting-item">
        <div class="setting-label">
          <span class="title">{{ translate('targetLanguage') }}</span>
          <span class="desc">{{ translate('targetLanguageDesc') }}</span>
        </div>
        <select
          :value="localSettings.targetLanguage"
          @change="onTargetLanguageChange"
          data-testid="target-language-select"
        >
          <option value="en">English</option>
          <option value="zh-Hant">繁體中文</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="es">Español</option>
        </select>
      </div>

      <!-- Display Layout Mode -->
      <div class="setting-item">
        <div class="setting-label">
          <span class="title">{{ translate('displayLayoutMode') }}</span>
          <span class="desc">{{ translate('displayLayoutDesc') }}</span>
        </div>
        <select
          :value="localSettings.displayMode"
          @change="onDisplayModeChange"
          data-testid="display-mode-select"
        >
          <option value="bilingual" data-testid="mode-bilingual">雙語對照 (Bilingual)</option>
          <option value="translation-first">譯文優先 (Translation-First)</option>
          <option value="immersive" data-testid="mode-immersive">沉浸模式 (Immersive)</option>
        </select>
      </div>

      <!-- Translation Mode -->
      <div class="setting-item">
        <div class="setting-label">
          <span class="title">{{ translate('translationMode') }}</span>
          <span class="desc">{{ translate('translationModeDesc') }}</span>
        </div>
        <select
          :value="localSettings.defaultTranslationMode"
          @change="onTranslationModeChange"
          data-testid="translation-mode-select"
        >
          <option value="fast">Fast</option>
          <option value="quality">Quality</option>
        </select>
      </div>

      <!-- Interface Language -->
      <div class="setting-item">
        <div class="setting-label">
          <span class="title">{{ translate('interfaceLanguage') }}</span>
          <span class="desc">{{ translate('interfaceLanguageDesc') }}</span>
        </div>
        <select
          :value="localSettings.uiLanguage"
          @change="onUiLanguageChange"
          data-testid="ui-language-select"
        >
          <option value="en">English</option>
          <option value="zh-Hant">繁體中文</option>
          <option value="ja">日本語</option>
        </select>
      </div>

      <!-- Show Floating Button -->
      <div class="setting-item">
        <div class="setting-label">
          <span class="title">{{ translate('showFloatingButton') }}</span>
          <span class="desc">{{ translate('showFloatingButtonDesc') }}</span>
        </div>
        <label class="toggle">
          <input
            type="checkbox"
            :checked="localSettings.showFloatingButton !== false"
            @change="onToggleFloatingButton"
            data-testid="toggle-floating-button"
          />
          <span class="slider"></span>
        </label>
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ExtensionSettings } from '@/core/contracts/messages';

const props = withDefaults(
  defineProps<{
    settings?: Partial<ExtensionSettings>;
    compact?: boolean;
    t?: (key: string) => string;
    // Legacy direct props support
    displayMode?: string;
    targetLanguage?: string;
    autoTranslate?: boolean;
    availableLanguages?: Array<{ code: string; name: string }>;
  }>(),
  {
    compact: false,
  }
);

const emit = defineEmits<{
  (e: 'update:settings', updated: Partial<ExtensionSettings>): void;
  (e: 'change', keyOrSettings: keyof ExtensionSettings | Record<string, unknown>, value?: unknown): void;
  (e: 'update:displayMode', val: string): void;
  (e: 'update:targetLanguage', val: string): void;
  (e: 'update:autoTranslate', val: boolean): void;
}>();

const localSettings = computed(() => {
  return {
    enabled: props.settings?.enabled ?? (props.autoTranslate !== undefined ? props.autoTranslate : true),
    targetLanguage: props.settings?.targetLanguage || props.targetLanguage || 'zh-Hant',
    displayMode: props.settings?.displayMode || props.displayMode || 'bilingual',
    defaultTranslationMode: props.settings?.defaultTranslationMode || 'fast',
    uiLanguage: props.settings?.uiLanguage || 'zh-Hant',
    showFloatingButton: props.settings?.showFloatingButton !== false,
    subtitleOriginalFontSize: props.settings?.subtitleOriginalFontSize || 18,
    subtitleTranslatedFontSize: props.settings?.subtitleTranslatedFontSize || 22,
    subtitleOriginalColor: props.settings?.subtitleOriginalColor || '#ffffff',
    subtitleTranslatedColor: props.settings?.subtitleTranslatedColor || '#818cf8',
  };
});

function translate(key: string): string {
  if (props.t) return props.t(key);
  const fallbackDict: Record<string, string> = {
    enableTranslation: 'Enable Translation',
    enableTranslationDesc: 'Toggle translation on all pages',
    targetLanguage: 'Target Language',
    targetLanguageDesc: 'Language to translate into',
    displayLayoutMode: 'Display Layout Mode',
    displayLayoutDesc: 'Bilingual = side-by-side, Translation-First = muted original, Immersive = accessible toggle button',
    translationMode: 'Translation Mode',
    translationModeDesc: 'Fast = lower latency, Quality = better results',
    interfaceLanguage: 'Interface Language',
    interfaceLanguageDesc: 'Language for the options interface',
    showFloatingButton: 'Show Floating Translation Button',
    showFloatingButtonDesc: 'Show quick-translate button on webpages',
    subtitleOriginalFontSize: 'Original Subtitle Font Size',
    subtitleOriginalFontSizeDesc: 'Font size for original video subtitles (12px - 32px)',
    subtitleTranslatedFontSize: 'Translated Subtitle Font Size',
    subtitleTranslatedFontSizeDesc: 'Font size for translated subtitles (14px - 40px)',
    subtitleOriginalColor: 'Original Subtitle Color',
    subtitleOriginalColorDesc: 'Text color for original video subtitles',
    subtitleTranslatedColor: 'Translated Subtitle Color',
    subtitleTranslatedColorDesc: 'Text color for translated video subtitles',
  };
  return fallbackDict[key] || key;
}

function updateSetting(key: keyof ExtensionSettings, value: unknown) {
  const updated = { [key]: value };
  emit('update:settings', updated);
  emit('change', key, value);
  emit('change', { ...localSettings.value, [key]: value });

  if (key === 'displayMode') emit('update:displayMode', String(value));
  if (key === 'targetLanguage') emit('update:targetLanguage', String(value));
  if (key === 'enabled') emit('update:autoTranslate', Boolean(value));
}

function onToggleEnabled(e: Event) {
  const target = e.target as HTMLInputElement;
  updateSetting('enabled', target.checked);
}

function onTargetLanguageChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  updateSetting('targetLanguage', target.value);
}

function onDisplayModeChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  updateSetting('displayMode', target.value as any);
}

function onTranslationModeChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  updateSetting('defaultTranslationMode', target.value as any);
}

function onUiLanguageChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  updateSetting('uiLanguage', target.value);
}

function onToggleFloatingButton(e: Event) {
  const target = e.target as HTMLInputElement;
  updateSetting('showFloatingButton', target.checked);
}

function onRangeChange(key: keyof ExtensionSettings, e: Event) {
  const target = e.target as HTMLInputElement;
  updateSetting(key, Number(target.value));
}

function onColorChange(key: keyof ExtensionSettings, e: Event) {
  const target = e.target as HTMLInputElement;
  updateSetting(key, target.value);
}
</script>

<style scoped>
.owt-display-settings {
  width: 100%;
}

.card {
  background-color: var(--bg-card, #1e293b);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border-color, #334155);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.compact-settings {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #334155);
}

.setting-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label .title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #f8fafc);
}

.setting-label .desc {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
}

select {
  background-color: var(--bg-input, #0f172a);
  color: var(--text-primary, #f8fafc);
  border: 1px solid var(--border-color, #334155);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
}

.range-control, .color-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.range-control input[type="range"] {
  accent-color: var(--primary-accent, #3b82f6);
  cursor: pointer;
}

.range-val, .color-val {
  font-size: 13px;
  color: var(--text-secondary, #cbd5e1);
  min-width: 45px;
  text-align: right;
  font-family: monospace;
}

.color-control input[type="color"] {
  -webkit-appearance: none;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
}

.toggle {
  position: relative;
  width: 44px;
  height: 24px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  inset: 0;
  background-color: #475569;
  border-radius: 24px;
  transition: 0.3s;
  cursor: pointer;
}

.slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  bottom: 3px;
  background-color: #ffffff;
  border-radius: 50%;
  transition: 0.3s;
}

.toggle input:checked + .slider {
  background-color: var(--primary-accent, #3b82f6);
}

.toggle input:checked + .slider::before {
  transform: translateX(20px);
}
</style>

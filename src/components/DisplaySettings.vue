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
        <span class="label">{{ translate('sourceLanguage') }}</span>
        <select
          :value="localSettings.sourceLanguage"
          @change="onSourceLanguageChange"
          data-testid="source-language-select"
        >
          <option value="auto">自動偵測</option>
          <option value="en">English</option>
          <option value="zh-Hant">繁體中文</option>
          <option value="zh-Hans">簡體中文</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="es">Español</option>
        </select>
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
      <!-- Source Language -->
      <div class="setting-item">
        <div class="setting-label">
          <span class="title">{{ translate('sourceLanguage') }}</span>
          <span class="desc">{{ translate('sourceLanguageDesc') }}</span>
        </div>
        <select
          :value="localSettings.sourceLanguage"
          @change="onSourceLanguageChange"
          data-testid="source-language-select"
        >
          <option value="auto">自動偵測</option>
          <option value="en">English</option>
          <option value="zh-Hant">繁體中文</option>
          <option value="zh-Hans">簡體中文</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="es">Español</option>
        </select>
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
    sourceLanguage: props.settings?.sourceLanguage || 'auto',
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
    sourceLanguage: 'Source Language',
    sourceLanguageDesc: 'Used by webpage and video subtitle translation',
    targetLanguage: 'Target Language',
    targetLanguageDesc: 'Used by webpage and video subtitle translation',
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

function onSourceLanguageChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  updateSetting('sourceLanguage', target.value);
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
  background-color: var(--bg-card);
  border-radius: var(--radius-lg, 14px);
  padding: 24px;
  border: 1px solid var(--border-color);
  box-shadow: var(--card-rim-light), var(--card-shadow);
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
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
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
  color: var(--text-primary);
}

.setting-label .desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

select {
  background-color: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 8px);
  padding: 8px 32px 8px 12px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.range-control,
.color-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.range-control input[type="range"] {
  accent-color: var(--primary-accent);
  cursor: pointer;
}

.range-val,
.color-val {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 45px;
  text-align: right;
  font-family: monospace;
}

.color-control input[type="color"] {
  -webkit-appearance: none;
  appearance: none;
  border: 1px solid var(--border-color);
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  background: none;
  padding: 0;
}
</style>

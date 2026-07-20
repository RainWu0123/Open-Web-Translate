<template>
  <div class="options-container">
    <!-- Sidebar Navigation -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo-icon">🌐</div>
        <div class="logo-text">
          <h2>Open Web Translate</h2>
          <span>v0.1.0 — Phase 2</span>
        </div>
      </div>
      <nav class="sidebar-nav">
        <button
          :class="['nav-item', { active: activeTab === 'general' }]"
          @click="activeTab = 'general'"
        >
          <span class="icon">⚙️</span> {{ t('general') }}
        </button>
        <button
          :class="['nav-item', { active: activeTab === 'providers' }]"
          @click="activeTab = 'providers'"
        >
          <span class="icon">🧩</span> {{ t('providers') }}
        </button>
        <button
          :class="['nav-item', { active: activeTab === 'vocabulary' }]"
          @click="activeTab = 'vocabulary'"
        >
          <span class="icon">⭐️</span> {{ t('vocabulary') }}
        </button>
      </nav>
    </aside>

    <!-- Main Content Area -->
    <main class="main-content">
      <!-- General Settings Panel -->
      <section v-if="activeTab === 'general'" class="panel-section">
        <h1 class="panel-title">{{ t('generalSettings') }}</h1>
        <div class="card">
          <div class="setting-item">
            <div class="setting-label">
              <span class="title">{{ t('enableTranslation') }}</span>
              <span class="desc">{{ t('enableTranslationDesc') }}</span>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="settings.enabled" @change="save" />
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="title">{{ t('targetLanguage') }}</span>
              <span class="desc">{{ t('targetLanguageDesc') }}</span>
            </div>
            <select v-model="settings.targetLanguage" @change="save">
              <option value="en">English</option>
              <option value="zh-Hant">繁體中文</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
              <option value="es">Español</option>
            </select>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="title">{{ t('displayLayoutMode') }}</span>
              <span class="desc">{{ t('displayLayoutDesc') }}</span>
            </div>
            <select v-model="settings.displayMode" @change="save">
              <option value="bilingual">雙語對照 (Bilingual)</option>
              <option value="translation-first">譯文優先 (Translation-First)</option>
              <option value="immersive">沉浸模式 (Immersive)</option>
            </select>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="title">{{ t('translationMode') }}</span>
              <span class="desc">{{ t('translationModeDesc') }}</span>
            </div>
            <select v-model="settings.defaultTranslationMode" @change="save">
              <option value="fast">Fast</option>
              <option value="quality">Quality</option>
            </select>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="title">{{ t('interfaceLanguage') }}</span>
              <span class="desc">{{ t('interfaceLanguageDesc') }}</span>
            </div>
            <select v-model="settings.uiLanguage" @change="save">
              <option value="en">English</option>
              <option value="zh-Hant">繁體中文</option>
              <option value="ja">日本語</option>
            </select>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="title">{{ t('showFloatingButton') }}</span>
              <span class="desc">{{ t('showFloatingButtonDesc') }}</span>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="settings.showFloatingButton" @change="save" />
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="title">{{ t('subtitleOriginalFontSize') }}</span>
              <span class="desc">{{ t('subtitleOriginalFontSizeDesc') }}</span>
            </div>
            <div class="range-control">
              <input type="range" min="12" max="32" step="1" v-model.number="settings.subtitleOriginalFontSize" @change="save" />
              <span class="range-val">{{ settings.subtitleOriginalFontSize }}px</span>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="title">{{ t('subtitleTranslatedFontSize') }}</span>
              <span class="desc">{{ t('subtitleTranslatedFontSizeDesc') }}</span>
            </div>
            <div class="range-control">
              <input type="range" min="14" max="40" step="1" v-model.number="settings.subtitleTranslatedFontSize" @change="save" />
              <span class="range-val">{{ settings.subtitleTranslatedFontSize }}px</span>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="title">{{ t('subtitleOriginalColor') }}</span>
              <span class="desc">{{ t('subtitleOriginalColorDesc') }}</span>
            </div>
            <div class="color-control">
              <input type="color" v-model="settings.subtitleOriginalColor" @change="save" />
              <span class="color-val">{{ settings.subtitleOriginalColor }}</span>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span class="title">{{ t('subtitleTranslatedColor') }}</span>
              <span class="desc">{{ t('subtitleTranslatedColorDesc') }}</span>
            </div>
            <div class="color-control">
              <input type="color" v-model="settings.subtitleTranslatedColor" @change="save" />
              <span class="color-val">{{ settings.subtitleTranslatedColor }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Providers Panel -->
      <section v-if="activeTab === 'providers'" class="panel-section">
        <h1 class="panel-title">{{ t('translationProviders') }}</h1>
        <div class="card">
          <div class="setting-item">
            <div class="setting-label">
              <span class="title">{{ t('selectProvider') }}</span>
              <span class="desc">{{ t('selectProviderDesc') }}</span>
            </div>
            <select v-model="settings.activeProviderId" @change="save">
              <option value="mock-provider">Mock Provider (Local Test)</option>
              <option value="gemini-provider">Google Gemini API</option>
              <option value="deepl-provider">DeepL Translate API</option>
              <option value="google-provider">Google Translate (Free)</option>
            </select>
          </div>

          <!-- Gemini Configuration -->
          <div class="provider-key-section" v-if="settings.activeProviderId === 'gemini-provider'">
            <div class="setting-item-inner">
              <div class="setting-label">
                <span class="title">{{ t('geminiModel') }}</span>
                <span class="desc">{{ t('geminiModelDesc') }}</span>
                <span class="verified-tag" v-if="currentModelEntry">
                  {{ t('verified') }}: {{ currentModelEntry.lastVerifiedAt }}
                </span>
              </div>
              <div class="model-select-col">
                <select v-model="selectedModelPreset" @change="onModelPresetChange">
                  <optgroup label="Verified Active Models">
                    <option v-for="m in activeModels" :key="m.id" :value="m.id">
                      {{ m.displayName }}{{ m.isDefaultCandidate ? ' (Recommended)' : '' }}
                    </option>
                  </optgroup>
                  <optgroup label="Deprecated Models (Retiring Oct 2026)" v-if="deprecatedModels.length > 0">
                    <option v-for="m in deprecatedModels" :key="m.id" :value="m.id">
                      ⚠️ {{ m.displayName }}
                    </option>
                  </optgroup>
                  <option value="custom">Custom Model ID (Advanced / Experimental)...</option>
                </select>

                <input
                  v-if="selectedModelPreset === 'custom'"
                  type="text"
                  v-model="customModelInput"
                  placeholder="e.g. gemini-3.5-flash"
                  class="key-input custom-model-input"
                  @blur="saveCustomModel"
                />
              </div>
            </div>

            <div v-if="modelValidationError" class="key-status-msg error-msg">
              ❌ {{ modelValidationError }}
            </div>

            <div class="key-header margin-top-12">
              <span class="title">{{ t('apiKey') }}</span>
              <span :class="['badge', settings.hasGeminiApiKey ? 'configured' : 'unconfigured']">
                {{ settings.hasGeminiApiKey ? t('configured') : t('unconfigured') }}
              </span>
            </div>
            <p class="desc" v-if="settings.hasGeminiApiKey">
              {{ t('apiKeyDesc') }} <code>{{ settings.geminiApiKeyMasked }}</code>
            </p>

            <div class="key-input-row">
              <input
                type="password"
                v-model="apiKeyInput"
                :placeholder="t('enterKey')"
                class="key-input"
              />
              <button class="btn btn-save" @click="saveApiKey" :disabled="!apiKeyInput.trim()">
                {{ t('save') }}
              </button>
              <button
                class="btn btn-clear"
                @click="clearApiKey"
                :disabled="!settings.hasGeminiApiKey && !apiKeyInput"
              >
                {{ t('clear') }}
              </button>
            </div>

            <div v-if="keyMessage" class="key-status-msg">
              {{ keyMessage }}
            </div>
          </div>

          <!-- DeepL Configuration -->
          <div class="provider-key-section" v-if="settings.activeProviderId === 'deepl-provider'">
            <div class="key-header">
              <span class="title">{{ t('deeplKey') }}</span>
              <span :class="['badge', settings.hasDeeplApiKey ? 'configured' : 'unconfigured']">
                {{ settings.hasDeeplApiKey ? t('configured') : t('unconfigured') }}
              </span>
            </div>
            <p class="desc" v-if="settings.hasDeeplApiKey">
              {{ t('deeplKeyDesc') }} <code>{{ settings.deeplApiKeyMasked }}</code>
            </p>

            <div class="key-input-row">
              <input
                type="password"
                v-model="deeplKeyInput"
                :placeholder="t('enterKey')"
                class="key-input"
              />
              <button class="btn btn-save" @click="saveDeeplKey" :disabled="!deeplKeyInput.trim()">
                {{ t('save') }}
              </button>
              <button
                class="btn btn-clear"
                @click="clearDeeplKey"
                :disabled="!settings.hasDeeplApiKey && !deeplKeyInput"
              >
                {{ t('clear') }}
              </button>
            </div>

            <div v-if="deeplKeyMessage" class="key-status-msg">
              {{ deeplKeyMessage }}
            </div>
          </div>
        </div>
      </section>

      <!-- Vocabulary Workbench Panel -->
      <section v-if="activeTab === 'vocabulary'" class="panel-section">
        <div class="panel-header">
          <h1 class="panel-title">{{ t('vocabularyWorkbench') }}</h1>
          <div class="header-actions">
            <button class="btn btn-save btn-sm" @click="exportVocabulary" :disabled="vocabItems.length === 0">
              {{ t('exportCsv') }}
            </button>
            <button class="btn btn-clear btn-sm" @click="clearVocabulary" :disabled="vocabItems.length === 0">
              {{ t('clearAll') }}
            </button>
          </div>
        </div>

        <div class="card">
          <div class="vocab-container">
            <div v-if="vocabItems.length === 0" class="empty-state">
              {{ t('vocabularyDesc') }}
            </div>
            <div v-else class="vocab-list">
              <div v-for="item in vocabItems" :key="item.id" class="vocab-row">
                <div class="vocab-main">
                  <div class="vocab-word-row">
                    <span class="vocab-word">{{ item.word }}</span>
                    <span class="vocab-translation">{{ item.translation }}</span>
                  </div>
                  <div class="vocab-context">Context: "{{ item.context }}"</div>
                  <a v-if="item.url" :href="item.url" target="_blank" class="vocab-link">
                    View timestamped source video 📺
                  </a>
                </div>
                <button class="btn-delete-item" @click="deleteVocabItem(item.id)">&times;</button>
              </div>
            </div>
          </div>
        </div>
      </section>

    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { VocabularyExporter } from '@/infrastructure/storage/repositories/vocabulary-exporter';
import {
  getActiveVerifiedModels,
  getDeprecatedButFunctionalModels,
  validateModelId,
  findModelEntry,
  DEFAULT_MODEL_ID,
} from '@/infrastructure/providers/gemini/model-registry';

// i18n Dictionaries
const translations = {
  en: {
    general: 'General',
    providers: 'Providers',
    vocabulary: 'Vocabulary Workbench',
    generalSettings: 'General Settings',
    enableTranslation: 'Enable Translation',
    enableTranslationDesc: 'Toggle translation on all pages',
    targetLanguage: 'Target Language',
    targetLanguageDesc: 'Language to translate into',
    displayLayoutMode: 'Display Layout Mode',
    displayLayoutDesc: 'Bilingual = side-by-side, Translation-First = muted original, Immersive = accessible toggle button',
    translationMode: 'Translation Mode',
    translationModeDesc: 'Fast = lower latency, Quality = better results',
    translationProviders: 'Translation Providers',
    selectProvider: 'Translation Provider',
    selectProviderDesc: 'Select translation engine',
    geminiModel: 'Gemini Model',
    geminiModelDesc: 'Select verified model or enter custom model ID',
    verified: 'Verified',
    apiKey: 'Gemini API Key',
    apiKeyDesc: 'Current key:',
    save: 'Save',
    clear: 'Clear',
    configured: 'Configured',
    unconfigured: 'Not configured',
    enterKey: 'Enter API Key',
    deeplKey: 'DeepL API Key',
    deeplKeyDesc: 'Current key:',
    vocabularyWorkbench: 'Saved Vocabulary Workbench',
    vocabularyDesc: 'No vocabulary items saved yet. Watch YouTube videos and click words in subtitles to save them.',
    exportCsv: 'Export CSV / Anki',
    clearAll: 'Clear All',
    interfaceLanguage: 'Interface Language',
    interfaceLanguageDesc: 'Language for the options interface',
    showFloatingButton: 'Show Floating Translation Button',
    showFloatingButtonDesc: 'Show the OWT quick-translate button on webpages. You can still translate via right-click menu or Popup when disabled.',
    subtitleOriginalFontSize: 'Original Subtitle Font Size',
    subtitleOriginalFontSizeDesc: 'Font size for original video subtitles (12px - 32px)',
    subtitleTranslatedFontSize: 'Translated Subtitle Font Size',
    subtitleTranslatedFontSizeDesc: 'Font size for translated subtitles (14px - 40px)',
    subtitleOriginalColor: 'Original Subtitle Color',
    subtitleOriginalColorDesc: 'Text color for original video subtitles',
    subtitleTranslatedColor: 'Translated Subtitle Color',
    subtitleTranslatedColorDesc: 'Text color for translated video subtitles',
  },
  'zh-Hant': {
    general: '一般設定',
    providers: '翻譯引擎設定',
    vocabulary: '生字庫工作站',
    generalSettings: '一般設定 (General)',
    enableTranslation: '啟用網頁翻譯功能',
    enableTranslationDesc: '開啟或關閉所有網頁的雙語翻譯服務',
    targetLanguage: '目標翻譯語言',
    targetLanguageDesc: '網頁內容將被翻譯為此語言',
    displayLayoutMode: '雙語對照佈局模式',
    displayLayoutDesc: '雙語對照 = 左右/上下對齊，譯文優先 = 淡化原文，沉浸模式 = 顯示/隱藏原文切換按鈕',
    translationMode: '翻譯流暢度模式',
    translationModeDesc: 'Fast = 較低延遲優先，Quality = 翻譯品質優化優先',
    translationProviders: '翻譯引擎供應商',
    selectProvider: '預設翻譯引擎',
    selectProviderDesc: '選擇翻譯服務提供商',
    geminiModel: 'Gemini 模型名稱',
    geminiModelDesc: '選擇已驗證之官方模型，或輸入進階自訂模型 ID',
    verified: '已驗證',
    apiKey: 'Gemini API 金鑰',
    apiKeyDesc: '目前金鑰：',
    save: '儲存金鑰',
    clear: '清除金鑰',
    configured: '已設定',
    unconfigured: '未設定',
    enterKey: '請輸入金鑰',
    deeplKey: 'DeepL API 金鑰',
    deeplKeyDesc: '目前金鑰：',
    vocabularyWorkbench: '已儲存生字庫工作站',
    vocabularyDesc: '目前尚未儲存任何生字。請在觀看 YouTube 影片時點擊雙語字幕中的單字進行收藏。',
    exportCsv: '匯出 CSV / Anki 欄位',
    clearAll: '清空字庫',
    interfaceLanguage: '介面顯示語言',
    interfaceLanguageDesc: '設定此設定頁面的介面顯示語言',
    showFloatingButton: '顯示懸浮翻譯按鈕',
    showFloatingButtonDesc: '在網頁右下角顯示 OWT 快速翻譯按鈕。關閉後仍可透過右鍵選單或 Popup 翻譯。',
    subtitleOriginalFontSize: 'YouTube 原文字幕大小',
    subtitleOriginalFontSizeDesc: '設定影片原文字幕字體大小 (12px – 32px)',
    subtitleTranslatedFontSize: 'YouTube 譯文字幕大小',
    subtitleTranslatedFontSizeDesc: '設定翻譯字幕字體大小 (14px – 40px)',
    subtitleOriginalColor: 'YouTube 原文字幕顏色',
    subtitleOriginalColorDesc: '設定影片原文字幕顯示顏色',
    subtitleTranslatedColor: 'YouTube 譯文字幕顏色',
    subtitleTranslatedColorDesc: '設定翻譯字幕顯示顏色',
  },
  ja: {
    general: '一般設定',
    providers: '翻訳プロバイダー',
    vocabulary: '単語帳ワークベンチ',
    generalSettings: '一般設定',
    enableTranslation: '翻訳機能を有効化',
    enableTranslationDesc: 'すべてのページで翻訳機能を有効/無効にします',
    targetLanguage: '翻訳先言語',
    targetLanguageDesc: '翻訳するターゲット言語を選択します',
    displayLayoutMode: '表示レイアウトモード',
    displayLayoutDesc: '対訳表示 = 原文と訳文を並べる、訳文優先 = 原文を薄く表示、没入モード = アクセシブルな切り替えボタン',
    translationMode: '翻訳優先モード',
    translationModeDesc: 'Fast = 低遅延を優先、Quality = 翻訳品質を優先',
    translationProviders: '翻訳プロバイダー設定',
    selectProvider: '翻訳エンジン',
    selectProviderDesc: '使用する翻訳エンジンを選択します',
    geminiModel: 'Gemini モデル',
    geminiModelDesc: '検証済みのモデルを選択するか、カスタムモデルIDを入力します',
    verified: '検証済み',
    apiKey: 'Gemini API キー',
    apiKeyDesc: '現在のキー:',
    save: '保存',
    clear: 'クリア',
    configured: '設定済み',
    unconfigured: '未設定',
    enterKey: 'API キーを入力してください',
    deeplKey: 'DeepL API キー',
    deeplKeyDesc: '現在のキー:',
    vocabularyWorkbench: '保存した単語帳ワークベンチ',
    vocabularyDesc: '保存された単語はありません。YouTube動画を視聴し、字幕の単語をクリックして保存してください。',
    exportCsv: 'CSV / Ankiエクスポート',
    clearAll: 'すべてクリア',
    interfaceLanguage: 'インターフェース言語',
    interfaceLanguageDesc: '設定画面の表示言語を変更します',
    showFloatingButton: 'フローティング翻訳ボタンを表示',
    showFloatingButtonDesc: 'ページ右下にOWTクイック翻訳ボタンを表示します。無効にしても右クリックメニューやポップアップから翻訳できます。',
    subtitleOriginalFontSize: 'YouTube 原文字幕サイズ',
    subtitleOriginalFontSizeDesc: '動画の原文字幕フォントサイズを変更します (12px – 32px)',
    subtitleTranslatedFontSize: 'YouTube 訳文字幕サイズ',
    subtitleTranslatedFontSizeDesc: '翻訳字幕のフォントサイズを変更します (14px – 40px)',
    subtitleOriginalColor: 'YouTube 原文字幕カラー',
    subtitleOriginalColorDesc: '原文字幕のテキストカラーを設定します',
    subtitleTranslatedColor: 'YouTube 訳文字幕カラー',
    subtitleTranslatedColorDesc: '翻訳字幕のテキストカラーを設定します',
  }
};

const activeModels = getActiveVerifiedModels();
const deprecatedModels = getDeprecatedButFunctionalModels();

const activeTab = ref('general');

const settings = ref({
  enabled: true,
  targetLanguage: 'zh-Hant',
  defaultTranslationMode: 'fast' as 'fast' | 'quality',
  activeProviderId: 'mock-provider',
  hasGeminiApiKey: false,
  geminiApiKeyMasked: '',
  geminiModel: DEFAULT_MODEL_ID,
  hasDeeplApiKey: false,
  deeplApiKeyMasked: '',
  deeplApiIsPro: false,
  displayMode: 'bilingual' as 'bilingual' | 'translation-first' | 'immersive',
  uiLanguage: 'zh-Hant',
  showFloatingButton: true,
  subtitleOriginalFontSize: 18,
  subtitleTranslatedFontSize: 22,
  subtitleOriginalColor: '#ffffff',
  subtitleTranslatedColor: '#818cf8',
});

const apiKeyInput = ref('');
const keyMessage = ref('');
const deeplKeyInput = ref('');
const deeplKeyMessage = ref('');
const selectedModelPreset = ref(DEFAULT_MODEL_ID);
const customModelInput = ref('');
const modelValidationError = ref('');
const vocabItems = ref<any[]>([]);

const currentModelEntry = computed(() => findModelEntry(settings.value.geminiModel));

const t = (key: keyof typeof translations['en']) => {
  const lang = (settings.value.uiLanguage || 'zh-Hant') as keyof typeof translations;
  const dict = translations[lang] || translations['zh-Hant'];
  return dict[key] || translations['en'][key] || key;
};

onMounted(async () => {
  await loadSettings();
  await loadVocabulary();
});

async function loadVocabulary() {
  try {
    vocabItems.value = (await messageRouter.sendMessage({ type: 'GET_VOCAB_ITEMS' })) || [];
  } catch (e) {
    console.error('Failed to load vocabulary items', e);
  }
}

async function deleteVocabItem(id: string) {
  try {
    await messageRouter.sendMessage({ type: 'DELETE_VOCAB_ITEM', id });
    await loadVocabulary();
  } catch (e) {
    console.error('Failed to delete vocabulary item', e);
  }
}

async function clearVocabulary() {
  if (confirm('Are you sure you want to clear all vocabulary items?')) {
    try {
      await messageRouter.sendMessage({ type: 'CLEAR_VOCAB_ITEMS' });
      await loadVocabulary();
    } catch (e) {
      console.error('Failed to clear vocabulary items', e);
    }
  }
}

function exportVocabulary() {
  VocabularyExporter.downloadCSV(vocabItems.value);
}

async function loadSettings() {
  try {
    const s = await messageRouter.sendMessage({ type: 'GET_SETTINGS' });
    if (s) {
      settings.value.enabled = s.enabled;
      settings.value.targetLanguage = s.targetLanguage;
      settings.value.defaultTranslationMode = s.defaultTranslationMode;
      settings.value.activeProviderId = s.activeProviderId || 'mock-provider';
      settings.value.hasGeminiApiKey = Boolean(s.hasGeminiApiKey);
      settings.value.geminiApiKeyMasked = s.geminiApiKeyMasked || '';
      settings.value.hasDeeplApiKey = Boolean(s.hasDeeplApiKey);
      settings.value.deeplApiKeyMasked = s.deeplApiKeyMasked || '';
      settings.value.deeplApiIsPro = Boolean(s.deeplApiIsPro);
      settings.value.displayMode = s.displayMode || 'bilingual';
      settings.value.uiLanguage = s.uiLanguage || 'zh-Hant';
      settings.value.showFloatingButton = s.showFloatingButton !== false;
      settings.value.subtitleOriginalFontSize = s.subtitleOriginalFontSize || 18;
      settings.value.subtitleTranslatedFontSize = s.subtitleTranslatedFontSize || 22;
      settings.value.subtitleOriginalColor = s.subtitleOriginalColor || '#ffffff';
      settings.value.subtitleTranslatedColor = s.subtitleTranslatedColor || '#818cf8';

      const currentModel = s.geminiModel || DEFAULT_MODEL_ID;
      settings.value.geminiModel = currentModel;

      const known = [...activeModels, ...deprecatedModels].some((m) => m.id === currentModel);
      if (known) {
        selectedModelPreset.value = currentModel;
        customModelInput.value = '';
      } else {
        selectedModelPreset.value = 'custom';
        customModelInput.value = currentModel;
      }
    }
  } catch (e) {
    console.error('Failed to load settings', e);
  }
}

async function onModelPresetChange() {
  modelValidationError.value = '';
  if (selectedModelPreset.value !== 'custom') {
    await saveModel(selectedModelPreset.value);
  }
}

async function saveCustomModel() {
  modelValidationError.value = '';
  const input = customModelInput.value.trim();
  if (!input) return;

  const validation = validateModelId(input);
  if (!validation.valid) {
    modelValidationError.value = validation.message;
    return;
  }

  await saveModel(validation.modelId);
}

async function saveModel(modelName: string) {
  try {
    await messageRouter.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: {
        geminiModel: modelName,
      },
    });
    await loadSettings();
  } catch (e) {
    console.error('Failed to save Gemini model', e);
  }
}

async function save() {
  try {
    await messageRouter.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: {
        enabled: settings.value.enabled,
        targetLanguage: settings.value.targetLanguage,
        defaultTranslationMode: settings.value.defaultTranslationMode,
        activeProviderId: settings.value.activeProviderId,
        displayMode: settings.value.displayMode,
        uiLanguage: settings.value.uiLanguage,
        showFloatingButton: settings.value.showFloatingButton,
        subtitleOriginalFontSize: settings.value.subtitleOriginalFontSize,
        subtitleTranslatedFontSize: settings.value.subtitleTranslatedFontSize,
        subtitleOriginalColor: settings.value.subtitleOriginalColor,
        subtitleTranslatedColor: settings.value.subtitleTranslatedColor,
      },
    });
    await loadSettings();
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}

async function saveApiKey() {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  try {
    await messageRouter.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: {
        geminiApiKey: key,
      },
    });
    apiKeyInput.value = '';
    keyMessage.value = 'Gemini API Key saved successfully.';
    await loadSettings();
    setTimeout(() => {
      keyMessage.value = '';
    }, 3000);
  } catch (e) {
    console.error('Failed to save API key', e);
    keyMessage.value = 'Failed to save API key.';
  }
}

async function clearApiKey() {
  try {
    await messageRouter.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: {
        geminiApiKey: '',
      },
    });
    apiKeyInput.value = '';
    keyMessage.value = 'Gemini API Key cleared.';
    await loadSettings();
    setTimeout(() => {
      keyMessage.value = '';
    }, 3000);
  } catch (e) {
    console.error('Failed to clear API key', e);
    keyMessage.value = 'Failed to clear API key.';
  }
}

async function saveDeeplKey() {
  const key = deeplKeyInput.value.trim();
  if (!key) return;
  try {
    await messageRouter.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: {
        deeplApiKey: key,
      },
    });
    deeplKeyInput.value = '';
    deeplKeyMessage.value = 'DeepL API Key saved successfully.';
    await loadSettings();
    setTimeout(() => {
      deeplKeyMessage.value = '';
    }, 3000);
  } catch (e) {
    console.error('Failed to save DeepL API key', e);
    deeplKeyMessage.value = 'Failed to save DeepL API key.';
  }
}

async function clearDeeplKey() {
  try {
    await messageRouter.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: {
        deeplApiKey: '',
      },
    });
    deeplKeyInput.value = '';
    deeplKeyMessage.value = 'DeepL API Key cleared.';
    await loadSettings();
    setTimeout(() => {
      deeplKeyMessage.value = '';
    }, 3000);
  } catch (e) {
    console.error('Failed to clear DeepL API key', e);
    deeplKeyMessage.value = 'Failed to clear DeepL API key.';
  }
}
</script>

<style scoped>
.options-container {
  display: flex;
  min-height: 100vh;
  background-color: #0f172a;
  color: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

/* Sidebar Navigation */
.sidebar {
  width: 260px;
  background-color: #1e293b;
  border-right: 1px solid #334155;
  display: flex;
  flex-direction: column;
  padding: 24px 0;
  flex-shrink: 0;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 24px 24px 24px;
  border-bottom: 1px solid #334155;
}

.logo-icon {
  font-size: 28px;
}

.logo-text h2 {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.logo-text span {
  font-size: 11px;
  color: #94a3b8;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 24px 16px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: none;
  border: none;
  border-radius: 8px;
  color: #94a3b8;
  font-size: 14px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
  color: #f1f5f9;
}

.nav-item.active {
  background-color: #2563eb;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.nav-item .icon {
  font-size: 16px;
}

/* Main Content Area */
.main-content {
  flex: 1;
  padding: 40px 48px;
  max-width: 800px;
  overflow-y: auto;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
  color: #f8fafc;
}

.card {
  background-color: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 12px 0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title {
  font-size: 15px;
  font-weight: 600;
}

.desc {
  font-size: 12px;
  color: #94a3b8;
  max-width: 440px;
  line-height: 1.4;
}

/* Toggle Switch */
.toggle {
  position: relative;
  width: 48px;
  height: 26px;
  flex-shrink: 0;
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
  border-radius: 26px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.slider::before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  left: 3px;
  bottom: 3px;
  background-color: #f1f5f9;
  border-radius: 50%;
  transition: transform 0.2s ease;
}

.toggle input:checked + .slider {
  background-color: #2563eb;
}

.toggle input:checked + .slider::before {
  transform: translateX(22px);
}

select {
  background-color: #0f172a;
  color: #f1f5f9;
  border: 1px solid #334155;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

select:focus {
  outline: none;
  border-color: #2563eb;
}

.provider-key-section {
  padding: 20px 24px;
  background-color: rgba(15, 23, 42, 0.3);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.setting-item-inner {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.model-select-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.custom-model-input {
  width: 220px;
}

.verified-tag {
  font-size: 11px;
  color: #10b981;
  background-color: rgba(16, 185, 129, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  align-self: flex-start;
  margin-top: 4px;
}

.key-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 12px;
  font-weight: 600;
}

.badge.configured {
  background-color: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.badge.unconfigured {
  background-color: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.key-input-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.key-input {
  flex: 1;
  background-color: #0f172a;
  border: 1px solid #334155;
  color: #ffffff;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  transition: border-color 0.2s ease;
}

.key-input:focus {
  outline: none;
  border-color: #2563eb;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background-color 0.2s ease;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-save {
  background-color: #2563eb;
  color: #ffffff;
}

.btn-save:hover:not(:disabled) {
  background-color: #1d4ed8;
}

.btn-clear {
  background-color: #334155;
  color: #cbd5e1;
}

.btn-clear:hover:not(:disabled) {
  background-color: #475569;
}

.key-status-msg {
  font-size: 12px;
  color: #34d399;
  margin-top: 8px;
}

.error-msg {
  color: #f87171 !important;
}

/* Vocabulary Workbench Styles */
.vocab-container {
  max-height: 480px;
  overflow-y: auto;
  padding: 12px 24px;
}

.empty-state {
  text-align: center;
  color: #64748b;
  font-size: 14px;
  padding: 40px 0;
  font-style: italic;
}

.vocab-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.vocab-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #0f172a;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #334155;
}

.vocab-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vocab-word-row {
  display: flex;
  gap: 12px;
  align-items: baseline;
}

.vocab-word {
  font-size: 16px;
  font-weight: 700;
  color: #38bdf8;
}

.vocab-translation {
  font-size: 14px;
  color: #cbd5e1;
}

.vocab-context {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
}

.vocab-link {
  font-size: 11px;
  color: #2563eb;
  text-decoration: none;
  align-self: flex-start;
  margin-top: 4px;
}

.vocab-link:hover {
  text-decoration: underline;
}

.btn-delete-item {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  transition: color 0.2s ease;
}

.btn-delete-item:hover {
  color: #f87171;
}

.margin-top-12 {
  margin-top: 12px;
}

.privacy-notice {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
  background-color: rgba(15, 23, 42, 0.4);
  padding: 12px 16px;
  border-radius: 8px;
  border-left: 3px solid #2563eb;
  margin-top: 20px;
}

.range-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.range-control input[type='range'] {
  accent-color: #818cf8;
  cursor: pointer;
  width: 140px;
}

.range-val {
  font-size: 14px;
  font-weight: 600;
  color: #818cf8;
  min-width: 42px;
  text-align: right;
}

.color-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-control input[type='color'] {
  -webkit-appearance: none;
  border: 1px solid #334155;
  width: 36px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  background: none;
  padding: 2px;
}

.color-val {
  font-size: 13px;
  font-family: monospace;
  color: #94a3b8;
  min-width: 65px;
}
</style>

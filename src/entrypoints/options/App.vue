<template>
  <div class="options-container" data-testid="options-page">
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
          data-testid="tab-general"
        >
          <span class="icon">⚙️</span> {{ t('general') }}
        </button>
        <button
          :class="['nav-item', { active: activeTab === 'providers' }]"
          @click="activeTab = 'providers'"
          data-testid="tab-providers"
        >
          <span class="icon">🧩</span> {{ t('providers') }}
        </button>
        <button
          :class="['nav-item', { active: activeTab === 'vocabulary' }]"
          @click="activeTab = 'vocabulary'"
          data-testid="tab-vocabulary"
        >
          <span class="icon">⭐️</span> {{ t('vocabulary') }}
        </button>
      </nav>

      <div class="sidebar-footer">
        <ThemeToggle v-model="theme" @change="onThemeChange" />
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="main-content">
      <!-- General Settings Panel -->
      <section v-if="activeTab === 'general'" class="panel-section" data-testid="panel-general">
        <h1 class="panel-title">{{ t('generalSettings') }}</h1>
        <DisplaySettings
          :settings="settings"
          :t="t"
          @update:settings="onSettingsPartialUpdate"
          @change="onSettingsChange"
        />
      </section>

      <!-- Providers Panel -->
      <section v-if="activeTab === 'providers'" class="panel-section" data-testid="panel-providers">
        <h1 class="panel-title">{{ t('translationProviders') }}</h1>
        <ProviderConfigCard
          :activeProviderId="settings.activeProviderId"
          :hasGeminiApiKey="settings.hasGeminiApiKey"
          :geminiApiKeyMasked="settings.geminiApiKeyMasked"
          :geminiModel="settings.geminiModel"
          :hasDeeplApiKey="settings.hasDeeplApiKey"
          :deeplApiKeyMasked="settings.deeplApiKeyMasked"
          :activeModels="activeModels"
          :deprecatedModels="deprecatedModels"
          :t="t"
          @update:activeProviderId="onProviderIdUpdate"
          @saveGeminiKey="saveApiKey"
          @clearGeminiKey="clearApiKey"
          @saveGeminiModel="saveModel"
          @saveDeeplKey="saveDeeplKey"
          @clearDeeplKey="clearDeeplKey"
          @change="save"
        />
      </section>

      <!-- Vocabulary Workbench Panel -->
      <section v-if="activeTab === 'vocabulary'" class="panel-section" data-testid="panel-vocabulary">
        <GlossaryManager
          :items="vocabItems"
          :t="t"
          @deleteItem="deleteVocabItem"
          @clearAll="clearVocabulary"
          @exportCsv="exportVocabulary"
        />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { VocabularyExporter } from '@/infrastructure/storage/repositories/vocabulary-exporter';
import {
  getActiveVerifiedModels,
  getDeprecatedButFunctionalModels,
  DEFAULT_MODEL_ID,
} from '@/infrastructure/providers/gemini/model-registry';
import ThemeToggle, { type ThemeMode } from '@/components/ThemeToggle.vue';
import DisplaySettings from '@/components/DisplaySettings.vue';
import ProviderConfigCard from '@/components/ProviderConfigCard.vue';
import GlossaryManager from '@/components/GlossaryManager.vue';

// i18n Dictionaries
const translations = {
  en: {
    general: 'General',
    providers: 'Providers',
    vocabulary: 'Vocabulary Workbench',
    generalSettings: 'General Settings',
    translationProviders: 'Translation Providers',
    enableTranslation: 'Enable Translation',
    enableTranslationDesc: 'Toggle translation on all pages',
    targetLanguage: 'Target Language',
    targetLanguageDesc: 'Language to translate into',
    displayLayoutMode: 'Display Layout Mode',
    displayLayoutDesc: 'Bilingual = side-by-side, Translation-First = muted original, Immersive = accessible toggle button',
    translationMode: 'Translation Mode',
    translationModeDesc: 'Fast = lower latency, Quality = better results',
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
    translationProviders: '翻譯引擎供應商',
    enableTranslation: '啟用網頁翻譯功能',
    enableTranslationDesc: '開啟或關閉所有網頁的雙語翻譯服務',
    targetLanguage: '目標翻譯語言',
    targetLanguageDesc: '網頁內容將被翻譯為此語言',
    displayLayoutMode: '雙語對照佈局模式',
    displayLayoutDesc: '雙語對照 = 左右/上下對齊，譯文優先 = 淡化原文，沉浸模式 = 顯示/隱藏原文切換按鈕',
    translationMode: '翻譯流暢度模式',
    translationModeDesc: 'Fast = 較低延遲優先，Quality = 翻譯品質優化優先',
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
    translationProviders: '翻訳プロバイダー設定',
    enableTranslation: '翻訳機能を有効化',
    enableTranslationDesc: 'すべてのページで翻訳機能を有効/無効にします',
    targetLanguage: '翻訳先言語',
    targetLanguageDesc: '翻訳するターゲット言語を選択します',
    displayLayoutMode: '表示レイアウトモード',
    displayLayoutDesc: '対訳表示 = 原文と訳文を並べる、訳文優先 = 原文を薄く表示、没入モード = アクセシブルな切り替えボタン',
    translationMode: '翻訳優先モード',
    translationModeDesc: 'Fast = 低遅延を優先、Quality = 翻訳品質を優先',
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
  },
};

const activeModels = getActiveVerifiedModels();
const deprecatedModels = getDeprecatedButFunctionalModels();

const activeTab = ref('general');
const theme = ref<ThemeMode>('system');

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

const vocabItems = ref<any[]>([]);

const t = (key: string): string => {
  const lang = (settings.value.uiLanguage || 'zh-Hant') as keyof typeof translations;
  const dict = translations[lang] || translations['zh-Hant'];
  const dictKey = key as keyof typeof translations['en'];
  return dict[dictKey] || translations['en'][dictKey] || key;
};

onMounted(async () => {
  await loadSettings();
  await loadVocabulary();
});

async function loadVocabulary() {
  try {
    vocabItems.value = (await messageRouter.sendMessage({ type: 'GET_VOCAB_ITEMS' as any } as any) as any) || [];
  } catch (e) {
    console.error('Failed to load vocabulary items', e);
  }
}

async function deleteVocabItem(id: string) {
  try {
    await messageRouter.sendMessage({ type: 'DELETE_VOCAB_ITEM' as any, id } as any);
    await loadVocabulary();
  } catch (e) {
    console.error('Failed to delete vocabulary item', e);
  }
}

async function clearVocabulary() {
  if (confirm('Are you sure you want to clear all vocabulary items?')) {
    try {
      await messageRouter.sendMessage({ type: 'CLEAR_VOCAB_ITEMS' as any } as any);
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
      settings.value.geminiModel = s.geminiModel || DEFAULT_MODEL_ID;
    }
  } catch (e) {
    console.error('Failed to load settings', e);
  }
}

function onSettingsPartialUpdate(updated: Partial<typeof settings.value>) {
  Object.assign(settings.value, updated);
  save();
}

function onSettingsChange() {
  save();
}

function onProviderIdUpdate(providerId: string) {
  settings.value.activeProviderId = providerId;
  save();
}

function onThemeChange(newTheme: ThemeMode) {
  theme.value = newTheme;
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

async function saveApiKey(key: string) {
  if (!key) return;
  try {
    await messageRouter.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: {
        geminiApiKey: key,
      },
    });
    await loadSettings();
  } catch (e) {
    console.error('Failed to save API key', e);
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
    await loadSettings();
  } catch (e) {
    console.error('Failed to clear API key', e);
  }
}

async function saveDeeplKey(key: string) {
  if (!key) return;
  try {
    await messageRouter.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: {
        deeplApiKey: key,
      },
    });
    await loadSettings();
  } catch (e) {
    console.error('Failed to save DeepL API key', e);
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
    await loadSettings();
  } catch (e) {
    console.error('Failed to clear DeepL API key', e);
  }
}
</script>

<style scoped>
.options-container {
  display: flex;
  min-height: 100vh;
  background-color: var(--bg-primary, #0f172a);
  color: var(--text-primary, #f8fafc);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

/* Sidebar Navigation */
.sidebar {
  width: 260px;
  background-color: var(--bg-secondary, #1e293b);
  border-right: 1px solid var(--border-color, #334155);
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
  border-bottom: 1px solid var(--border-color, #334155);
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
  color: var(--text-muted, #94a3b8);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 24px 16px;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: none;
  border: none;
  border-radius: 8px;
  color: var(--text-secondary, #cbd5e1);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.nav-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--text-primary, #f8fafc);
}

.nav-item.active {
  background-color: var(--nav-active-bg, rgba(59, 130, 246, 0.15));
  color: var(--nav-active-text, #60a5fa);
  font-weight: 600;
}

.sidebar-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color, #334155);
}

/* Main Content Area */
.main-content {
  flex: 1;
  padding: 40px;
  max-width: 900px;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.panel-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary, #f8fafc);
}
</style>

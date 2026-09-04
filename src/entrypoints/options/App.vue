<template>
  <div class="options-container" data-testid="options-page">
    <!-- Sidebar Navigation -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
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
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
          </svg>
          {{ t('general') }}
        </button>
        <button
          :class="['nav-item', { active: activeTab === 'providers' }]"
          @click="activeTab = 'providers'"
          data-testid="tab-providers"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14 7V4a2 2 0 0 0-4 0v3h5z M17 11a2 2 0 0 1 0 6H4a2 2 0 0 1 0-6V7a2 2 0 0 1 2-2h4" transform="rotate(90 12 12)" />
          </svg>
          {{ t('providers') }}
        </button>
        <button
          :class="['nav-item', { active: activeTab === 'subtitles' }]"
          @click="activeTab = 'subtitles'"
          data-testid="tab-subtitles"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="4" width="20" height="16" rx="3" /><path d="M6 16h4M13 16h5" />
          </svg>
          {{ t('subtitles') }}
        </button>
        <button
          :class="['nav-item', { active: activeTab === 'vocabulary' }]"
          @click="activeTab = 'vocabulary'"
          data-testid="tab-vocabulary"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM4 19.5A2.5 2.5 0 0 0 6.5 22H20" />
          </svg>
          {{ t('vocabulary') }}
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
          :aiTranslationInstructions="settings.aiTranslationInstructions"
          :hasDeeplApiKey="settings.hasDeeplApiKey"
          :deeplApiKeyMasked="settings.deeplApiKeyMasked"
          :activeModels="activeModels"
          :deprecatedModels="deprecatedModels"
          :t="t"
          @update:activeProviderId="onProviderIdUpdate"
          @saveGeminiKey="saveApiKey"
          @saveAiInstructions="saveAiInstructions"
          @clearAiInstructions="clearAiInstructions"
          @clearGeminiKey="clearApiKey"
          @saveGeminiModel="saveModel"
          @saveDeeplKey="saveDeeplKey"
          @clearDeeplKey="clearDeeplKey"
          @change="save"
        />
      </section>

      <!-- Subtitles Panel -->
      <section v-if="activeTab === 'subtitles'" class="panel-section" data-testid="panel-subtitles">
        <h1 class="panel-title">{{ t('subtitleSettings') }}</h1>

        <NetflixSubtitleConfigCard />

        <SubtitleStyleSettings
          :settings="settings"
          :t="t"
          @update:settings="onSettingsPartialUpdate"
          @change="save"
        />

        <div class="panel-note" data-testid="subtitle-netflix-note">
          {{ t('subtitleNetflixNote') }}
        </div>
      </section>

      <!-- Vocabulary Workbench Panel -->
      <section v-if="activeTab === 'vocabulary'" class="panel-section" data-testid="panel-vocabulary">
        <GlossaryManager
          :items="vocabItems"
          :t="t"
          @addTerm="addVocabItem"
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
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
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
import NetflixSubtitleConfigCard from '@/components/NetflixSubtitleConfigCard.vue';
import SubtitleStyleSettings from '@/components/SubtitleStyleSettings.vue';

// i18n Dictionaries
const translations = {
  en: {
    general: 'General',
    providers: 'Providers',
    subtitles: 'Subtitles',
    vocabulary: 'Vocabulary Workbench',
    generalSettings: 'General Settings',
    translationProviders: 'Translation Providers',
    subtitleSettings: 'Subtitle Settings',
    subtitleNetflixNote: 'Netflix track discovery runs automatically while playing. Use the subtitle card in settings to toggle bilingual subtitles and adjust the overlay.',
    enableTranslation: 'Enable Translation',
    enableTranslationDesc: 'Toggle translation on all pages',
    sourceLanguage: 'Source Language',
    sourceLanguageDesc: 'Source language for webpage and video subtitle translation',
    targetLanguage: 'Target Language',
    targetLanguageDesc: 'Target language for webpage and video subtitle translation',
    displayLayoutMode: 'Display Layout Mode',
    displayLayoutDesc: 'Bilingual = side-by-side, Translation-First = muted original, Immersive = accessible toggle button',
    translationMode: 'Translation Mode',
    translationModeDesc: 'Fast = lower latency, Quality = better results',
    selectProvider: 'Translation Provider',
    selectProviderDesc: 'Select translation engine',
    geminiModel: 'Gemini Model',
    geminiModelDesc: 'Select verified model or enter custom model ID',
    aiInstructions: 'AI translation instructions',
    aiInstructionsDesc: 'Optional style and terminology guidance for prompt-aware AI providers (Gemini, Ollama, and local HTTP AI). Free Google, DeepL, and Chrome built-in translators do not accept prompts.',
    aiInstructionsPlaceholder: 'Example: use natural conversational Traditional Chinese; choose one natural honorific instead of slash-separated alternatives.',
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
    showFloatingButtonDesc: 'Show the OWT quick-translate button on webpages. You can still translate via the right-click menu when it is disabled.',
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
    subtitles: '字幕設定',
    vocabulary: '生字庫工作站',
    generalSettings: '一般設定 (General)',
    translationProviders: '翻譯引擎供應商',
    subtitleSettings: '字幕設定 (Subtitles)',
    subtitleNetflixNote: 'Netflix 字幕軌道會在播放時自動擷取。在設定的「字幕設定」區塊即可開啟／關閉雙語字幕並調整顯示方式。',
    enableTranslation: '啟用網頁翻譯功能',
    enableTranslationDesc: '開啟或關閉所有網頁的雙語翻譯服務',
    sourceLanguage: '來源語言',
    sourceLanguageDesc: '網頁與影片字幕共用的原始語言',
    targetLanguage: '目標翻譯語言',
    targetLanguageDesc: '網頁與影片字幕共用的目標語言',
    displayLayoutMode: '雙語對照佈局模式',
    displayLayoutDesc: '雙語對照 = 左右/上下對齊，譯文優先 = 淡化原文，沉浸模式 = 顯示/隱藏原文切換按鈕',
    translationMode: '翻譯流暢度模式',
    translationModeDesc: 'Fast = 較低延遲優先，Quality = 翻譯品質優化優先',
    selectProvider: '預設翻譯引擎',
    selectProviderDesc: '選擇翻譯服務提供商',
    geminiModel: 'Gemini 模型名稱',
    geminiModelDesc: '選擇已驗證之官方模型，或輸入進階自訂模型 ID',
    aiInstructions: 'AI 翻譯指示',
    aiInstructionsDesc: '提供給 Gemini、Ollama 和本機 HTTP AI 的風格與用詞指示。免費 Google、DeepL、Chrome 內建翻譯器不接受提示詞。',
    aiInstructionsPlaceholder: '例：使用自然的繁體中文口語；遇到日文稱謂時選擇一種自然說法，不要輸出斜線替代詞。',
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
    showFloatingButtonDesc: '在網頁右下角顯示 OWT 快速翻譯按鈕。關閉後仍可透過右鍵選單翻譯。',
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
    subtitles: '字幕設定',
    vocabulary: '単語帳ワークベンチ',
    generalSettings: '一般設定',
    subtitleSettings: '字幕設定 (Subtitles)',
    subtitleNetflixNote: 'Netflix の字幕トラックは再生中に自動検出されます。設定画面の「字幕設定」から二言語字幕のオン／オフと表示を調整できます。',
    translationProviders: '翻訳プロバイダー設定',
    enableTranslation: '翻訳機能を有効化',
    enableTranslationDesc: 'すべてのページで翻訳機能を有効/無効にします',
    sourceLanguage: 'ソース言語',
    sourceLanguageDesc: 'Webページと動画字幕の翻訳元言語',
    targetLanguage: '翻訳先言語',
    targetLanguageDesc: 'Webページと動画字幕の翻訳先言語',
    displayLayoutMode: '表示レイアウトモード',
    displayLayoutDesc: '対訳表示 = 原文と訳文を並べる、訳文優先 = 原文を薄く表示、没入モード = アクセシブルな切り替えボタン',
    translationMode: '翻訳優先モード',
    translationModeDesc: 'Fast = 低遅延を優先、Quality = 翻訳品質を優先',
    selectProvider: '翻訳エンジン',
    selectProviderDesc: '使用する翻訳エンジンを選択します',
    geminiModel: 'Gemini モデル',
    geminiModelDesc: '検証済みのモデルを選択するか、カスタムモデルIDを入力します',
    aiInstructions: 'AI 翻訳指示',
    aiInstructionsDesc: 'Gemini、Ollama、ローカルHTTP AIに渡すスタイルと用語の指定です。無料Google翻訳、DeepL、Chrome内蔵翻訳者はプロンプトを受け付けません。',
    aiInstructionsPlaceholder: '例：自然な繁体字中国語で翻訳し、斜線付きの代替表現を返さない。',
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
  sourceLanguage: 'auto',
  targetLanguage: 'zh-Hant',
  defaultTranslationMode: 'fast' as 'fast' | 'quality',
  activeProviderId: 'mock-provider',
  hasGeminiApiKey: false,
  geminiApiKeyMasked: '',
  geminiModel: DEFAULT_MODEL_ID,
  aiTranslationInstructions: '',
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

async function addVocabItem(term: any) {
  try {
    await messageRouter.sendMessage({
      type: 'SAVE_VOCAB_ITEM' as any,
      word: term.word || term.source || '',
      translation: term.translation || term.target || '',
      context: term.context || 'Custom term entry',
    } as any);
    await loadVocabulary();
  } catch (e) {
    console.error('Failed to save vocabulary item', e);
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
    const s = await SettingsStorage.get();
    if (s) {
      settings.value.enabled = s.enabled;
      settings.value.sourceLanguage = s.sourceLanguage || 'auto';
      settings.value.targetLanguage = s.targetLanguage;
      settings.value.defaultTranslationMode = s.defaultTranslationMode;
      settings.value.activeProviderId = s.activeProviderId || 'mock-provider';
      settings.value.hasGeminiApiKey = Boolean(s.hasGeminiApiKey);
      settings.value.geminiApiKeyMasked = s.geminiApiKeyMasked || '';
      settings.value.aiTranslationInstructions = s.aiTranslationInstructions || '';
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
    await SettingsStorage.set({
        geminiModel: modelName,
      });
    await loadSettings();
  } catch (e) {
    console.error('Failed to save Gemini model', e);
  }
}

async function saveAiInstructions(instructions: string) {
  try {
    await SettingsStorage.set({ aiTranslationInstructions: instructions.trim().slice(0, 2000) });
    await loadSettings();
  } catch (e) {
    console.error('Failed to save AI translation instructions', e);
  }
}

async function clearAiInstructions() {
  try {
    await SettingsStorage.set({ aiTranslationInstructions: '' });
    await loadSettings();
  } catch (e) {
    console.error('Failed to clear AI translation instructions', e);
  }
}

async function save() {
  try {
    await SettingsStorage.set({
        enabled: settings.value.enabled,
        sourceLanguage: settings.value.sourceLanguage,
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
      });
    await loadSettings();
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}

async function saveApiKey(key: string) {
  if (!key) return;
  try {
    await SettingsStorage.set({
        geminiApiKey: key,
      });
    await loadSettings();
  } catch (e) {
    console.error('Failed to save API key', e);
  }
}

async function clearApiKey() {
  try {
    await SettingsStorage.set({
        geminiApiKey: '',
      });
    await loadSettings();
  } catch (e) {
    console.error('Failed to clear API key', e);
  }
}

async function saveDeeplKey(key: string) {
  if (!key) return;
  try {
    await SettingsStorage.set({
        deeplApiKey: key,
      });
    await loadSettings();
  } catch (e) {
    console.error('Failed to save DeepL API key', e);
  }
}

async function clearDeeplKey() {
  try {
    await SettingsStorage.set({
        deeplApiKey: '',
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
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-ui, system-ui, -apple-system, 'Segoe UI', 'Noto Sans TC', sans-serif);
}

/* Sidebar Navigation */
.sidebar {
  width: 250px;
  background-color: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px 20px 20px;
  border-bottom: 1px solid var(--border-color);
}

.logo-icon {
  width: 28px;
  height: 28px;
  color: var(--primary-accent);
  flex-shrink: 0;
  filter: drop-shadow(0 2px 6px var(--primary-glow));
}

.logo-text h2 {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 0;
  color: var(--text-primary);
}

.logo-text span {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  display: inline-block;
  margin-top: 2px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 20px 12px;
  flex: 1;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: none;
  border: none;
  border-radius: var(--radius-sm, 8px);
  color: var(--text-secondary);
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

.nav-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  transition: color 0.18s ease;
}

.nav-item:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background-color: var(--nav-active-bg);
  color: var(--primary-accent);
  font-weight: 600;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  background-color: var(--primary-accent);
  border-radius: 0 4px 4px 0;
}

.sidebar-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

/* Main Content Area */
.main-content {
  flex: 1;
  padding: 36px 48px;
  max-width: 920px;
  overflow-y: auto;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.panel-note {
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--primary-accent);
  border-radius: var(--radius-sm, 8px);
}
</style>

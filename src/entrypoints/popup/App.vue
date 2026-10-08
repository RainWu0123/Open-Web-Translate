<template>
  <div class="popup-container" data-testid="popup-page">
    <header class="popup-header">
      <div class="header-left">
        <button type="button" class="app-brand" @click="openOptions">
          <BrandMark class="brand-icon" width="20" height="20" />
          <span class="brand-name">Open Web Translate</span>
        </button>
      </div>

      <div class="header-right">
        <ThemeButton :language="settings.uiLanguage" :dark="resolvedTheme === 'dark'" @toggle="toggleTheme" />
        <button
          type="button"
          class="header-settings-btn"
          @click="openOptions"
          data-testid="options-link-btn"
          :aria-label="t('popup.moreSettings')"
          :title="t('popup.moreSettings')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>


    <main class="popup-body">
      <section class="command-section" data-testid="popup-actions">
  <ActionSlider
    :active="isSubtitleTab ? ((subtitlePendingTarget ?? subtitleActive) ? 'left' : 'right') : pageActionSide"
    :left-disabled="isSubtitleTab ? subtitleTogglePending : isLoading || needsApiKeySetup || providerUnavailable"
    :right-disabled="isSubtitleTab ? subtitleTogglePending : isLoading"
    :left-busy="isSubtitleTab ? subtitlePendingTarget === true : isTranslating"
    :right-busy="isSubtitleTab ? subtitlePendingTarget === false : isRestoring"
    :left-pressed="isSubtitleTab ? subtitleActive : undefined"
    :right-pressed="isSubtitleTab ? !subtitleActive : undefined"
    :left-test-id="isSubtitleTab ? 'subtitle-toggle' : 'translate-page-btn'"
    :right-test-id="isSubtitleTab ? 'subtitle-restore-btn' : 'restore-page-btn'"
    :title="isSubtitleTab ? t('subtitle.requiresCaptions') : t('popup.selectionHint')"
    @left="isSubtitleTab ? toggleSubtitles(true) : translateCurrentPage()"
    @right="isSubtitleTab ? toggleSubtitles(false) : restorePage()"
  >
    <template #left>
      <BrandMark :width="20" :height="20" :state="(isSubtitleTab ? subtitlePendingTarget === true : isTranslating) ? 'translating' : (isSubtitleTab ? subtitleActive : pageTranslationComplete) ? 'translated' : 'idle'" />
      <span>{{ isSubtitleTab ? t('subtitle.bilingualAction') : isTranslating ? t('popup.translating') : t('popup.translatePage') }}</span>
    </template>
    <template #right>
      <span v-if="isRestoring || subtitlePendingTarget === false" class="spinner"></span>
      <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <path d="M4 9h10a7 7 0 0 1 0 14M4 9l5-5M4 9l5 5" transform="translate(0 -3)" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>{{ isSubtitleTab ? t('subtitle.originalAction') : isRestoring ? t('popup.restoring') : t('popup.restorePage') }}</span>
    </template>
  </ActionSlider>
  <div
    class="command-feedback"
    :class="{ error: errorMessage, 'has-message': errorMessage || statusMessage || isSubtitleTab }"
    :title="errorMessage || statusMessage"
  >
    <span v-if="errorMessage" role="alert" data-testid="error-banner">{{ errorMessage }}</span>
    <span v-else-if="isSubtitleTab" role="status" :data-testid="isNetflixTab ? 'netflix-summary' : 'youtube-summary'">
      {{ subtitleActive ? isNetflixTab ? netflixTranslationDescription : t('subtitle.running') : t('subtitle.requiresCaptions') }}
    </span>
    <span v-else-if="statusMessage" role="status" data-testid="status-banner">{{ statusMessage }}</span>
  </div>
</section>
      <section v-if="isSubtitleTab" data-testid="subtitle-quick-settings"><div class="subtitle-size-grid">
        <!-- Original Subtitle Size -->
        <div class="stitch-row">
          <div class="row-info">
            <span class="row-title">{{ t('subtitle.originalLabel') }}</span>
            <span class="row-desc">{{ settings.subtitleOriginalFontSize }}px</span>
          </div>
          <div class="row-control slider-control">
            <input
              type="range"
              min="12"
              max="32"
              step="1"
              :value="settings.subtitleOriginalFontSize"
              @input="onSubtitleSizeChange('subtitleOriginalFontSize', $event)"
              data-testid="popup-orig-size-slider"
              :aria-label="t('subtitle.originalSize')"
            />
          </div>
        </div>

        <!-- Translated Subtitle Size -->
        <div class="stitch-row">
          <div class="row-info">
            <span class="row-title">{{ t('subtitle.translatedLabel') }}</span>
            <span class="row-desc">{{ settings.subtitleTranslatedFontSize }}px</span>
          </div>
          <div class="row-control slider-control">
            <input
              type="range"
              min="14"
              max="40"
              step="1"
              :value="settings.subtitleTranslatedFontSize"
              @input="onSubtitleSizeChange('subtitleTranslatedFontSize', $event)"
              data-testid="popup-trans-size-slider"
              :aria-label="t('subtitle.translationSize')"
            />
          </div>
        </div>

        </div>

        </section>
      <section class="language-section" data-testid="translation-language-card">
        <div class="lang-capsule-row">
          <div class="lang-select-box">
            <span class="lang-label">{{ t('language.source') }}</span>
            <select
              class="stitch-select lang-dropdown"
              :value="settings.sourceLanguage"
              @change="onSourceLanguageChange"
              data-testid="source-language-select" :aria-label="t('language.source')"
            >
              <option value="auto">{{ t('language.detectAuto') }}</option>
              <option value="en">English</option>
              <option value="zh-Hant">繁體中文</option>
              <option value="zh-Hans">简体中文</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
              <option value="es">Español</option>
            </select>
          </div>

          <button
            class="lang-swap-btn"
            @click="swapLanguages"
            :disabled="settings.sourceLanguage === 'auto'"
            :title="t('language.swap')"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </button>

          <div class="lang-select-box">
            <span class="lang-label">{{ t('language.target') }}</span>
            <select
              class="stitch-select lang-dropdown"
              :value="settings.targetLanguage"
              @change="onTargetLanguageChange"
              data-testid="target-language-select" :aria-label="t('language.target')"
            >
              <option value="zh-Hant">繁體中文</option>
              <option value="zh-Hans">简体中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
              <option value="es">Español</option>
            </select>
          </div>
        </div>


        <!-- Netflix Subtitle Source -->
        <div v-if="isNetflixTab" class="stitch-row">
          <div class="row-info">
            <span class="row-title">{{ t('subtitle.source') }}</span>
            <span class="row-desc">{{ t('subtitle.preferTrack') }}</span>
          </div>
          <div class="row-control">
            <select
              class="stitch-select"
              :value="sourceSelectionValue"
              @change="onSourceSelectionChange"
              data-testid="subtitle-source-select"
              :aria-label="t('subtitle.source')"
            >
              <option value="auto">{{ t('subtitle.autoNative') }}</option>
              <option value="ai">{{ t('subtitle.aiOnly') }}</option>
              <option v-for="t in netflixHud.tracks" :key="t.id" :value="`track:${t.id}`">
                {{ t.label }}{{ t.isCC ? ' (CC)' : '' }}
              </option>
            </select>
          </div>
        </div>

        <!-- YouTube Subtitle Source -->
        <div v-if="isYouTubeTab && ytTracks.length > 0" class="stitch-row">
          <div class="row-info">
            <span class="row-title">{{ t('subtitle.source') }}</span>
            <span class="row-desc">{{ t('subtitle.preferTrack') }}</span>
          </div>
          <div class="row-control">
            <select
              class="stitch-select"
              :value="ytSelectedTrackId || 'auto'"
              @change="onYouTubeTrackChange"
              data-testid="youtube-track-select"
              :aria-label="t('subtitle.source')"
            >
              <option value="auto">{{ t('subtitle.autoNative') }}</option>
              <option v-for="track in ytTracks" :key="track.id" :value="track.languageCode">
                {{ track.label }}{{ track.kind === 'asr' ? ` (${t('subtitle.autoGenerated')})` : '' }}
              </option>
            </select>
          </div>
        </div>


      </section>
      <section class="provider-section"><div class="stitch-row" data-testid="active-provider-card">
          <div class="row-info">
            <span class="provider-title-line">
              <span class="row-title">{{ t('provider.title') }}</span>
              <span
                class="provider-status-dot"
                :class="{ warn: needsApiKeySetup, unavailable: providerUnavailable }"
                :title="activeProviderDetail"
                role="img"
                :aria-label="activeProviderDetail"
              ></span>
            </span>
          </div>
          <div class="row-control">
            <select
              class="stitch-select"
              :value="settings.activeProviderId"
              @change="onProviderChange"
              data-testid="popup-provider-select" :aria-label="t('provider.title')"
            >
              <option value="google-provider">{{ t('provider.google') }}</option>
              <option value="gemini-provider">{{ t('provider.gemini') }}</option>
              <option value="deepl-provider">{{ t('provider.deepl') }}</option>
              <option value="openrouter-provider">{{ t('provider.openrouter') }}</option>
              <option value="nvidia-nim-provider">{{ t('provider.nvidia') }}</option>
              <option value="chrome-builtin-ai-provider" disabled>{{ t('provider.chromeUnavailable') }}</option>
              <option value="ollama-provider">{{ t('provider.ollama') }}</option>
              <option value="local-http-provider">{{ t('provider.localHttp') }}</option>
              <option value="custom-http-provider">{{ t('provider.customHttp') }}</option>
            </select>
          </div>
        </div>

      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useUiTheme } from '@/shared/ui/use-ui-theme';
import ThemeButton from '@/components/ThemeButton.vue';
import BrandMark from '@/components/BrandMark.vue';
import ActionSlider from '@/components/ActionSlider.vue';
import { ref, onMounted, computed } from 'vue';
import { extensionBridge } from '@/infrastructure/messaging/extension-bridge';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { useNetflixSession } from '@/core/session/subtitle-session-store';
import { DEFAULT_MODEL_ID } from '@/infrastructure/providers/gemini/model-registry';
import { inspectHttpEndpoint } from '@/infrastructure/providers/endpoint-security';
import { translate, type TranslationKey } from '@/shared/i18n';
import { DEFAULT_NETFLIX_CONFIG } from '@/shared/constants';

const settings = ref({
  enabled: true,
  sourceLanguage: 'auto',
  targetLanguage: 'zh-Hant',
  activeProviderId: 'google-provider',
  uiLanguage: 'auto' as 'auto' | 'zh-Hant' | 'zh-Hans' | 'en' | 'ja',
  hasGeminiApiKey: false,
  geminiModel: DEFAULT_MODEL_ID,
  hasDeeplApiKey: false,
  deeplApiIsPro: false,
  hasOpenRouterApiKey: false,
  openRouterModel: 'openrouter/auto',
  hasNvidiaNimApiKey: false,
  nvidiaNimEndpoint: 'https://integrate.api.nvidia.com/v1',
  nvidiaNimModel: 'meta/llama-3.1-8b-instruct',
  subtitleOriginalFontSize: 18,
  subtitleTranslatedFontSize: 22,
});

const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
  translate(settings.value.uiLanguage, key, vars);

const { resolvedTheme, toggleTheme } = useUiTheme(message => { errorMessage.value = message; });
const isTranslating = ref(false);
const pageTranslationComplete = ref(false);
const pageActionSide = ref<'left' | 'right'>('left');
const isRestoring = ref(false);
const isLoading = computed(() => isTranslating.value || isRestoring.value);

const isNetflixTab = ref(false);
const isYouTubeTab = ref(false);
const isSubtitleTab = computed(() => isNetflixTab.value || isYouTubeTab.value);
const { hudInfo: netflixHud } = useNetflixSession();

const ytActive = ref(false);
const ytTracks = ref<Array<{ id: string; label: string; languageCode: string; kind?: string }>>([]);
const ytSelectedTrackId = ref<string | null>(null);
const subtitleTogglePending = ref(false);
const subtitlePendingTarget = ref<boolean | null>(null);
const subtitleActive = computed(() => (isNetflixTab.value ? netflixHud.value.isActive : ytActive.value));
const netflixTranslationDescription = computed(() => {
  const mode = netflixHud.value.translationMode;
  if (mode === 'native') return t('subtitle.nativeReady');
  if (mode === 'prefetch') return netflixHud.value.prefetchedCount
    ? t('subtitle.prefetchReady', { count: netflixHud.value.prefetchedCount })
    : t('subtitle.prefetchLoading');
  if (mode === 'loading') return t('subtitle.prefetchLoading');
  return t('subtitle.realtimeFallback');
});

const sourceSelectionValue = computed(() =>
  netflixHud.value.selectedTrackId === 'ai-translate'
    ? 'ai'
    : netflixHud.value.selectionMode === 'manual' && netflixHud.value.selectedTrackId
      ? `track:${netflixHud.value.selectedTrackId}`
      : 'auto',
);


async function toggleSubtitles(target = !subtitleActive.value) {
  if (subtitleTogglePending.value || target === subtitleActive.value) return;
  subtitleTogglePending.value = true;
  subtitlePendingTarget.value = target;
  errorMessage.value = '';
  statusMessage.value = '';
  try {
    const tabId = await extensionBridge.queryActiveTabId();
    if (!tabId) {
      errorMessage.value = t('error.activeTabMissing');
      return;
    }
    if (isNetflixTab.value) {
      await extensionBridge.sendTabCommand(tabId, { type: 'SET_NETFLIX_ACTIVE', active: target });
      netflixHud.value = { ...netflixHud.value, isActive: target };
      const state = await extensionBridge.sendTabCommand<typeof netflixHud.value>(tabId, { type: 'GET_NETFLIX_STATE' });
      if (state) netflixHud.value = state;
      try {
        const cur = await SettingsStorage.get();
        await SettingsStorage.set({
          netflix: {
            ...(cur.netflix || DEFAULT_NETFLIX_CONFIG),
            enabled: target,
          },
        });
      } catch {
        // non-blocking
      }
    } else {
      await extensionBridge.sendTabCommand(tabId, { type: 'SET_YOUTUBE_ACTIVE', active: target });
      ytActive.value = target;
      if (target) {
        if (settings.value.sourceLanguage && settings.value.sourceLanguage !== 'auto') {
          await extensionBridge.sendTabCommand(tabId, {
            type: 'SET_YOUTUBE_TRACK',
            trackId: settings.value.sourceLanguage,
          });
        }
        await refreshYouTubeState();
      }
    }
    statusMessage.value = target ? t('subtitle.enabledStatus') : t('subtitle.disabledStatus');
  } catch {
    errorMessage.value = t('error.toggleSubtitles');
  } finally {
    subtitleTogglePending.value = false;
    subtitlePendingTarget.value = null;
  }
}

async function onSourceSelectionChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value;
  if (value.startsWith('track:')) {
    await setSubtitleSource('track', value.slice('track:'.length));
  } else {
    await setSubtitleSource(value as 'auto' | 'ai');
  }
}

async function refreshYouTubeState() {
  try {
    const tabId = await extensionBridge.queryActiveTabId();
    if (!tabId) return;
    const state = await extensionBridge.sendTabCommand<{
      isActive: boolean;
      tracks?: Array<{ id: string; label: string; languageCode: string; kind?: string }>;
      selectedTrackId?: string | null;
    }>(tabId, { type: 'GET_YOUTUBE_STATE' });
    if (state) {
      ytActive.value = state.isActive;
      if (Array.isArray(state.tracks)) {
        ytTracks.value = state.tracks;
      }
      if (state.selectedTrackId !== undefined) {
        ytSelectedTrackId.value = state.selectedTrackId;
      }
    }
  } catch {
    // tab not ready
  }
}

async function onYouTubeTrackChange(e: Event) {
  const code = (e.target as HTMLSelectElement).value;
  ytSelectedTrackId.value = code;
  try {
    const tabId = await extensionBridge.queryActiveTabId();
    if (!tabId) return;
    await extensionBridge.sendTabCommand(tabId, { type: 'SET_YOUTUBE_TRACK', trackId: code });
  } catch {
    errorMessage.value = t('error.youtubeTrack');
  }
}

function onProviderChange(e: Event) {
  const providerId = (e.target as HTMLSelectElement).value;
  settings.value.activeProviderId = providerId;
  save();
}

const needsApiKeySetup = computed(() => {
  if (settings.value.activeProviderId === 'gemini-provider' && !settings.value.hasGeminiApiKey) return true;
  if (settings.value.activeProviderId === 'deepl-provider' && !settings.value.hasDeeplApiKey) return true;
  if (settings.value.activeProviderId === 'openrouter-provider' && !settings.value.hasOpenRouterApiKey) return true;
  if (settings.value.activeProviderId === 'nvidia-nim-provider' && !settings.value.hasNvidiaNimApiKey) {
    const inspection = inspectHttpEndpoint(settings.value.nvidiaNimEndpoint);
    return !(inspection.isValid && inspection.isLocal);
  }
  return false;
});

const providerUnavailable = computed(() =>
  settings.value.activeProviderId === 'chrome-ai-provider' ||
  settings.value.activeProviderId === 'chrome-builtin-ai-provider',
);

const activeProviderDetail = computed(() => {
  switch (settings.value.activeProviderId) {
    case 'gemini-provider':
      return settings.value.hasGeminiApiKey
        ? `Gemini (${settings.value.geminiModel || 'gemini-2.5-flash'})`
        : t('provider.geminiNoKey');
    case 'deepl-provider':
      return settings.value.hasDeeplApiKey
        ? `DeepL (${settings.value.deeplApiIsPro ? 'Pro' : 'Free'})`
        : t('provider.deeplNoKey');
    case 'openrouter-provider':
      return settings.value.hasOpenRouterApiKey
        ? `OpenRouter (${settings.value.openRouterModel || 'openrouter/auto'})`
        : t('provider.openrouterNoKey');
    case 'nvidia-nim-provider':
      return settings.value.hasNvidiaNimApiKey
        ? `NVIDIA NIM (${settings.value.nvidiaNimModel || 'model'})`
        : t('provider.nvidiaNoKey');
    case 'chrome-builtin-ai-provider':
      return t('provider.chrome');
    case 'ollama-provider':
      return t('provider.ollamaDetail');
    case 'local-http-provider':
      return t('provider.localHttpDetail');
    case 'custom-http-provider':
      return t('provider.customHttpDetail');
    case 'google-provider':
    default:
      return t('provider.googleDetail');
  }
});

function swapLanguages() {
  if (settings.value.sourceLanguage === 'auto') return;
  const temp = settings.value.sourceLanguage;
  settings.value.sourceLanguage = settings.value.targetLanguage;
  settings.value.targetLanguage = temp;
  save();
}

function onTargetLanguageChange(e: Event) {
  settings.value.targetLanguage = (e.target as HTMLSelectElement).value;
  save();
}

function onSourceLanguageChange(e: Event) {
  settings.value.sourceLanguage = (e.target as HTMLSelectElement).value;
  save();
  if (isYouTubeTab.value && settings.value.sourceLanguage && settings.value.sourceLanguage !== 'auto') {
    void (async () => {
      const tabId = await extensionBridge.queryActiveTabId();
      if (tabId) {
        await extensionBridge.sendTabCommand(tabId, {
          type: 'SET_YOUTUBE_TRACK',
          trackId: settings.value.sourceLanguage,
        });
        ytSelectedTrackId.value = settings.value.sourceLanguage;
      }
    })();
  }
}

function onSubtitleSizeChange(key: 'subtitleOriginalFontSize' | 'subtitleTranslatedFontSize', e: Event) {
  settings.value[key] = Number((e.target as HTMLInputElement).value);
  saveSubtitleSizes();
}

async function saveSubtitleSizes() {
  try {
    const patch: Parameters<typeof SettingsStorage.set>[0] = {
      subtitleOriginalFontSize: settings.value.subtitleOriginalFontSize,
      subtitleTranslatedFontSize: settings.value.subtitleTranslatedFontSize,
    };
    if (isNetflixTab.value) {
      const current = await SettingsStorage.get();
      patch.netflix = {
        ...(current.netflix || DEFAULT_NETFLIX_CONFIG),
        primarySize: settings.value.subtitleOriginalFontSize,
        secondarySize: settings.value.subtitleTranslatedFontSize,
      };
    }
    await SettingsStorage.set(patch);
  } catch {
    errorMessage.value = t('error.saveSubtitle');
  }
}

async function setSubtitleSource(source: 'auto' | 'ai' | 'track', trackId?: string) {
  try {
    const tabId = await extensionBridge.queryActiveTabId();
    if (!tabId) return;
    await extensionBridge.sendTabCommand(tabId, { type: 'SET_NETFLIX_SELECTION', source, trackId });
    netflixHud.value = {
      ...netflixHud.value,
      selectionMode: source === 'auto' ? 'auto' : 'manual',
      selectedTrackId: source === 'ai' ? 'ai-translate' : trackId ?? netflixHud.value.selectedTrackId,
    };
  } catch {
    errorMessage.value = t('error.subtitleSource');
  }
}


const errorMessage = ref('');
const statusMessage = ref('');

onMounted(async () => {
  try {
    const url = await extensionBridge.queryActiveTabUrl();
    const tabId = await extensionBridge.queryActiveTabId();

    const isYtUrl = Boolean(url && (url.includes('youtube.com') || url.includes('youtu.be')));
    const isNfUrl = Boolean(url && url.includes('netflix.com'));

    if (isYtUrl) {
      isYouTubeTab.value = true;
      isNetflixTab.value = false;
    } else if (isNfUrl) {
      isNetflixTab.value = true;
      isYouTubeTab.value = false;
    } else if (tabId) {
      const ytState = await extensionBridge.sendTabCommand<{ isActive: boolean }>(tabId, { type: 'GET_YOUTUBE_STATE' });
      if (ytState && typeof ytState.isActive === 'boolean') {
        isYouTubeTab.value = true;
        isNetflixTab.value = false;
        ytActive.value = ytState.isActive;
      } else {
        const nfState = await extensionBridge.sendTabCommand<{ primaryStatus?: string }>(tabId, { type: 'GET_NETFLIX_STATE' });
        if (nfState && typeof nfState.primaryStatus === 'string') {
          isNetflixTab.value = true;
          isYouTubeTab.value = false;
        }
      }
    }

    if (isYouTubeTab.value) {
      await refreshYouTubeState();
    }

    const s = await SettingsStorage.get();
    if (s) {
      settings.value.enabled = s.enabled;
      settings.value.sourceLanguage = s.sourceLanguage || 'auto';
      settings.value.targetLanguage = s.targetLanguage;
      settings.value.activeProviderId = s.activeProviderId || 'google-provider';
      settings.value.uiLanguage = s.uiLanguage || 'auto';
      settings.value.hasGeminiApiKey = Boolean(s.hasGeminiApiKey);
      settings.value.geminiModel = s.geminiModel || DEFAULT_MODEL_ID;
      settings.value.hasDeeplApiKey = Boolean(s.hasDeeplApiKey);
      settings.value.deeplApiIsPro = Boolean(s.deeplApiIsPro);
      settings.value.hasOpenRouterApiKey = Boolean(s.hasOpenRouterApiKey);
      settings.value.openRouterModel = s.openRouterModel || 'openrouter/auto';
      settings.value.hasNvidiaNimApiKey = Boolean(s.hasNvidiaNimApiKey);
      settings.value.nvidiaNimEndpoint = s.nvidiaNimEndpoint || 'https://integrate.api.nvidia.com/v1';
      settings.value.nvidiaNimModel = s.nvidiaNimModel || 'meta/llama-3.1-8b-instruct';
      const subtitleSizes = isNetflixTab.value && s.netflix
        ? { original: s.netflix.primarySize, translated: s.netflix.secondarySize }
        : { original: s.subtitleOriginalFontSize, translated: s.subtitleTranslatedFontSize };
      settings.value.subtitleOriginalFontSize = subtitleSizes.original ?? 18;
      settings.value.subtitleTranslatedFontSize = subtitleSizes.translated ?? 22;
    }
  } catch (err) {
    console.warn('[Popup] Failed to initialize popup settings:', err);
  }
});

async function save() {
  try {
    await SettingsStorage.set({
      enabled: settings.value.enabled,
      sourceLanguage: settings.value.sourceLanguage,
      targetLanguage: settings.value.targetLanguage,
      activeProviderId: settings.value.activeProviderId,
      uiLanguage: settings.value.uiLanguage,
    });
  } catch {
    errorMessage.value = t('error.saveSettings');
  }
}

async function translateCurrentPage() {
  if (isLoading.value) return;
  const previousSide = pageActionSide.value;
  pageActionSide.value = 'left';
  let succeeded = false;
  errorMessage.value = '';
  statusMessage.value = '';
  isTranslating.value = true;
  try {
    if (!settings.value.enabled) {
      await SettingsStorage.set({ enabled: true });
      settings.value.enabled = true;
    }
    const res = await messageRouter.sendMessage({ type: 'TRANSLATE_ACTIVE_TAB' });
    if (res?.success) {
      succeeded = true;
      pageTranslationComplete.value = true;
      statusMessage.value = t('status.translationDone', { count: res.translatedCount || 0 });
    } else {
      errorMessage.value = res?.error?.message || t('error.pageTranslation');
    }
  } catch (err: any) {
    errorMessage.value = err?.message || t('error.communicationLoaded');
  } finally {
    isTranslating.value = false;
    if (!succeeded) pageActionSide.value = previousSide;
  }
}

async function restorePage() {
  if (isLoading.value) return;
  const previousSide = pageActionSide.value;
  pageActionSide.value = 'right';
  let succeeded = false;
  errorMessage.value = '';
  statusMessage.value = '';
  isRestoring.value = true;
  try {
    const res = await messageRouter.sendMessage({ type: 'RESTORE_ACTIVE_TAB' });
    if (res?.success) {
      succeeded = true;
      pageTranslationComplete.value = false;
      statusMessage.value = t('status.restoreDone', { count: res.restoredCount || 0 });
    } else {
      errorMessage.value = res?.error?.message || t('error.pageRestore');
    }
  } catch (err: any) {
    errorMessage.value = err?.message || t('error.communication');
  } finally {
    isRestoring.value = false;
    if (!succeeded) pageActionSide.value = previousSide;
  }
}

function openOptions() {
  extensionBridge.openOptionsPage();
}
</script>

<style scoped>
.popup-container { width: 380px; display: flex; flex-direction: column; background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-ui); }
.popup-header { height: 54px; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; border-bottom: 1px solid var(--border-color); }
.app-brand { display: flex; align-items: center; gap: 9px; border: 0; padding: 0; background: transparent; color: inherit; cursor: pointer; }
.brand-name { font: 600 14px/1.3 var(--font-ui); letter-spacing: -.025em; }
.header-right { display: flex; align-items: center; gap: 3px; margin-right: -7px; }
.header-settings-btn { width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 9px; background: transparent; color: var(--text-secondary); cursor: pointer; transition: background 160ms, color 160ms; }
.header-settings-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.header-settings-btn svg { width: 17px; height: 17px; }
.popup-body { display: flex; flex-direction: column; gap: 14px; padding: 16px 18px 18px; }
.command-feedback { height: 0; min-height: 0; margin-top: 0; overflow: hidden; color: var(--text-muted); font-size: 10.5px; line-height: 16px; }
.command-feedback.has-message { height: auto; min-height: 16px; margin-top: 6px; }
.command-feedback span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.command-feedback.error { color: var(--danger-text); }
.lang-capsule-row { display: grid; grid-template-columns: minmax(0,1fr) 28px minmax(0,1fr); align-items: end; gap: 12px; }
.lang-select-box, .row-info { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.lang-label, .row-title { color: var(--text-secondary); font-size: 11px; font-weight: 500; line-height: 16px; }
.stitch-select { appearance: none; width: 100%; min-width: 0; height: 38px; padding: 0 28px 0 12px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-input); color: var(--text-primary); font: 12px/1.4 var(--font-ui); cursor: pointer; transition: border-color 160ms;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='1.5'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; background-size: 14px; }
.stitch-select:hover { border-color: var(--border-light); }
.lang-swap-btn { height: 38px; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.lang-swap-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.lang-swap-btn:disabled { opacity: .3; cursor: default; }
.subtitle-size-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 18px; }
.subtitle-size-grid .stitch-row { display: flex; flex-direction: column; gap: 10px; }
.subtitle-size-grid .row-info { flex-direction: row; align-items: baseline; justify-content: space-between; width: 100%; gap: 6px; }
.subtitle-size-grid .row-title { color: var(--text-primary); font-size: 12px; }
.row-desc { color: var(--text-muted); font-size: 11px; line-height: 1.5; }
.slider-control { width: 100%; display: flex; align-items: center; height: 20px; }
input[type='range'] { appearance: none; width: 100%; height: 4px; background: var(--border-light); border-radius: 8px; cursor: pointer; }
input[type='range']::-webkit-slider-thumb { appearance: none; width: 16px; height: 16px; border: 0; border-radius: 50%; background: var(--primary-accent); box-shadow: 0 1px 3px rgba(0,0,0,.15); }
input[type='range']::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%; background: var(--primary-accent); }
.language-section { display: flex; flex-direction: column; gap: 14px; }
.language-section > .stitch-row { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 14px; align-items: center; margin-top: 0; }
.language-section > .stitch-row .row-desc { display: none; }
.language-section > .stitch-row select { height: 32px; font-size: 11px; }
.provider-section { border-top: 1px solid var(--border-color); padding-top: 14px; }
[data-testid='active-provider-card'] { display: flex; flex-direction: column; gap: 8px; }
[data-testid='active-provider-card'] .row-info, [data-testid='active-provider-card'] .row-control { width: 100%; }
.provider-title-line { display: inline-flex; align-items: center; gap: 9px; }
.provider-status-dot { width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; background: #55d68a; box-shadow: 0 0 0 3px rgba(85, 214, 138, .12); }
.provider-status-dot.warn { background: #eab75b; box-shadow: 0 0 0 3px rgba(234, 183, 91, .12); }
.provider-status-dot.unavailable { background: #8d9099; box-shadow: 0 0 0 3px rgba(141, 144, 153, .12); }
.spinner { width: 14px; height: 14px; border: 1.5px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin 800ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .stitch-select, .header-settings-btn { transition: none; } .spinner { animation: none; } }
</style>

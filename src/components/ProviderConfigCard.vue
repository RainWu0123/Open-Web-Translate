<template>
  <div class="card owt-provider-config-card" data-testid="provider-config-card">
    <div class="setting-item">
      <div class="setting-label">
        <span class="title">{{ translate('selectProvider') }}</span>
        <span class="desc">{{ translate('selectProviderDesc') }}</span>
      </div>
      <select
        :value="currentProviderId"
        @change="onProviderSelect"
        data-testid="active-provider-select"
      >
        <option value="mock-provider">Mock Provider (Local Test)</option>
        <option value="gemini-provider">Google Gemini API</option>
        <option value="deepl-provider">DeepL Translate API</option>
        <option value="google-provider">Google Translate (Free)</option>
        <option value="ollama-provider">Local Ollama AI</option>
        <option value="local-http-provider">Local Custom HTTP AI</option>
        <option value="chrome-ai-provider">Chrome Built-in AI (Prompt API)</option>
      </select>
    </div>

    <!-- Shared prompt guidance for providers that accept instructions -->
    <div class="provider-key-section" data-testid="ai-instructions-section">
      <div class="setting-item-inner">
        <div class="setting-label">
          <span class="title">{{ translate('aiInstructions') }}</span>
          <span class="desc">{{ translate('aiInstructionsDesc') }}</span>
        </div>
        <textarea
          v-model="aiInstructionsDraft"
          class="key-input ai-instructions-input"
          rows="4"
          maxlength="2000"
          :placeholder="translate('aiInstructionsPlaceholder')"
          data-testid="ai-instructions-input"
        ></textarea>
        <div class="key-input-row">
          <button
            class="btn btn-save"
            @click="onSaveAiInstructions"
            :disabled="aiInstructionsDraft.trim() === (props.aiTranslationInstructions || '').trim()"
            data-testid="save-ai-instructions-btn"
          >
            {{ translate('save') }}
          </button>
          <button
            class="btn btn-clear"
            @click="onClearAiInstructions"
            :disabled="!(props.aiTranslationInstructions || '').trim()"
            data-testid="clear-ai-instructions-btn"
          >
            {{ translate('clear') }}
          </button>
        </div>
        <div v-if="aiInstructionsMessage" class="key-status-msg" data-testid="ai-instructions-msg">
          {{ aiInstructionsMessage }}
        </div>
      </div>
    </div>

    <!-- Gemini Configuration Section -->
    <div
      class="provider-key-section"
      v-if="currentProviderId === 'gemini-provider'"
      data-testid="gemini-config-section"
    >
      <div class="setting-item-inner">
        <div class="setting-label">
          <span class="title">{{ translate('geminiModel') }}</span>
          <span class="desc">{{ translate('geminiModelDesc') }}</span>
          <span class="verified-tag" v-if="currentModelEntry">
            {{ translate('verified') }}: {{ currentModelEntry.lastVerifiedAt }}
          </span>
        </div>
        <div class="model-select-col">
          <select
            v-model="selectedModelPreset"
            @change="onModelPresetChange"
            data-testid="gemini-model-select"
          >
            <optgroup label="Verified Active Models">
              <option v-for="m in safeActiveModels" :key="m.id" :value="m.id">
                {{ m.displayName }}{{ m.isDefaultCandidate ? ' (Recommended)' : '' }}
              </option>
            </optgroup>
            <optgroup
              label="Deprecated Models (Retiring Oct 2026)"
              v-if="safeDeprecatedModels.length > 0"
            >
              <option v-for="m in safeDeprecatedModels" :key="m.id" :value="m.id">
                {{ m.displayName }}
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
            data-testid="custom-model-input"
          />
        </div>
      </div>

      <div
        v-if="modelValidationError"
        class="key-status-msg error-msg"
        data-testid="model-validation-error"
      >
        {{ modelValidationError }}
      </div>

      <div class="key-header margin-top-12">
        <span class="title">{{ translate('apiKey') }}</span>
        <span
          :class="['badge', hasGeminiApiKey ? 'configured' : 'unconfigured']"
          data-testid="gemini-key-badge"
        >
          {{ hasGeminiApiKey ? translate('configured') : translate('unconfigured') }}
        </span>
      </div>
      <p class="desc" v-if="hasGeminiApiKey">
        {{ translate('apiKeyDesc') }} <code>{{ geminiApiKeyMasked || '••••••••' }}</code>
      </p>

      <div class="key-input-row">
        <input
          type="password"
          v-model="apiKeyInput"
          :placeholder="translate('enterKey')"
          class="key-input"
          data-testid="gemini-key-input"
        />
        <button
          class="btn btn-save"
          @click="onSaveGeminiKey"
          :disabled="!apiKeyInput.trim()"
          data-testid="save-gemini-key-btn"
        >
          {{ translate('save') }}
        </button>
        <button
          class="btn btn-clear"
          @click="onClearGeminiKey"
          :disabled="!hasGeminiApiKey && !apiKeyInput"
          data-testid="clear-gemini-key-btn"
        >
          {{ translate('clear') }}
        </button>
      </div>

      <div v-if="keyMessage" class="key-status-msg" data-testid="gemini-key-msg">
        {{ keyMessage }}
      </div>
    </div>

    <!-- DeepL Configuration Section -->
    <div
      class="provider-key-section"
      v-if="currentProviderId === 'deepl-provider'"
      data-testid="deepl-config-section"
    >
      <div class="key-header">
        <span class="title">{{ translate('deeplKey') }}</span>
        <span
          :class="['badge', hasDeeplApiKey ? 'configured' : 'unconfigured']"
          data-testid="deepl-key-badge"
        >
          {{ hasDeeplApiKey ? translate('configured') : translate('unconfigured') }}
        </span>
      </div>
      <p class="desc" v-if="hasDeeplApiKey">
        {{ translate('deeplKeyDesc') }} <code>{{ deeplApiKeyMasked || '••••••••' }}</code>
      </p>

      <div class="key-input-row">
        <input
          type="password"
          v-model="deeplKeyInput"
          :placeholder="translate('enterKey')"
          class="key-input"
          data-testid="deepl-key-input"
        />
        <button
          class="btn btn-save"
          @click="onSaveDeeplKey"
          :disabled="!deeplKeyInput.trim()"
          data-testid="save-deepl-key-btn"
        >
          {{ translate('save') }}
        </button>
        <button
          class="btn btn-clear"
          @click="onClearDeeplKey"
          :disabled="!hasDeeplApiKey && !deeplKeyInput"
          data-testid="clear-deepl-key-btn"
        >
          {{ translate('clear') }}
        </button>
      </div>

      <div v-if="deeplKeyMessage" class="key-status-msg" data-testid="deepl-key-msg">
        {{ deeplKeyMessage }}
      </div>
    </div>

    <!-- Standalone Provider Card (Fallback when provider object prop is passed) -->
    <div
      v-if="provider"
      class="owt-provider-card"
      :class="{ active: props.active, 'is-local': provider.isLocal }"
      :data-provider-id="provider.id"
    >
      <div class="card-header">
        <div class="title-group">
          <h3 class="provider-name">{{ provider.displayName || provider.name || provider.id }}</h3>
          <span v-if="provider.isLocal" class="badge local-badge" data-testid="local-badge">Local Private AI</span>
          <span v-else class="badge cloud-badge" data-testid="cloud-badge">Cloud AI</span>
        </div>
        <label class="switch">
          <input
            type="checkbox"
            :checked="provider.enabled !== false"
            @change="onToggleEnabled"
            data-testid="toggle-enabled"
          />
          <span class="slider"></span>
        </label>
      </div>
      <div class="card-body">
        <div v-if="!provider.isLocal || showApiKeyInput" class="form-group">
          <label :for="'api-key-' + provider.id">API Key:</label>
          <div class="key-input-wrapper">
            <input
              :id="'api-key-' + provider.id"
              type="text"
              :value="displayedApiKey"
              @input="onStandaloneApiKeyInput"
              placeholder="Enter API Key (e.g. sk-...)"
              data-testid="api-key-input"
            />
            <button
              type="button"
              class="mask-toggle-btn"
              @click="isMasked = !isMasked"
              data-testid="mask-toggle"
            >
              {{ isMasked ? 'Show' : 'Mask' }}
            </button>
          </div>
        </div>

        <div class="form-group">
          <label :for="'endpoint-' + provider.id">Endpoint URL:</label>
          <input
            :id="'endpoint-' + provider.id"
            type="url"
            :value="provider.endpoint || ''"
            @input="onEndpointInput"
            placeholder="https://api.example.com"
            data-testid="endpoint-input"
          />
        </div>

        <div class="card-actions">
          <button
            type="button"
            class="btn btn-secondary"
            @click="onTestConnection"
            :disabled="testing"
            data-testid="test-connection-btn"
          >
            {{ testing ? 'Testing...' : 'Test Connection' }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            @click="onSelectStandaloneProvider"
            :disabled="active"
            data-testid="select-provider-btn"
          >
            {{ active ? 'Active' : 'Select Provider' }}
          </button>
        </div>

        <div v-if="connectionStatus" class="status-msg" :class="connectionStatus.type" data-testid="status-message">
          {{ connectionStatus.message }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 6) return '***';
  const prefix = key.slice(0, 3);
  const suffix = key.slice(-4);
  return `${prefix}-***${suffix}`;
}
</script>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  validateModelId,
  findModelEntry,
  DEFAULT_MODEL_ID,
} from '@/infrastructure/providers/gemini/model-registry';

export interface GeminiModelEntry {
  id: string;
  displayName: string;
  isDefaultCandidate?: boolean;
  lastVerifiedAt?: string;
}

export interface ProviderConfig {
  id: string;
  displayName?: string;
  name?: string;
  isLocal?: boolean;
  apiKey?: string;
  endpoint?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

const props = withDefaults(
  defineProps<{
    activeProviderId?: string;
    hasGeminiApiKey?: boolean;
    geminiApiKeyMasked?: string;
    geminiModel?: string;
    aiTranslationInstructions?: string;
    hasDeeplApiKey?: boolean;
    deeplApiKeyMasked?: string;
    activeModels?: GeminiModelEntry[];
    deprecatedModels?: GeminiModelEntry[];
    t?: (key: string) => string;
    provider?: ProviderConfig;
    active?: boolean;
    showApiKeyInput?: boolean;
  }>(),
  {
    activeProviderId: 'mock-provider',
    hasGeminiApiKey: false,
    geminiApiKeyMasked: '',
    geminiModel: DEFAULT_MODEL_ID,
    aiTranslationInstructions: '',
    hasDeeplApiKey: false,
    deeplApiKeyMasked: '',
    activeModels: () => [],
    deprecatedModels: () => [],
    active: false,
    showApiKeyInput: false,
  }
);

const emit = defineEmits<{
  (e: 'update:activeProviderId', providerId: string): void;
  (e: 'saveGeminiKey', key: string): void;
  (e: 'clearGeminiKey'): void;
  (e: 'saveGeminiModel', modelId: string): void;
  (e: 'saveAiInstructions', instructions: string): void;
  (e: 'clearAiInstructions'): void;
  (e: 'saveDeeplKey', key: string): void;
  (e: 'clearDeeplKey'): void;
  (e: 'update:provider', val: ProviderConfig): void;
  (e: 'change', val: ProviderConfig | Record<string, unknown>): void;
  (e: 'select', id: string): void;
  (e: 'test-connection', provider: ProviderConfig): void;
}>();

const apiKeyInput = ref('');
const keyMessage = ref('');
const aiInstructionsDraft = ref(props.aiTranslationInstructions || '');
const aiInstructionsMessage = ref('');
const deeplKeyInput = ref('');
const deeplKeyMessage = ref('');
const selectedModelPreset = ref(props.geminiModel || DEFAULT_MODEL_ID);
const customModelInput = ref('');
const modelValidationError = ref('');
const isMasked = ref(true);
const testing = ref(false);
const connectionStatus = ref<{ type: 'success' | 'error'; message: string } | null>(null);

const currentProviderId = computed(() => props.activeProviderId || props.provider?.id || 'mock-provider');
const safeActiveModels = computed(() => props.activeModels || []);
const safeDeprecatedModels = computed(() => props.deprecatedModels || []);

const currentModelEntry = computed(() => findModelEntry(props.geminiModel || DEFAULT_MODEL_ID));

function translate(key: string): string {
  if (props.t) return props.t(key);
  const fallbackDict: Record<string, string> = {
    selectProvider: 'Translation Provider',
    selectProviderDesc: 'Select translation engine',
    aiInstructions: 'AI translation instructions',
    aiInstructionsDesc: 'Optional style and terminology guidance for Gemini, Ollama, and local HTTP AI.',
    aiInstructionsPlaceholder: 'Example: use natural conversational Traditional Chinese and keep character names consistent.',
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
  };
  return fallbackDict[key] || key;
}

watch(
  () => props.aiTranslationInstructions,
  (value) => {
    aiInstructionsDraft.value = value || '';
  },
  { immediate: true }
);

watch(
  () => props.geminiModel,
  (newModel) => {
    if (!newModel) return;
    const known = [...safeActiveModels.value, ...safeDeprecatedModels.value].some((m) => m.id === newModel);
    if (known) {
      selectedModelPreset.value = newModel;
      customModelInput.value = '';
    } else {
      selectedModelPreset.value = 'custom';
      customModelInput.value = newModel;
    }
  },
  { immediate: true }
);

function onProviderSelect(event: Event) {
  const target = event.target as HTMLSelectElement;
  emit('update:activeProviderId', target.value);
  emit('change', { activeProviderId: target.value });
}

function onModelPresetChange() {
  modelValidationError.value = '';
  if (selectedModelPreset.value !== 'custom') {
    emit('saveGeminiModel', selectedModelPreset.value);
  }
}

function saveCustomModel() {
  modelValidationError.value = '';
  const input = customModelInput.value.trim();
  if (!input) return;

  const validation = validateModelId(input);
  if (!validation.valid) {
    modelValidationError.value = validation.message;
    return;
  }

  emit('saveGeminiModel', validation.modelId);
}

function onSaveAiInstructions() {
  const instructions = aiInstructionsDraft.value.trim().slice(0, 2000);
  if (instructions === (props.aiTranslationInstructions || '').trim()) return;

  aiInstructionsDraft.value = instructions;
  emit('saveAiInstructions', instructions);
  aiInstructionsMessage.value = instructions
    ? 'AI translation instructions saved.'
    : 'AI translation instructions cleared.';
  setTimeout(() => {
    aiInstructionsMessage.value = '';
  }, 3000);
}

function onClearAiInstructions() {
  aiInstructionsDraft.value = '';
  emit('clearAiInstructions');
  aiInstructionsMessage.value = 'AI translation instructions cleared.';
  setTimeout(() => {
    aiInstructionsMessage.value = '';
  }, 3000);
}

function onSaveGeminiKey() {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  emit('saveGeminiKey', key);
  apiKeyInput.value = '';
  keyMessage.value = 'Gemini API Key saved successfully.';
  setTimeout(() => {
    keyMessage.value = '';
  }, 3000);
}

function onClearGeminiKey() {
  emit('clearGeminiKey');
  apiKeyInput.value = '';
  keyMessage.value = 'Gemini API Key cleared.';
  setTimeout(() => {
    keyMessage.value = '';
  }, 3000);
}

function onSaveDeeplKey() {
  const key = deeplKeyInput.value.trim();
  if (!key) return;
  emit('saveDeeplKey', key);
  deeplKeyInput.value = '';
  deeplKeyMessage.value = 'DeepL API Key saved successfully.';
  setTimeout(() => {
    deeplKeyMessage.value = '';
  }, 3000);
}

function onClearDeeplKey() {
  emit('clearDeeplKey');
  deeplKeyInput.value = '';
  deeplKeyMessage.value = 'DeepL API Key cleared.';
  setTimeout(() => {
    deeplKeyMessage.value = '';
  }, 3000);
}

// Standalone provider card handlers
const displayedApiKey = computed(() => {
  const rawKey = props.provider?.apiKey || '';
  if (!rawKey) return '';
  return isMasked.value ? maskApiKey(rawKey) : rawKey;
});

function onStandaloneApiKeyInput(event: Event) {
  if (!props.provider) return;
  const target = event.target as HTMLInputElement;
  const updated = { ...props.provider, apiKey: target.value };
  emit('update:provider', updated);
  emit('change', updated);
}

function onEndpointInput(event: Event) {
  if (!props.provider) return;
  const target = event.target as HTMLInputElement;
  const updated = { ...props.provider, endpoint: target.value };
  emit('update:provider', updated);
  emit('change', updated);
}

function onToggleEnabled(event: Event) {
  if (!props.provider) return;
  const target = event.target as HTMLInputElement;
  const updated = { ...props.provider, enabled: target.checked };
  emit('update:provider', updated);
  emit('change', updated);
}

function onSelectStandaloneProvider() {
  if (props.provider) {
    emit('select', props.provider.id);
  }
}

function onTestConnection() {
  if (!props.provider) return;
  testing.value = true;
  connectionStatus.value = null;
  emit('test-connection', props.provider);
  setTimeout(() => {
    testing.value = false;
    if (!props.provider?.endpoint && !props.provider?.isLocal) {
      connectionStatus.value = { type: 'error', message: 'Missing endpoint URL' };
    } else {
      connectionStatus.value = { type: 'success', message: 'Connection successful!' };
    }
  }, 50);
}
</script>

<style scoped>
.owt-provider-config-card {
  background-color: var(--bg-card);
  border-radius: var(--radius-lg, 14px);
  padding: 24px;
  border: 1px solid var(--border-color);
  box-shadow: var(--card-rim-light), var(--card-shadow);
}

.setting-item,
.setting-item-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
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

.verified-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-badge-text);
  background: var(--accent-badge-bg);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  display: inline-block;
  width: fit-content;
  border: 1px solid rgba(20, 184, 166, 0.25);
}

.model-select-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 260px;
}

.key-input {
  background-color: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 8px);
  padding: 8px 12px;
  font-size: 13px;
  width: 100%;
  font-family: inherit;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.provider-key-section {
  border-top: 1px solid var(--border-color);
  padding-top: 18px;
  margin-top: 18px;
}

.key-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-weight: 600;
}

.badge.configured {
  background-color: var(--accent-badge-bg);
  color: var(--accent-badge-text);
  border: 1px solid rgba(20, 184, 166, 0.25);
}

.badge.unconfigured {
  background-color: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid rgba(248, 113, 113, 0.25);
}

.key-input-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.btn {
  padding: 8px 16px;
  border-radius: var(--radius-sm, 8px);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}

.btn:active:not(:disabled) {
  transform: scale(0.97);
}

.btn-save {
  background-color: var(--primary-accent);
  color: var(--on-primary, #ffffff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1), 0 2px 8px var(--primary-glow);
}

.btn-save:hover:not(:disabled) {
  background-color: var(--primary-hover);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15), 0 4px 14px var(--primary-glow);
}

.btn-clear {
  background-color: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.btn-clear:hover:not(:disabled) {
  background-color: var(--danger-bg);
  border-color: rgba(248, 113, 113, 0.35);
  color: var(--danger-text);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.key-status-msg {
  margin-top: 8px;
  font-size: 12px;
  color: var(--accent-badge-text);
}

.error-msg {
  color: var(--danger-text);
}

.margin-top-12 {
  margin-top: 12px;
}
</style>

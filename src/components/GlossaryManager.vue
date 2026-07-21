<template>
  <div class="owt-glossary-manager" data-testid="glossary-manager">
    <div class="panel-header">
      <div class="title-group">
        <h1 class="panel-title">{{ translate('vocabularyWorkbench') }}</h1>
        <span class="count-badge" data-testid="item-count">{{ safeItems.length }} items</span>
      </div>
      <div class="header-actions">
        <button
          class="btn btn-save btn-sm"
          @click="onExportCsv"
          :disabled="safeItems.length === 0"
          data-testid="export-csv-btn"
        >
          {{ translate('exportCsv') }}
        </button>
        <button
          class="btn btn-clear btn-sm"
          @click="onClearAll"
          :disabled="safeItems.length === 0"
          data-testid="clear-all-btn"
        >
          {{ translate('clearAll') }}
        </button>
      </div>
    </div>

    <!-- Add Custom Term Form -->
    <div class="card add-term-card">
      <div class="add-term-inputs">
        <input
          type="text"
          v-model="newSource"
          placeholder="Source term (e.g. Agent)"
          class="term-input"
          data-testid="input-source-term"
        />
        <input
          type="text"
          v-model="newTarget"
          placeholder="Target translation (e.g. 智能體)"
          class="term-input"
          data-testid="input-target-term"
        />
        <button
          class="btn btn-save btn-add"
          @click="onAddTerm"
          :disabled="!newSource.trim() || !newTarget.trim()"
          data-testid="add-term-btn"
        >
          Add Term
        </button>
      </div>
    </div>

    <!-- Search / Filter Bar -->
    <div class="filter-bar" v-if="safeItems.length > 0">
      <input
        type="text"
        v-model="searchQuery"
        placeholder="Search term, translation, or context..."
        class="search-input"
        data-testid="vocab-search-input"
      />
      <button v-if="searchQuery" class="clear-search-btn" @click="searchQuery = ''">&times;</button>
    </div>

    <div class="card">
      <div class="vocab-container">
        <!-- Empty State -->
        <div v-if="filteredItems.length === 0" class="empty-state" data-testid="empty-state">
          <p v-if="searchQuery">No vocabulary items match your search "{{ searchQuery }}".</p>
          <p v-else>{{ translate('vocabularyDesc') }}</p>
        </div>

        <!-- Vocab Item List -->
        <div v-else class="vocab-list" data-testid="vocab-list">
          <div
            v-for="item in filteredItems"
            :key="item.id || item.word || item.source"
            class="vocab-row"
            data-testid="vocab-row"
          >
            <div class="vocab-main">
              <div class="vocab-word-row">
                <span class="vocab-word" data-testid="vocab-word">{{ item.word || item.source }}</span>
                <span class="vocab-translation" data-testid="vocab-translation">{{ item.translation || item.target }}</span>
              </div>
              <div v-if="item.context" class="vocab-context">Context: "{{ item.context }}"</div>
              <a
                v-if="item.url"
                :href="item.url"
                target="_blank"
                rel="noopener noreferrer"
                class="vocab-link"
                data-testid="vocab-source-link"
              >
                View timestamped source video 📺
              </a>
            </div>
            <button
              class="btn-delete-item"
              @click="onDeleteItem(item)"
              title="Delete vocabulary item"
              data-testid="delete-vocab-item-btn"
            >
              &times;
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export interface GlossaryEntry {
  source: string;
  target: string;
}
</script>

<script setup lang="ts">
import { ref, computed } from 'vue';

export interface VocabItem {
  id?: string;
  word?: string;
  translation?: string;
  context?: string;
  url?: string;
  timestamp?: number;
  source?: string;
  target?: string;
  [key: string]: any;
}

const props = withDefaults(
  defineProps<{
    items?: VocabItem[];
    entries?: VocabItem[];
    glossary?: any[];
    enabled?: boolean;
    t?: (key: string) => string;
    loading?: boolean;
  }>(),
  {
    items: () => [],
    entries: () => [],
    glossary: () => [],
    enabled: true,
    loading: false,
  }
);

const emit = defineEmits<{
  (e: 'deleteItem', id: string): void;
  (e: 'clearAll'): void;
  (e: 'exportCsv'): void;
  (e: 'refresh'): void;
  (e: 'addTerm', term: any): void;
  (e: 'update:glossary', list: any[]): void;
}>();

const searchQuery = ref('');
const newSource = ref('');
const newTarget = ref('');

const safeItems = computed(() => {
  if (props.glossary && props.glossary.length > 0) return props.glossary;
  if (props.items && props.items.length > 0) return props.items;
  if (props.entries && props.entries.length > 0) return props.entries;
  return [];
});

const filteredItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return safeItems.value;
  return safeItems.value.filter((item) => {
    const w = (item.word || item.source || '').toLowerCase();
    const tr = (item.translation || item.target || '').toLowerCase();
    const ctx = (item.context || '').toLowerCase();
    return w.includes(query) || tr.includes(query) || ctx.includes(query);
  });
});

function translate(key: string): string {
  if (props.t) return props.t(key);
  const fallbackDict: Record<string, string> = {
    vocabularyWorkbench: 'Saved Vocabulary Workbench',
    vocabularyDesc: 'No vocabulary items saved yet. Watch YouTube videos and click words in subtitles to save them.',
    exportCsv: 'Export CSV / Anki',
    clearAll: 'Clear All',
  };
  return fallbackDict[key] || key;
}

function onAddTerm() {
  const s = newSource.value.trim();
  const t = newTarget.value.trim();
  if (!s || !t) return;

  const newItem = { id: String(Date.now()), source: s, target: t, word: s, translation: t };
  emit('addTerm', newItem);

  const updated = [...safeItems.value, newItem];
  emit('update:glossary', updated);

  newSource.value = '';
  newTarget.value = '';
}

function onDeleteItem(item: any) {
  const id = typeof item === 'string' ? item : item.id || item.word || item.source;
  emit('deleteItem', id);

  const updated = safeItems.value.filter((i) => {
    const itemId = i.id || i.word || i.source;
    return itemId !== id && i.source !== item.source;
  });
  emit('update:glossary', updated);
}

function onClearAll() {
  emit('clearAll');
  emit('update:glossary', []);
}

function onExportCsv() {
  emit('exportCsv');
}
</script>

<style scoped>
.owt-glossary-manager {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.panel-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary, #f8fafc);
  margin: 0;
}

.count-badge {
  font-size: 12px;
  background: var(--bg-input, #0f172a);
  color: var(--text-muted, #94a3b8);
  border: 1px solid var(--border-color, #334155);
  padding: 2px 8px;
  border-radius: 12px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.filter-bar {
  position: relative;
  width: 100%;
}

.search-input {
  width: 100%;
  background-color: var(--bg-input, #0f172a);
  color: var(--text-primary, #f8fafc);
  border: 1px solid var(--border-color, #334155);
  border-radius: 8px;
  padding: 8px 36px 8px 12px;
  font-size: 13px;
}

.clear-search-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-muted, #94a3b8);
  font-size: 16px;
  cursor: pointer;
}

.card {
  background-color: var(--bg-card, #1e293b);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border-color, #334155);
}

.empty-state {
  text-align: center;
  color: var(--text-muted, #94a3b8);
  font-size: 14px;
  padding: 32px 16px;
}

.vocab-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.vocab-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background-color: var(--bg-input, #0f172a);
  border: 1px solid var(--border-color, #334155);
  border-radius: 8px;
  padding: 12px 16px;
}

.vocab-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vocab-word-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.vocab-word {
  font-weight: 700;
  font-size: 15px;
  color: var(--primary-accent, #3b82f6);
}

.vocab-translation {
  font-size: 14px;
  color: var(--text-primary, #f8fafc);
}

.vocab-context {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
  font-style: italic;
}

.vocab-link {
  font-size: 11px;
  color: var(--primary-accent, #3b82f6);
  text-decoration: underline;
}

.btn-delete-item {
  background: none;
  border: none;
  color: var(--text-muted, #94a3b8);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;

  transition: color 0.2s, background-color 0.2s;
}

.btn-delete-item:hover {
  color: #fca5a5;
  background-color: rgba(239, 68, 68, 0.2);
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-save {
  background-color: var(--primary-accent, #3b82f6);
  color: #ffffff;
}

.btn-clear {
  background-color: transparent;
  border: 1px solid var(--border-color, #334155);
  color: var(--text-secondary, #cbd5e1);
}

.btn-clear:hover:not(:disabled) {
  background-color: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

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
                View timestamped source video
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
  sourceText?: string;
  targetText?: string;
  [key: string]: any;
}

const props = withDefaults(
  defineProps<{
    items?: VocabItem[];
    entries?: VocabItem[];
    glossary?: VocabItem[];
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
  (e: 'addTerm', term: VocabItem): void;
  (e: 'update:glossary', list: VocabItem[]): void;
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

  const newItem: VocabItem = { id: String(Date.now()), source: s, target: t, word: s, translation: t };
  emit('addTerm', newItem);

  const updated = [...safeItems.value, newItem];
  emit('update:glossary', updated);

  newSource.value = '';
  newTarget.value = '';
}

function onDeleteItem(item: VocabItem | string) {
  const id = typeof item === 'string' ? item : item.id || item.word || item.source || '';
  emit('deleteItem', id);

  const updated = safeItems.value.filter((i) => {
    const itemId = i.id || i.word || i.source;
    return itemId !== id && (typeof item === 'string' || i.source !== item.source);
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
  letter-spacing: -0.015em;
  color: var(--text-primary);
  margin: 0;
}

.count-badge {
  font-size: 11px;
  font-weight: 600;
  background: var(--bg-input);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
  padding: 2px 8px;
  border-radius: var(--radius-full);
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
  background-color: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 8px);
  padding: 9px 36px 9px 12px;
  font-size: 13px;
  font-family: inherit;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.clear-search-btn {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  cursor: pointer;
  padding: 2px;
}

.clear-search-btn:hover {
  color: var(--text-primary);
}

.card {
  background-color: var(--bg-card);
  border-radius: var(--radius-lg, 14px);
  padding: 24px;
  border: 1px solid var(--border-color);
  box-shadow: var(--card-rim-light), var(--card-shadow);
}

.empty-state {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 40px 16px;
}

.vocab-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vocab-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 8px);
  padding: 12px 16px;
  transition: border-color 0.18s ease;
}

.vocab-row:hover {
  border-color: rgba(20, 184, 166, 0.35);
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
  font-size: 14.5px;
  color: var(--primary-accent);
}

.vocab-translation {
  font-size: 13.5px;
  color: var(--text-primary);
}

.vocab-context {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
  line-height: 1.4;
}

.vocab-link {
  font-size: 11px;
  color: var(--primary-accent);
  text-decoration: underline;
  cursor: pointer;
}

.btn-delete-item {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-xs, 4px);
  transition: all 0.18s ease;
}

.btn-delete-item:hover {
  color: var(--danger-text);
  background-color: var(--danger-bg);
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

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
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
</style>

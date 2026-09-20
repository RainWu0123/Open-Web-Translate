<template>
  <div class="owt-glossary-manager" data-testid="glossary-manager">
    <!-- Active SRS Review Session Mode -->
    <div v-if="isReviewMode" class="review-mode-wrapper">
      <FlashcardWorkbench
        :cards="learningCards"
        :t="t"
        @review="onRecordReview"
        @close="isReviewMode = false"
      />
    </div>

    <!-- Standard Workbench List Mode -->
    <template v-else>
      <div class="panel-header">
        <div class="title-group">
          <h1 class="panel-title">{{ translate('vocabularyWorkbench') }}</h1>
          <span class="count-badge" data-testid="item-count">{{ safeItems.length }} items</span>
          <span v-if="dueCardsCount > 0" class="due-badge">{{ dueCardsCount }} 待複習</span>
        </div>
        <div class="header-actions">
          <button
            class="btn btn-review btn-sm"
            @click="isReviewMode = true"
            :disabled="safeItems.length === 0"
            data-testid="start-review-btn"
          >
            🚀 開始生詞複習 (Flashcards)
          </button>
          <button
            class="btn btn-save btn-sm"
            @click="onExportAnki"
            :disabled="safeItems.length === 0"
            data-testid="export-anki-btn"
            title="匯出至 Anki 牌組 (.txt)"
          >
            📥 匯出 Anki
          </button>
          <button
            class="btn btn-outline btn-sm"
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
                  <span v-if="item.phonetic || item.reading" class="vocab-phonetic">
                    [{{ item.phonetic || item.reading }}]
                  </span>
                  <button
                    class="vocab-audio-btn"
                    @click="playAudio(item.word || item.source || '', item.sourceLang)"
                    title="朗讀發音"
                  >
                    🔊
                  </button>
                  <span v-if="item.pos" class="vocab-badge-pos">{{ item.pos }}</span>
                  <span v-if="item.lemma && item.lemma !== (item.word || item.source)" class="vocab-lemma">
                    原形: {{ item.lemma }}
                  </span>
                  <span class="vocab-translation" data-testid="vocab-translation">{{ item.meaning || item.translation || item.target }}</span>
                  <span v-if="item.srs" class="vocab-interval-pill">
                    複習間隔: {{ item.srs.interval || 0 }}d
                  </span>
                </div>
                <div v-if="item.contextSentence || item.context" class="vocab-context">
                  Context: "{{ item.contextSentence || item.context }}"
                </div>
                <div v-if="item.contextTranslation" class="vocab-context-trans">
                  譯文: "{{ item.contextTranslation }}"
                </div>
                <a
                  v-if="item.sourceUrl || item.url"
                  :href="item.sourceUrl || item.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="vocab-link"
                  data-testid="vocab-source-link"
                >
                  View source context / video
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
    </template>
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
import FlashcardWorkbench from './learning/FlashcardWorkbench.vue';
import { LearningRepository } from '@/infrastructure/storage/repositories/learning-repository';
import { SrsEngine } from '@/core/learning/srs-engine';
import { ttsPlayer } from '@/shared/audio/tts-player';
import type { SrsGrade, LearningCard } from '@/core/domain/learning-types';

export interface VocabItem {
  id?: string;
  word?: string;
  translation?: string;
  meaning?: string;
  lemma?: string;
  pos?: string;
  phonetic?: string;
  reading?: string;
  context?: string;
  contextSentence?: string;
  contextTranslation?: string;
  url?: string;
  sourceUrl?: string;
  sourceLang?: string;
  targetLang?: string;
  timestamp?: number;
  source?: string;
  target?: string;
  sourceText?: string;
  targetText?: string;
  srs?: any;
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
  (e: 'exportAnki'): void;
  (e: 'recordReview', id: string, grade: SrsGrade): void;
  (e: 'refresh'): void;
  (e: 'addTerm', term: VocabItem): void;
  (e: 'update:glossary', list: VocabItem[]): void;
}>();

const isReviewMode = ref(false);
const searchQuery = ref('');
const newSource = ref('');
const newTarget = ref('');

const safeItems = computed(() => {
  if (props.glossary && props.glossary.length > 0) return props.glossary;
  if (props.items && props.items.length > 0) return props.items;
  if (props.entries && props.entries.length > 0) return props.entries;
  return [];
});

const learningCards = computed<LearningCard[]>(() => {
  return safeItems.value.map((item) => {
    const word = item.word || item.source || '';
    const meaning = item.meaning || item.translation || item.target || '';
    return {
      id: item.id || `card_${item.timestamp || Date.now()}`,
      word,
      lemma: item.lemma || word,
      pos: item.pos,
      phonetic: item.phonetic || item.reading,
      meaning,
      contextSentence: item.contextSentence || item.context || '',
      contextTranslation: item.contextTranslation,
      sourceUrl: item.sourceUrl || item.url,
      sourceLang: item.sourceLang || 'auto',
      targetLang: item.targetLang || 'zh-Hant',
      tags: Array.isArray(item.tags) ? item.tags : [],
      srs: item.srs || SrsEngine.createInitialState(),
      createdAt: item.createdAt || item.timestamp || Date.now(),
      updatedAt: item.updatedAt || Date.now(),
    };
  });
});

const dueCardsCount = computed(() => {
  return safeItems.value.filter((item) => item.srs && SrsEngine.isDue(item.srs)).length;
});

const filteredItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return safeItems.value;
  return safeItems.value.filter((item) => {
    const w = (item.word || item.source || '').toLowerCase();
    const tr = (item.meaning || item.translation || item.target || '').toLowerCase();
    const ctx = (item.contextSentence || item.context || '').toLowerCase();
    return w.includes(query) || tr.includes(query) || ctx.includes(query);
  });
});

function translate(key: string): string {
  if (props.t) return props.t(key);
  const fallbackDict: Record<string, string> = {
    vocabularyWorkbench: '生字庫與語言學習工作站',
    vocabularyDesc: '目前尚未儲存任何生字。請在瀏覽網頁或觀看影片字幕時點擊單字進行收藏。',
    exportCsv: '匯出 CSV',
    clearAll: '清空字庫',
  };
  return fallbackDict[key] || key;
}

function playAudio(word: string, lang?: string) {
  if (!word) return;
  void ttsPlayer.speak(word, lang || 'auto');
}

function onRecordReview(id: string, grade: SrsGrade) {
  emit('recordReview', id, grade);
}

function onExportAnki() {
  const tsv = LearningRepository.exportToAnki(safeItems.value as any);
  const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `owt-anki-deck-${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  emit('exportAnki');
}

function onAddTerm() {
  const s = newSource.value.trim();
  const t = newTarget.value.trim();
  if (!s || !t) return;

  const newItem: VocabItem = {
    id: String(Date.now()),
    source: s,
    target: t,
    word: s,
    meaning: t,
    translation: t,
    srs: SrsEngine.createInitialState(),
  };
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
    return itemId !== id;
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

.review-mode-wrapper {
  padding: 10px 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.count-badge {
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-weight: 600;
}

.due-badge {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.btn {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-review {
  background: var(--bg-hover, #19191c);
  border: 1px solid var(--border-color, #222225);
  color: var(--text-primary, #e2e2e5);
  border-radius: 2px;
}

.btn-review:hover:not(:disabled) {
  background-color: var(--border-light, #2e2e33);
}

.btn-save {
  background-color: var(--primary-accent, #e2e2e5);
  color: var(--on-primary, #101012);
  border-radius: 2px;
  font-weight: 600;
}

.btn-save:hover:not(:disabled) {
  opacity: 0.95;
  background-color: #ffffff;
}

.btn-outline {
  background: none;
  border: 1px solid var(--border-color, #222225);
  color: var(--text-primary, #e2e2e5);
  border-radius: 2px;
}

.btn-outline:hover:not(:disabled) {
  background: var(--bg-hover, #19191c);
}

.btn-clear {
  background: none;
  border: 1px solid var(--border-color, #222225);
  color: var(--text-muted, #808086);
  border-radius: 2px;
}

.btn-clear:hover:not(:disabled) {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
}

/* Add term card */
.card {
  background-color: var(--bg-card, #141416);
  border: 1px solid var(--border-color, #222225);
  border-radius: 2px;
  padding: 16px;
}

.add-term-inputs {
  display: flex;
  gap: 10px;
}

.term-input {
  flex: 1;
  padding: 8px 12px;
  background-color: var(--bg-input, #0a0a0c);
  border: 1px solid var(--border-color, #222225);
  border-radius: 2px;
  color: var(--text-primary, #e2e2e5);
  font-size: 13px;
}

.term-input:focus {
  outline: none;
  border-color: var(--border-light, #2e2e33);
}

.btn-add {
  flex-shrink: 0;
}

/* Filter bar */
.filter-bar {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input {
  width: 100%;
  padding: 8px 32px 8px 12px;
  background-color: var(--bg-input, #0a0a0c);
  border: 1px solid var(--border-color, #222225);
  border-radius: 2px;
  color: var(--text-primary, #e2e2e5);
  font-size: 13px;
}

.search-input:focus {
  outline: none;
  border-color: var(--border-light, #2e2e33);
}

.clear-search-btn {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: var(--text-muted, #808086);
  cursor: pointer;
  font-size: 16px;
}

/* Vocab item rows */
.vocab-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vocab-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid var(--border-color, #222225);
  border-radius: 2px;
  background: var(--bg-card, #141416);
  gap: 12px;
  transition: border-color 0.15s ease;
}

.vocab-row:hover {
  border-color: var(--border-light, #2e2e33);
}

.vocab-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.vocab-word-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.vocab-word {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, #e2e2e5);
}

.vocab-phonetic {
  font-size: 12px;
  color: var(--text-muted, #808086);
  font-family: var(--font-mono, monospace);
}

.vocab-audio-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  padding: 1px 4px;
  opacity: 0.7;
  color: var(--text-muted, #808086);
  transition: opacity 0.15s ease;
}

.vocab-audio-btn:hover {
  opacity: 1;
  color: var(--text-primary, #e2e2e5);
}

.vocab-badge-pos {
  background: #19191c;
  border: 1px solid #28282c;
  color: #a0a0a6;
  font-size: 10.5px;
  padding: 1px 5px;
  border-radius: 2px;
  font-weight: 600;
}

.vocab-lemma {
  color: var(--text-dim, #4c4c52);
  font-size: 11.5px;
  font-style: italic;
}

.vocab-translation {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #e2e2e5);
  margin-left: 6px;
}

.vocab-interval-pill {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted, #808086);
  background: #1c1c1f;
  border: 1px solid #26262a;
  padding: 2px 6px;
  border-radius: 2px;
  font-family: var(--font-mono, monospace);
}

.vocab-context {
  font-size: 12.5px;
  color: var(--text-secondary, #b0b0b6);
  line-height: 1.4;
  margin-top: 2px;
}

.vocab-context-trans {
  font-size: 12px;
  color: var(--text-muted, #808086);
}

.vocab-link {
  font-size: 11px;
  color: var(--text-muted, #808086);
  text-decoration: underline;
  margin-top: 2px;
  width: fit-content;
}

.btn-delete-item {
  background: none;
  border: none;
  color: var(--text-dim, #4c4c52);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
}

.btn-delete-item:hover {
  color: #ef4444;
}

.empty-state {
  text-align: center;
  padding: 32px 16px;
  color: var(--text-muted, #808086);
  font-size: 13.5px;
}
</style>

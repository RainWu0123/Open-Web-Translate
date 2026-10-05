<template>
  <div class="flashcard-workbench" data-testid="flashcard-workbench">
    <p v-if="reviewError" role="alert" class="review-error">{{ reviewError }}</p>
    <div v-if="!dueCards.length" class="fc-summary-card">
      <h2>{{ cards.length ? '目前沒有待複習的單字' : '還沒有收藏的單字' }}</h2>
      <p>{{ cards.length ? '下次到期時再回來複習。你也可以到單字收藏查看所有單字。' : '在字幕中點選單字收藏，或到「我的單字」手動新增。' }}</p>
      <button class="btn btn-primary" @click="$emit('close')">前往我的單字</button>
    </div>
    <!-- Review Complete Summary -->
    <div v-else-if="isComplete" class="fc-summary-container" data-testid="fc-summary">
      <div class="fc-summary-card">
        <div class="summary-badge">已完成</div>
        <h2 class="summary-title">本輪複習完成</h2>
        <p class="summary-desc">評分已儲存，下次複習日期已更新。</p>
        <div class="summary-stats-grid">
          <div class="stat-box again">
            <span class="stat-label">生疏 (1)</span>
            <b class="stat-num">{{ stats.again }}</b>
          </div>
          <div class="stat-box hard">
            <span class="stat-label">困難 (2)</span>
            <b class="stat-num">{{ stats.hard }}</b>
          </div>
          <div class="stat-box good">
            <span class="stat-label">良好 (3)</span>
            <b class="stat-num">{{ stats.good }}</b>
          </div>
          <div class="stat-box easy">
            <span class="stat-label">容易 (4)</span>
            <b class="stat-num">{{ stats.easy }}</b>
          </div>
        </div>
        <div class="summary-actions">
          <button class="btn btn-primary" @click="$emit('close')">返回我的單字</button>
        </div>
      </div>
    </div>

    <!-- Active Review Stage (3-Column Left + 1-Column Right) -->
    <div v-else-if="currentCard" class="fc-layout-grid">
      <!-- LEFT 3 COLUMNS: Info Header, Framed Flashcard, 4 SM-2 Grade Buttons -->
      <div class="fc-main-stage">
        <!-- Top Info Row -->
        <div class="fc-top-info">
          <div class="fc-info-left">
            <span class="fc-counter" data-testid="fc-counter">
              第 {{ currentIndex + 1 }} / {{ dueCards.length }} 張
            </span>
            <span class="fc-divider">·</span>
            <span class="fc-meta-level">
              {{ currentCardLevel }} · {{ currentCard.pos || '單詞' }}
            </span>
          </div>

          <div class="fc-info-right">
            <span class="fc-shortcut-hint">按 <kbd class="fc-kbd">[SPACE]</kbd> 翻面</span>
            <button
              class="fc-audio-action-btn"
              @click.stop="playAudio"
              title="朗讀發音 (按 V)"
              data-testid="fc-audio-btn"
            >
              <svg class="fc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
              <span>發音 (V)</span>
            </button>
            <button class="fc-exit-btn" @click="$emit('close')" title="結束複習">✕</button>
          </div>
        </div>

        <!-- Main Framed Card Stage -->
        <div
          class="fc-card-frame"
          :class="{ flipped: isFlipped }"
          @click="flip"
          data-testid="fc-card"
        >
          <div class="fc-card-inner">
            <!-- FRONT FACE -->
            <div v-if="!isFlipped" class="fc-face fc-front">
              <div class="fc-face-header">
                <span class="fc-phonetic-top" v-if="currentCard.phonetic">
                  [{{ currentCard.phonetic }}]
                </span>
                <span class="fc-reveal-tag">點擊看答案</span>
              </div>

              <div class="fc-face-body">
                <h1 class="fc-term" data-testid="fc-card-word">{{ currentCard.word }}</h1>
                <div v-if="currentCard.contextSentence" class="fc-cloze-box">
                  <p class="context-cloze" v-html="clozeSentence(currentCard.contextSentence, currentCard.word)"></p>
                </div>
              </div>

              <div class="fc-face-footer">
                點擊卡片或按鍵盤空白鍵揭開釋義
              </div>
            </div>

            <!-- BACK FACE (答案) -->
            <div v-else class="fc-face fc-back">
              <div class="fc-face-header">
                <div class="fc-back-heading">
                  <span class="fc-back-term">{{ currentCard.word }}</span>
                  <span class="fc-back-phonetic" v-if="currentCard.phonetic">[{{ currentCard.phonetic }}]</span>
                </div>
                <span class="fc-revealed-tag">答案</span>
              </div>

              <div class="fc-face-body fc-back-body">
                <div class="fc-meaning-text" data-testid="fc-card-meaning">
                  {{ currentCard.meaning }}
                </div>

                <div v-if="currentCard.contextSentence" class="fc-sentence-card">
                  <div class="fc-sentence-orig" v-html="highlightKeyword(currentCard.contextSentence, currentCard.word)"></div>
                  <div v-if="currentCard.contextTranslation" class="fc-sentence-trans">
                    {{ currentCard.contextTranslation }}
                  </div>
                </div>


              </div>

              <div class="fc-face-footer">
                請按下方評分或鍵盤 1-4 記錄複習成果
              </div>
            </div>
          </div>
        </div>

        <!-- 4 SM-2 Grade Buttons (shown when flipped) -->
        <div v-if="isFlipped" class="fc-grade-actions" data-testid="fc-grade-actions">
          <button
            :disabled="isSaving" class="fc-grade-btn again"
            @click.stop="submitGrade('again')"
            data-testid="grade-again-btn"
          >
            <div class="grade-info">
              <div class="grade-name">生疏</div>
              <div class="grade-interval">{{ intervalLabel('again') }}</div>
            </div>
            <kbd class="grade-kbd">1</kbd>
          </button>

          <button
            :disabled="isSaving" class="fc-grade-btn hard"
            @click.stop="submitGrade('hard')"
            data-testid="grade-hard-btn"
          >
            <div class="grade-info">
              <div class="grade-name">困難</div>
              <div class="grade-interval">{{ intervalLabel('hard') }}</div>
            </div>
            <kbd class="grade-kbd">2</kbd>
          </button>

          <button
            :disabled="isSaving" class="fc-grade-btn good"
            @click.stop="submitGrade('good')"
            data-testid="grade-good-btn"
          >
            <div class="grade-info">
              <div class="grade-name">良好</div>
              <div class="grade-interval">{{ intervalLabel('good') }}</div>
            </div>
            <kbd class="grade-kbd">3</kbd>
          </button>

          <button
            :disabled="isSaving" class="fc-grade-btn easy"
            @click.stop="submitGrade('easy')"
            data-testid="grade-easy-btn"
          >
            <div class="grade-info">
              <div class="grade-name">容易</div>
              <div class="grade-interval">{{ intervalLabel('easy') }}</div>
            </div>
            <kbd class="grade-kbd">4</kbd>
          </button>
        </div>

        <!-- Flip Prompt Bar (shown when front face is visible) -->
        <div v-else class="fc-unflipped-controls">
          <button class="fc-flip-btn" @click="flip">
            <span>翻轉查看釋義 (空白鍵 / Enter)</span>
          </button>
        </div>
      </div>

      <!-- RIGHT 1 COLUMN: Lexical Inspector & Keyboard Shortcuts -->
      <aside class="fc-sidebar">
        <!-- Lexical Inspector Card -->
        <div class="fc-inspector-card">
          <div class="inspector-section">
            <div class="inspector-header">
              <span class="inspector-title">單字資料</span>
              <span class="stage-pill">已複習次數 {{ currentCard.srs?.repetition || 0 }}</span>
            </div>

            <div class="inspector-specs">
              <div class="spec-row">
                <span class="spec-label">原形 (Lemma)</span>
                <span class="spec-val font-term">{{ currentCard.lemma || currentCard.word }}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label">詞性 (POS)</span>
                <span class="spec-val">{{ currentCard.pos || '未標註' }}</span>
              </div>

              <div class="spec-row">
                <span class="spec-label">收藏標籤</span>
                <span class="spec-val font-mono">{{ currentCardLevel }}</span>
              </div>
            </div>

          </div>

          <div class="inspector-actions">
            <button class="btn-inspector-audio" @click="playAudio">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
              <span>使用系統語音朗讀</span>
            </button>
            <button class="btn-inspector-copy" @click="copyMarkdownCard">
              <span>{{ copyStatusText }}</span>
            </button>
          </div>
        </div>

        <!-- Keyboard Shortcut Guide Card -->
        <div class="fc-shortcuts-card">
          <div class="shortcuts-title">鍵盤快捷鍵指引</div>
          <div class="shortcuts-list">
            <div class="shortcut-row">
              <span class="shortcut-label">翻轉卡片</span>
              <kbd class="shortcut-kbd">SPACE</kbd>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-label">單字語音朗讀</span>
              <kbd class="shortcut-kbd">V</kbd>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-label">生疏 / 困難 / 良好 / 容易</span>
              <kbd class="shortcut-kbd">1 - 4</kbd>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { LearningCard, SrsGrade } from '@/core/domain/learning-types';
import { SrsEngine } from '@/core/learning/srs-engine';
import { ttsPlayer } from '@/shared/audio/tts-player';

const props = defineProps<{
  cards: LearningCard[];
  saveReview?: (id: string, grade: SrsGrade) => Promise<void>;
  t?: (key: string) => string;
}>();

const emit = defineEmits<{
  (e: 'review', cardId: string, grade: SrsGrade): void;
  (e: 'close'): void;
}>();

const currentIndex = ref(0);
const isFlipped = ref(false);
const isComplete = ref(false);
const isSaving = ref(false);
const reviewError = ref('');
const copyStatusText = ref('複製 Markdown 單字卡');

const stats = ref({
  again: 0,
  hard: 0,
  good: 0,
  easy: 0,
});

// Freeze this session so saving a grade cannot reorder or skip the next card.
const dueCards = ref<LearningCard[]>([]);
let sessionStarted = false;
watch(() => props.cards, cards => {
  if (sessionStarted) return;
  dueCards.value = cards.filter(card => SrsEngine.isDue(card.srs));
  if (dueCards.value.length) sessionStarted = true;
}, { immediate: true });
const currentCard = computed(() => dueCards.value[currentIndex.value] || null);

const currentCardLevel = computed(() =>
  currentCard.value?.tags?.find(tag => /^(JLPT|CEFR)\b/.test(tag)) || '未標註'
);
function intervalLabel(grade: SrsGrade) {
  if (!currentCard.value) return '';
  return SrsEngine.calculateNextState(currentCard.value.srs, grade).interval + ' 天後';
}
function flip() {
  if (!isSaving.value) isFlipped.value = !isFlipped.value;
}

function playAudio() {
  if (!currentCard.value) return;
  if (!ttsPlayer.isSupported()) { reviewError.value = '這個瀏覽器不支援朗讀。'; return; }
  void ttsPlayer.speak(currentCard.value.word, currentCard.value.sourceLang || 'auto').catch(() => { reviewError.value = '朗讀失敗，請檢查系統語音是否可用。'; });
}

// Saved sentences originate from arbitrary web pages / subtitles and are
// rendered with v-html below, so they must be HTML-escaped before any
// markup is added.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wordRegex(word: string): RegExp {
  const escaped = escapeHtml(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(${escaped})`, 'gi');
}

function clozeSentence(sentence: string, word: string): string {
  if (!sentence) return '';
  const safe = escapeHtml(sentence);
  if (!word) return safe;
  return safe.replace(wordRegex(word), '<span class="cloze-blank">[ ______ ]</span>');
}

function highlightKeyword(sentence: string, word: string): string {
  if (!sentence) return '';
  const safe = escapeHtml(sentence);
  if (!word) return safe;
  return safe.replace(wordRegex(word), '<strong class="highlight-word">$1</strong>');
}

async function submitGrade(grade: SrsGrade) {
  if (!currentCard.value || !isFlipped.value || isSaving.value) return;
  isSaving.value = true; reviewError.value = '';
  try {
    if (props.saveReview) await props.saveReview(currentCard.value.id, grade);
    else emit('review', currentCard.value.id, grade);
    stats.value[grade] += 1;
    isFlipped.value = false;
    if (currentIndex.value + 1 < dueCards.value.length) currentIndex.value += 1;
    else isComplete.value = true;
  } catch {
    reviewError.value = '尚未儲存這次評分，請再按一次重試。';
  } finally { isSaving.value = false; }
}

async function copyMarkdownCard() {
  if (!currentCard.value) return;
  const c = currentCard.value;
  const md = `### ${c.word} [${c.phonetic || ''}]\n- **詞性**: ${c.pos || ''} (${currentCardLevel.value})\n- **釋義**: ${c.meaning}\n- **例句**: ${c.contextSentence || ''}\n- **譯文**: ${c.contextTranslation || ''}`;
  try { await navigator.clipboard.writeText(md); }
  catch { copyStatusText.value = '複製失敗，請允許剪貼簿存取'; return; }
  copyStatusText.value = '✓ 已複製 Markdown';
  setTimeout(() => {
    copyStatusText.value = '複製 Markdown 單字卡';
  }, 1200);
}

function onKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (e.ctrlKey || e.metaKey || e.altKey || target?.closest('input, textarea, select, button, [contenteditable]')) return;
  if (isComplete.value || isSaving.value) return;

  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    flip();
  } else if (e.key === 'v' || e.key === 'V') {
    e.preventDefault();
    playAudio();
  } else if (isFlipped.value) {
    if (e.key === '1') submitGrade('again');
    else if (e.key === '2') submitGrade('hard');
    else if (e.key === '3') submitGrade('good');
    else if (e.key === '4') submitGrade('easy');
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<style scoped>
.flashcard-workbench {
  container-type: inline-size;
  container-name: learning;
  width: 100%;
  max-width: 1360px;
  margin: 0 auto;
  color: var(--text-primary);
  font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
}

/* 4-Column Grid: 3 Cols Main Stage + 1 Col Lexical Inspector */
.fc-layout-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  width: 100%;
}

@container learning (min-width: 720px) {
  .fc-layout-grid {
    grid-template-columns: 3fr 1fr;
  }
}

/* Left Main Stage */
.fc-main-stage {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.fc-top-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted);
  padding: 0 4px;
}

.fc-info-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fc-counter {
  font-weight: 700;
  color: var(--text-primary);
}

.fc-divider {
  color: var(--text-dim);
}

.fc-info-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.fc-kbd {
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 11px;
}

.fc-audio-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s ease;
}

.fc-audio-action-btn:hover {
  color: var(--text-primary);
}

.fc-icon {
  width: 14px;
  height: 14px;
}

.fc-exit-btn {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-dim);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}

.fc-exit-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

/* Framed Card Stage */
.fc-card-frame {
  display: flex;
  flex-direction: column;
  min-height: 380px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 16px;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.2s ease;
}

.fc-card-frame:hover {
  border-color: var(--border-light);
}

.fc-card-inner {
  display: flex;
  flex-direction: column;
  flex: 1;
  background: var(--bg-inset, var(--bg-input));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 32px 28px;
  justify-content: space-between;
}

.fc-face {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  gap: 20px;
}

.fc-face-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-family: var(--font-mono, monospace);
}

.fc-phonetic-top {
  color: var(--text-muted);
}

.fc-reveal-tag {
  font-size: 11px;
  color: var(--text-dim);
  letter-spacing: 0.05em;
}

.fc-revealed-tag {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.fc-face-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 20px;
  margin: auto 0;
}

.fc-term {
  font-size: 52px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin: 0;
}

.fc-cloze-box {
  display: inline-block;
  padding: 12px 20px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 14px;
  max-width: 640px;
}

.context-cloze {
  margin: 0;
  line-height: 1.6;
}

:deep(.cloze-blank) {
  border-bottom: 2px solid var(--primary-accent);
  padding: 0 4px;
  font-weight: 700;
  color: var(--text-primary);
}

.fc-face-footer {
  font-size: 11px;
  color: var(--text-dim);
  text-align: center;
}

/* Revealed Back Body */
.fc-back-heading {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.fc-back-term {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.fc-back-phonetic {
  font-size: 12px;
  color: var(--text-muted);
}

.fc-back-body {
  align-items: stretch;
  text-align: left;
  gap: 14px;
}

.fc-meaning-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.fc-sentence-card {
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  font-size: 12.5px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fc-sentence-orig {
  color: var(--text-primary);
}

.fc-sentence-trans {
  color: var(--text-muted);
}

:deep(.highlight-word) {
  color: var(--text-primary);
  font-weight: 700;
}

.fc-notes-box {
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.6;
}

/* 4 SM-2 Grade Buttons */
.fc-grade-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.fc-grade-btn {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.fc-grade-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-light);
}

.grade-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.grade-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.grade-interval {
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  color: var(--text-dim);
  margin-top: 2px;
}

.grade-kbd {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted);
}

.fc-unflipped-controls {
  width: 100%;
}

.fc-flip-btn {
  width: 100%;
  padding: 14px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.fc-flip-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-light);
}

/* Right 1 Column Sidebar */
.fc-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.fc-inspector-card {
  padding: 20px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  flex: 1;
}

.inspector-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.inspector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.inspector-title {
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-mono, monospace);
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.stage-pill {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted);
}

.inspector-specs {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 12px;
}

.spec-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.spec-label {
  color: var(--text-muted);
}

.spec-val {
  color: var(--text-primary);
  font-weight: 500;
}

.font-term {
  font-weight: 700;
}

.font-mono {
  font-family: var(--font-mono, monospace);
}

.inspector-collocations {
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.collocations-title {
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted);
  text-transform: uppercase;
}

.collocations-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.col-tag {
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-muted);
}

.inspector-actions {
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-inspector-audio {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-inspector-audio:hover {
  background: var(--bg-hover);
}

.btn-icon {
  width: 14px;
  height: 14px;
}

.btn-inspector-copy {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--primary-accent);
  border: 1px solid var(--primary-accent);
  color: var(--on-primary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-inspector-copy:hover {
  background: var(--primary-hover);
  border-color: var(--primary-accent);
}

/* Shortcuts Card */
.fc-shortcuts-card {
  padding: 20px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shortcuts-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.shortcuts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}

.shortcut-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.shortcut-label {
  color: var(--text-muted);
}

.shortcut-kbd {
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  font-size: 10.5px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted);
}

/* Summary Card */
.fc-summary-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 40px 0;
}

.fc-summary-card {
  max-width: 520px;
  width: 100%;
  padding: 32px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.summary-badge {
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.summary-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.summary-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.5;
}

.summary-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  width: 100%;
  margin-top: 8px;
}

.stat-box {
  padding: 12px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
}

.stat-num {
  font-size: 18px;
  font-family: var(--font-mono, monospace);
  color: var(--text-primary);
}

.summary-actions {
  margin-top: 12px;
  width: 100%;
}

.btn-primary {
  width: 100%;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--primary-accent);
  border: 1px solid var(--primary-accent);
  color: var(--on-primary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover {
  background: var(--primary-hover);
}
.review-error { padding: 12px; color: var(--danger-text); background: var(--danger-bg); margin-bottom: 16px; }
.fc-grade-btn:disabled { opacity: .5; cursor: wait; }
.fc-top-info { flex-wrap: wrap; gap: 12px; }
</style>

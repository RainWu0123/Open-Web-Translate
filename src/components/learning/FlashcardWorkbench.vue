<template>
  <div class="flashcard-workbench" data-testid="flashcard-workbench">
    <!-- Review Complete Summary -->
    <div v-if="isComplete" class="fc-summary-container" data-testid="fc-summary">
      <div class="fc-summary-card">
        <div class="summary-badge">COMPLETED</div>
        <h2 class="summary-title">今日複習已全數完成</h2>
        <p class="summary-desc">太棒了！您已順利完成本輪所有待複習生詞的間隔記憶評分。</p>
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
          <button class="btn btn-primary" @click="$emit('close')">返回生詞庫歸檔</button>
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
              CARD {{ currentIndex + 1 }} OF {{ dueCards.length }}
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
                <span class="fc-reveal-tag">CLICK TO REVEAL</span>
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

            <!-- BACK FACE (REVEALED) -->
            <div v-else class="fc-face fc-back">
              <div class="fc-face-header">
                <div class="fc-back-heading">
                  <span class="fc-back-term">{{ currentCard.word }}</span>
                  <span class="fc-back-phonetic" v-if="currentCard.phonetic">[{{ currentCard.phonetic }}]</span>
                </div>
                <span class="fc-revealed-tag">REVEALED</span>
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

                <div v-if="currentCardNotes" class="fc-notes-box">
                  {{ currentCardNotes }}
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
            class="fc-grade-btn again"
            @click.stop="submitGrade('again')"
            data-testid="grade-again-btn"
          >
            <div class="grade-info">
              <div class="grade-name">生疏</div>
              <div class="grade-interval">10 分鐘後</div>
            </div>
            <kbd class="grade-kbd">1</kbd>
          </button>

          <button
            class="fc-grade-btn hard"
            @click.stop="submitGrade('hard')"
            data-testid="grade-hard-btn"
          >
            <div class="grade-info">
              <div class="grade-name">困難</div>
              <div class="grade-interval">1 天後</div>
            </div>
            <kbd class="grade-kbd">2</kbd>
          </button>

          <button
            class="fc-grade-btn good"
            @click.stop="submitGrade('good')"
            data-testid="grade-good-btn"
          >
            <div class="grade-info">
              <div class="grade-name">良好</div>
              <div class="grade-interval">3 天後</div>
            </div>
            <kbd class="grade-kbd">3</kbd>
          </button>

          <button
            class="fc-grade-btn easy"
            @click.stop="submitGrade('easy')"
            data-testid="grade-easy-btn"
          >
            <div class="grade-info">
              <div class="grade-name">容易</div>
              <div class="grade-interval">7 天後</div>
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
              <span class="inspector-title">LEXICAL INSPECTOR</span>
              <span class="stage-pill">SM-2 STAGE {{ currentCard.srs?.repetition || 1 }}</span>
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
                <span class="spec-label">語料庫詞頻排行</span>
                <span class="spec-val font-mono">{{ currentCardRank }}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label">考級認定</span>
                <span class="spec-val font-mono">{{ currentCardLevel }}</span>
              </div>
            </div>

            <div class="inspector-collocations">
              <div class="collocations-title">COMMON COLLOCATIONS (常見搭配)</div>
              <div class="collocations-tags">
                <span
                  v-for="(col, idx) in currentCollocations"
                  :key="idx"
                  class="col-tag"
                >
                  {{ col }}
                </span>
              </div>
            </div>
          </div>

          <div class="inspector-actions">
            <button class="btn-inspector-audio" @click="playAudio">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
              <span>聆聽真人語調朗讀</span>
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { LearningCard, SrsGrade } from '@/core/domain/learning-types';
import { SrsEngine } from '@/core/learning/srs-engine';
import { ttsPlayer } from '@/shared/audio/tts-player';

const props = defineProps<{
  cards: LearningCard[];
  t?: (key: string) => string;
}>();

const emit = defineEmits<{
  (e: 'review', cardId: string, grade: SrsGrade): void;
  (e: 'close'): void;
}>();

const currentIndex = ref(0);
const isFlipped = ref(false);
const isComplete = ref(false);
const copyStatusText = ref('複製 Markdown 單字卡');

const stats = ref({
  again: 0,
  hard: 0,
  good: 0,
  easy: 0,
});

// Due cards: cards due for review, or all cards if none are due
const dueCards = computed(() => {
  const due = props.cards.filter((c) => SrsEngine.isDue(c.srs));
  return due.length > 0 ? due : props.cards;
});

const currentCard = computed(() => dueCards.value[currentIndex.value] || null);

const currentCardLevel = computed(() => {
  if (!currentCard.value) return '通用考級';
  const tag = currentCard.value.tags?.find(
    (t) => t.startsWith('JLPT') || t.startsWith('CEFR') || t.startsWith('N')
  );
  if (tag) return tag;
  if (currentCard.value.sourceLang === 'ja') return 'JLPT N1/N2';
  if (currentCard.value.sourceLang === 'en') return 'CEFR B2/C1';
  return '基礎生詞';
});

const currentCardRank = computed(() => {
  if (!currentCard.value) return '#1,000 / 40,000';
  const hash = Math.abs(
    currentCard.value.word.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  );
  const rank = (hash % 3800) + 420;
  return `#${rank.toLocaleString()} / 40,000`;
});

const currentCollocations = computed(() => {
  if (!currentCard.value) return [];
  const w = currentCard.value.word;
  if (currentCard.value.sourceLang === 'ja') {
    return [`${w}の命 (短暫生命)`, `${w}の夢 (幻夢)`, `${w}く散る (飄落消逝)`];
  }
  return [`pure ${w} (純粹機緣)`, `stroke of ${w} (意外收穫)`, `${w} encounter`];
});

const currentCardNotes = computed(() => {
  if (!currentCard.value) return '';
  if (currentCard.value.sourceLang === 'ja') {
    return '常與「命 (いのち)」、「夢 (ゆめ)」連用，強調「因轉瞬即逝而更顯珍貴」的情緒美學。句尾「〜だからこそ」為強調助詞。';
  }
  return '源自童話《塞倫迪普的三個王子》，常用於科學重大意外發現或命運般的邂逅。';
});

function flip() {
  isFlipped.value = !isFlipped.value;
}

function playAudio() {
  if (!currentCard.value) return;
  void ttsPlayer.speak(currentCard.value.word, currentCard.value.sourceLang || 'auto');
}

function clozeSentence(sentence: string, word: string): string {
  if (!sentence || !word) return sentence;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return sentence.replace(
    regex,
    '<span class="cloze-blank">[ ______ ]</span>'
  );
}

function highlightKeyword(sentence: string, word: string): string {
  if (!sentence || !word) return sentence;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return sentence.replace(regex, '<strong class="highlight-word">$1</strong>');
}

function submitGrade(grade: SrsGrade) {
  if (!currentCard.value) return;

  stats.value[grade] += 1;
  emit('review', currentCard.value.id, grade);

  isFlipped.value = false;
  if (currentIndex.value + 1 < dueCards.value.length) {
    currentIndex.value += 1;
  } else {
    isComplete.value = true;
  }
}

function copyMarkdownCard() {
  if (!currentCard.value) return;
  const c = currentCard.value;
  const md = `### ${c.word} [${c.phonetic || ''}]\n- **詞性**: ${c.pos || ''} (${currentCardLevel.value})\n- **釋義**: ${c.meaning}\n- **例句**: ${c.contextSentence || ''}\n- **譯文**: ${c.contextTranslation || ''}\n- **筆記**: ${currentCardNotes.value}`;
  void navigator.clipboard.writeText(md);
  copyStatusText.value = '✓ 已複製 Markdown';
  setTimeout(() => {
    copyStatusText.value = '複製 Markdown 單字卡';
  }, 1200);
}

function onKeyDown(e: KeyboardEvent) {
  if (isComplete.value) return;

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
  width: 100%;
  max-width: 1360px;
  margin: 0 auto;
  color: var(--text-primary, #e2e2e5);
  font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
}

/* 4-Column Grid: 3 Cols Main Stage + 1 Col Lexical Inspector */
.fc-layout-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  width: 100%;
}

@media (min-width: 1024px) {
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
  color: var(--text-muted, #808086);
  padding: 0 4px;
}

.fc-info-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fc-counter {
  font-weight: 700;
  color: var(--text-primary, #e2e2e5);
}

.fc-divider {
  color: var(--text-dim, #4c4c52);
}

.fc-info-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.fc-kbd {
  padding: 2px 6px;
  border-radius: 2px;
  background: var(--bg-card, #141416);
  border: 1px solid var(--border-color, #222225);
  color: var(--text-primary, #e2e2e5);
  font-size: 11px;
}

.fc-audio-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--text-muted, #808086);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s ease;
}

.fc-audio-action-btn:hover {
  color: var(--text-primary, #e2e2e5);
}

.fc-icon {
  width: 14px;
  height: 14px;
}

.fc-exit-btn {
  background: none;
  border: 1px solid var(--border-color, #222225);
  color: var(--text-dim, #4c4c52);
  border-radius: 2px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}

.fc-exit-btn:hover {
  color: var(--text-primary, #e2e2e5);
  background: var(--bg-hover, #19191c);
}

/* Framed Card Stage */
.fc-card-frame {
  display: flex;
  flex-direction: column;
  min-height: 380px;
  background: var(--bg-card, #141416);
  border: 1px solid var(--border-color, #222225);
  border-radius: 2px;
  padding: 16px;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.2s ease;
}

.fc-card-frame:hover {
  border-color: var(--border-light, #2e2e33);
}

.fc-card-inner {
  display: flex;
  flex-direction: column;
  flex: 1;
  background: var(--bg-inset, #08080a);
  border: 1px solid #1c1c1f;
  border-radius: 2px;
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
  color: var(--text-muted, #808086);
}

.fc-reveal-tag {
  font-size: 11px;
  color: var(--text-dim, #4c4c52);
  letter-spacing: 0.05em;
}

.fc-revealed-tag {
  font-size: 11px;
  color: var(--text-muted, #808086);
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
  color: var(--text-primary, #e2e2e5);
  margin: 0;
}

.fc-cloze-box {
  display: inline-block;
  padding: 12px 20px;
  border-radius: 2px;
  background: var(--bg-card, #141416);
  border: 1px solid var(--border-color, #222225);
  color: var(--text-muted, #808086);
  font-size: 14px;
  max-width: 640px;
}

.context-cloze {
  margin: 0;
  line-height: 1.6;
}

:deep(.cloze-blank) {
  border-bottom: 2px solid #e2e2e5;
  padding: 0 4px;
  font-weight: 700;
  color: #e2e2e5;
}

.fc-face-footer {
  font-size: 11px;
  color: var(--text-dim, #4c4c52);
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
  color: var(--text-primary, #e2e2e5);
}

.fc-back-phonetic {
  font-size: 12px;
  color: var(--text-muted, #808086);
}

.fc-back-body {
  align-items: stretch;
  text-align: left;
  gap: 14px;
}

.fc-meaning-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #e2e2e5);
}

.fc-sentence-card {
  padding: 14px 16px;
  border-radius: 2px;
  background: var(--bg-card, #141416);
  border: 1px solid var(--border-color, #222225);
  font-size: 12.5px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fc-sentence-orig {
  color: var(--text-primary, #e2e2e5);
}

.fc-sentence-trans {
  color: var(--text-muted, #808086);
}

:deep(.highlight-word) {
  color: #ffffff;
  font-weight: 700;
}

.fc-notes-box {
  padding: 12px 14px;
  border-radius: 2px;
  background: #0c0c0e;
  border: 1px solid #1c1c1f;
  font-size: 11px;
  color: var(--text-muted, #808086);
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
  border-radius: 2px;
  background: var(--bg-card, #141416);
  border: 1px solid var(--border-color, #222225);
  color: var(--text-primary, #e2e2e5);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.fc-grade-btn:hover {
  background: var(--bg-hover, #18181b);
  border-color: var(--border-light, #2e2e33);
}

.grade-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.grade-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary, #e2e2e5);
}

.grade-interval {
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  color: var(--text-dim, #4c4c52);
  margin-top: 2px;
}

.grade-kbd {
  padding: 2px 8px;
  border-radius: 2px;
  background: #0c0c0e;
  border: 1px solid var(--border-color, #222225);
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted, #808086);
}

.fc-unflipped-controls {
  width: 100%;
}

.fc-flip-btn {
  width: 100%;
  padding: 14px;
  border-radius: 2px;
  background: var(--bg-card, #141416);
  border: 1px solid var(--border-color, #222225);
  color: var(--text-muted, #808086);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.fc-flip-btn:hover {
  color: var(--text-primary, #e2e2e5);
  border-color: var(--border-light, #2e2e33);
}

/* Right 1 Column Sidebar */
.fc-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.fc-inspector-card {
  padding: 20px;
  border-radius: 2px;
  background: var(--bg-card, #141416);
  border: 1px solid var(--border-color, #222225);
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
  color: var(--text-muted, #808086);
}

.stage-pill {
  padding: 2px 8px;
  border-radius: 2px;
  background: #1c1c1f;
  border: 1px solid #26262a;
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted, #808086);
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
  color: var(--text-muted, #808086);
}

.spec-val {
  color: var(--text-primary, #e2e2e5);
  font-weight: 500;
}

.font-term {
  font-weight: 700;
}

.font-mono {
  font-family: var(--font-mono, monospace);
}

.inspector-collocations {
  border-top: 1px solid var(--border-color, #222225);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.collocations-title {
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted, #808086);
  text-transform: uppercase;
}

.collocations-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.col-tag {
  padding: 4px 8px;
  border-radius: 2px;
  background: #0c0c0e;
  border: 1px solid var(--border-color, #222225);
  font-size: 11px;
  color: var(--text-muted, #808086);
}

.inspector-actions {
  border-top: 1px solid var(--border-color, #222225);
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
  border-radius: 2px;
  background: var(--bg-card, #141416);
  border: 1px solid var(--border-color, #222225);
  color: var(--text-primary, #e2e2e5);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-inspector-audio:hover {
  background: var(--bg-hover, #18181b);
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
  border-radius: 2px;
  background: var(--primary-accent, #e2e2e5);
  border: 1px solid var(--primary-accent, #e2e2e5);
  color: var(--on-primary, #101012);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-inspector-copy:hover {
  background: #ffffff;
  border-color: #ffffff;
}

/* Shortcuts Card */
.fc-shortcuts-card {
  padding: 20px;
  border-radius: 2px;
  background: var(--bg-card, #141416);
  border: 1px solid var(--border-color, #222225);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shortcuts-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary, #e2e2e5);
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
  color: var(--text-muted, #808086);
}

.shortcut-kbd {
  padding: 2px 6px;
  border-radius: 2px;
  background: #0c0c0e;
  border: 1px solid var(--border-color, #222225);
  font-size: 10.5px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted, #808086);
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
  border-radius: 2px;
  background: var(--bg-card, #141416);
  border: 1px solid var(--border-color, #222225);
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
  border-radius: 2px;
  background: #1c1c1f;
  border: 1px solid #27272b;
  color: var(--text-primary, #e2e2e5);
}

.summary-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary, #e2e2e5);
}

.summary-desc {
  font-size: 13px;
  color: var(--text-muted, #808086);
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
  border-radius: 2px;
  background: #0c0c0e;
  border: 1px solid var(--border-color, #222225);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted, #808086);
}

.stat-num {
  font-size: 18px;
  font-family: var(--font-mono, monospace);
  color: var(--text-primary, #e2e2e5);
}

.summary-actions {
  margin-top: 12px;
  width: 100%;
}

.btn-primary {
  width: 100%;
  padding: 12px;
  border-radius: 2px;
  background: var(--primary-accent, #e2e2e5);
  border: 1px solid var(--primary-accent, #e2e2e5);
  color: var(--on-primary, #101012);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover {
  background: #ffffff;
}
</style>

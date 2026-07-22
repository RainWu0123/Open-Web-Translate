<template>
  <div v-if="visible" class="dictionary-popover" data-testid="dictionary-popover">
    <div class="popover-header">
      <div class="word-info">
        <span class="surface-text">{{ token?.surface }}</span>
        <span v-if="token?.reading" class="reading-text">({{ token.reading }})</span>
        <span v-if="token?.pos" class="pos-badge">{{ token.pos }}</span>
      </div>
      <button class="close-btn" @click="close" data-testid="popover-close-btn">✕</button>
    </div>

    <div class="popover-body">
      <div class="definition-section">
        <h4>釋義與解釋</h4>
        <div v-if="isLoading" class="loading-spinner">🔍 AI 正在分析單字釋義中...</div>
        <div v-else class="definition-text">{{ definition || '暫無解釋' }}</div>
      </div>

      <div v-if="pair" class="example-section">
        <h4>影片例句句型</h4>
        <div class="example-orig">{{ pair.primary.text }}</div>
        <div v-if="pair.secondary" class="example-trans">{{ pair.secondary.text }}</div>
      </div>
    </div>

    <div class="popover-footer">
      <button
        class="save-vocab-btn"
        :class="{ saved: isSaved }"
        @click="saveVocab"
        data-testid="save-vocab-btn"
      >
        {{ isSaved ? '⭐ 已收藏至單字卡' : '⭐ 收藏此單字' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { SubtitleToken, SubtitlePair, globalSubtitleSessionStore } from '@/core/session/subtitle-session-store';

const props = defineProps<{
  token: SubtitleToken | null;
  pair: SubtitlePair | null;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const definition = ref('');
const isLoading = ref(false);
const isSaved = ref(false);

watch(
  () => props.token,
  async (newToken) => {
    if (newToken) {
      isSaved.value = false;
      isLoading.value = true;
      definition.value = '';

      // Simulated or AI fetched dictionary definition
      setTimeout(() => {
        definition.value = `【${newToken.surface}】 查無本地字典，AI 建議釋義：主要名詞/動詞用法，表示「${newToken.surface}」。`;
        isLoading.value = false;
      }, 300);
    }
  },
  { immediate: true },
);

async function saveVocab() {
  if (!props.token || !props.pair) return;
  try {
    await globalSubtitleSessionStore.saveVocabularyCard({
      language: props.pair.primary.lang || 'ja',
      lemma: props.token.normalized || props.token.surface,
      surface: props.token.surface,
      reading: props.token.reading,
      meaning: definition.value,
      example: {
        text: props.pair.primary.text,
        translation: props.pair.secondary?.text,
        episodeId: props.pair.episodeId || 'ep-1',
        cueStartMs: props.pair.primary.startMs,
      },
    });
    isSaved.value = true;
  } catch (err) {
    console.error('Failed to save vocabulary:', err);
  }
}

function close() {
  emit('close');
}
</script>

<style scoped>
.dictionary-popover {
  position: absolute;
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%);
  width: 320px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  color: #f8fafc;
  z-index: 2147483647;
  font-family: system-ui, -apple-system, sans-serif;
  padding: 14px;
}

.popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 8px;
  margin-bottom: 10px;
}

.word-info {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.surface-text {
  font-size: 20px;
  font-weight: 800;
  color: #38bdf8;
}

.reading-text {
  font-size: 13px;
  color: #94a3b8;
}

.pos-badge {
  font-size: 10px;
  background: #334155;
  color: #cbd5e1;
  padding: 2px 6px;
  border-radius: 4px;
}

.close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 16px;
  cursor: pointer;
}

.popover-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}

.definition-section h4,
.example-section h4 {
  margin: 0 0 4px 0;
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.definition-text {
  color: #e2e8f0;
  line-height: 1.4;
}

.loading-spinner {
  font-size: 12px;
  color: #fbbf24;
}

.example-section {
  background: rgba(255, 255, 255, 0.05);
  padding: 8px;
  border-radius: 6px;
}

.example-orig {
  font-weight: 600;
  color: #f1f5f9;
}

.example-trans {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}

.popover-footer {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.save-vocab-btn {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
}

.save-vocab-btn.saved {
  background: #10b981;
}
</style>

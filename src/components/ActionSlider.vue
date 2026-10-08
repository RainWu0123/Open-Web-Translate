<template>
  <div
    ref="rail" class="action-slider" :class="{ dragging: dragProgress !== null, busy: leftBusy || rightBusy }"
    :data-side="active" @pointerdown="beginDrag" @pointermove="moveDrag"
    @pointerup="endDrag" @pointercancel="cancelDrag"
  >
    <span class="action-highlight" :style="{
      left: `calc(${progress * 50}% + ${(1 - progress) * 4}px)`,
      right: `calc(${(1 - progress) * 50}% + ${progress * 4}px)`,
    }" aria-hidden="true"></span>
    <button
      type="button" class="action-option" :class="{ selected: active === 'left' }"
      :disabled="leftDisabled" :aria-busy="leftBusy" :aria-pressed="leftPressed"
      :data-testid="leftTestId" @click="activate('left')"
    ><slot name="left" /></button>
    <button
      type="button" class="action-option" :class="{ selected: active === 'right' }"
      :disabled="rightDisabled" :aria-busy="rightBusy" :aria-pressed="rightPressed"
      :data-testid="rightTestId" @click="activate('right')"
    ><slot name="right" /></button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  active: 'left' | 'right';
  leftDisabled?: boolean; rightDisabled?: boolean;
  leftBusy?: boolean; rightBusy?: boolean;
  leftPressed?: boolean; rightPressed?: boolean;
  leftTestId?: string; rightTestId?: string;
}>();
const emit = defineEmits<{ left: []; right: [] }>();
const rail = ref<HTMLElement>();
const dragProgress = ref<number | null>(null);
const progress = computed(() => dragProgress.value ?? (props.active === 'left' ? 0 : 1));
let gesture: { id: number; x: number; y: number; start: number; travel: number } | null = null;
let ignoreClicksUntil = 0;

function activate(side: 'left' | 'right') {
  if (Date.now() < ignoreClicksUntil || props.leftBusy || props.rightBusy) return;
  if (side === 'left' ? props.leftDisabled : props.rightDisabled) return;
  if (side === 'left') emit('left'); else emit('right');
}
function beginDrag(event: PointerEvent) {
  if (event.button !== 0 || props.leftBusy || props.rightBusy) return;
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, start: progress.value,
    travel: Math.max(1, (rail.value!.getBoundingClientRect().width - 8) / 2) };
}
function moveDrag(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const distance = event.clientX - gesture.x;
  if (dragProgress.value === null) {
    if (Math.abs(distance) < 8 || Math.abs(distance) < Math.abs(event.clientY - gesture.y)) return;
    rail.value?.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
  dragProgress.value = Math.max(0, Math.min(1, gesture.start + distance / gesture.travel));
}
function endDrag(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const dragged = dragProgress.value;
  gesture = null;
  dragProgress.value = null;
  if (dragged === null) return;
  if (rail.value?.hasPointerCapture(event.pointerId)) rail.value.releasePointerCapture(event.pointerId);
  activate(dragged >= .5 ? 'right' : 'left');
  // A completed drag can also generate a click. It must send only one command.
  ignoreClicksUntil = Date.now() + 180;
}
function cancelDrag() { gesture = null; dragProgress.value = null; }
</script>

<style scoped>
.action-slider { position: relative; display: grid; grid-template-columns: 1fr 1fr; padding: 4px; height: 52px;
  border-radius: 16px; background: var(--bg-hover); isolation: isolate; touch-action: pan-y; user-select: none; }
.action-highlight { position: absolute; top: 4px; bottom: 4px; border-radius: 12px;
  background: var(--primary-accent); box-shadow: 0 2px 6px rgba(0,0,0,.1);
  transition: left 420ms cubic-bezier(.22,1.12,.32,1), right 560ms cubic-bezier(.22,1.12,.32,1); pointer-events: none; }
.action-slider[data-side='right'] .action-highlight { transition-duration: 560ms, 420ms; }
.dragging .action-highlight { transition: none; }
.action-option { z-index: 1; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 7px;
  border: 0; background: transparent; border-radius: 12px; padding: 0 6px; cursor: pointer;
  color: var(--text-secondary); font: 600 12px/1.25 var(--font-ui); transition: color 180ms ease; }
.action-option.selected { color: var(--on-primary); }
.action-option:hover:not(:disabled):not(.selected) { color: var(--text-primary); }
.action-option:disabled { cursor: not-allowed; opacity: .5; }
.busy .action-option:disabled { cursor: wait; opacity: 1; }
.action-option:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .action-highlight, .action-option { transition: none; } }
</style>

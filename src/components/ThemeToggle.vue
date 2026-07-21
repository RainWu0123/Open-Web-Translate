<template>
  <div class="owt-theme-toggle" data-testid="theme-toggle" :data-theme="currentTheme">
    <div class="theme-options">
      <button
        type="button"
        :class="['theme-btn', { active: currentTheme === 'light' }]"
        title="Light Mode"
        aria-label="Switch to light theme"
        @click="selectTheme('light')"
        data-testid="theme-btn-light"
      >
        ☀️ <span v-if="!compact">Light</span>
      </button>
      <button
        type="button"
        :class="['theme-btn', { active: currentTheme === 'dark' }]"
        title="Dark Mode"
        aria-label="Switch to dark theme"
        @click="selectTheme('dark')"
        data-testid="theme-btn-dark"
      >
        🌙 <span v-if="!compact">Dark</span>
      </button>
      <button
        type="button"
        :class="['theme-btn', { active: currentTheme === 'system' }]"
        title="System Preference"
        aria-label="Switch to system theme"
        @click="selectTheme('system')"
        data-testid="theme-btn-system"
      >
        🖥️ <span v-if="!compact">System</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';

export type ThemeMode = 'light' | 'dark' | 'system' | 'auto';

const props = withDefaults(
  defineProps<{
    modelValue?: ThemeMode;
    theme?: ThemeMode;
    compact?: boolean;
  }>(),
  {
    compact: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', theme: ThemeMode): void;
  (e: 'update:theme', theme: ThemeMode): void;
  (e: 'change', theme: ThemeMode): void;
  (e: 'toggle', theme: ThemeMode): void;
}>();

const currentTheme = ref<ThemeMode>(
  (props.modelValue || props.theme) === 'auto'
    ? 'system'
    : props.modelValue || props.theme || 'system'
);

watch(
  () => props.modelValue || props.theme,
  (newVal) => {
    if (newVal) {
      const normalized = newVal === 'auto' ? 'system' : newVal;
      currentTheme.value = normalized;
      applyTheme(normalized);
    }
  }
);

function applyTheme(t: ThemeMode) {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-theme', t);
  }
}

function selectTheme(t: ThemeMode) {
  currentTheme.value = t;
  applyTheme(t);
  emit('update:modelValue', t);
  emit('update:theme', t);
  emit('change', t);
  emit('toggle', t);
}

onMounted(() => {
  const initial = props.modelValue || props.theme || 'system';
  const normalized = initial === 'auto' ? 'system' : initial;
  currentTheme.value = normalized;
  applyTheme(normalized);
});
</script>

<style scoped>
.owt-theme-toggle {
  display: inline-flex;
  align-items: center;
}

.theme-options {
  display: inline-flex;
  background: var(--bg-input, #0f172a);
  border: 1px solid var(--border-color, #334155);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}

.theme-btn {
  background: transparent;
  border: none;
  color: var(--text-muted, #94a3b8);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s ease;
}

.theme-btn:hover {
  color: var(--text-primary, #f8fafc);
}

.theme-btn.active {
  background: var(--primary-accent, #3b82f6);
  color: #ffffff;
  font-weight: 600;
}
</style>

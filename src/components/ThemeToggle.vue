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
        <svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
        <span v-if="!compact">Light</span>
      </button>
      <button
        type="button"
        :class="['theme-btn', { active: currentTheme === 'dark' }]"
        title="Dark Mode"
        aria-label="Switch to dark theme"
        @click="selectTheme('dark')"
        data-testid="theme-btn-dark"
      >
        <svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
        <span v-if="!compact">Dark</span>
      </button>
      <button
        type="button"
        :class="['theme-btn', { active: currentTheme === 'system' }]"
        title="System Preference"
        aria-label="Switch to system theme"
        @click="selectTheme('system')"
        data-testid="theme-btn-system"
      >
        <svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
        <span v-if="!compact">System</span>
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
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 8px);
  padding: 2px;
  gap: 2px;
}

.theme-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: 4px 8px;
  border-radius: var(--radius-xs, 6px);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

.theme-icon {
  width: 13px;
  height: 13px;
}

.theme-btn:hover {
  color: var(--text-primary);
}

.theme-btn.active {
  background: var(--primary-accent);
  color: var(--on-primary, #ffffff);
  font-weight: 600;
  box-shadow: 0 1px 4px var(--primary-glow);
}
</style>

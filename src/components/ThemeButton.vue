<template>
  <button type="button" class="theme-toggle" :aria-label="label" :title="label" @click="$emit('toggle')">
    <svg v-if="dark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
    <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z" />
    </svg>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { translate } from '@/shared/i18n';
const props = defineProps<{ language: string; dark: boolean }>();
defineEmits<{ toggle: [] }>();
const label = computed(() => `${translate(props.language, 'theme.label')}：${translate(props.language, props.dark ? 'common.light' : 'common.dark')}`);
</script>

<style scoped>
.theme-toggle { display: grid; place-items: center; width: 34px; height: 34px; flex-shrink: 0; border: 0; border-radius: 50%; background: transparent; color: var(--text-secondary); cursor: pointer; }
.theme-toggle:hover { background: var(--bg-hover); color: var(--text-primary); }
.theme-toggle:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 3px; }
</style>

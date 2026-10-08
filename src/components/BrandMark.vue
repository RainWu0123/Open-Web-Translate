<template>
  <span class="brand-mark" :data-state="state" :style="{ width: `${width}px`, height: `${height}px` }" aria-hidden="true">
    <img :src="icon" alt="" draggable="false" />
    <span class="brand-ring"></span>
  </span>
</template>

<script setup lang="ts">
import icon from '@/assets/brand/icon.png';
withDefaults(defineProps<{ width?: number | string; height?: number | string; state?: 'idle' | 'translating' | 'translated' }>(), { width: 20, height: 20, state: 'idle' });
</script>

<style scoped>
.brand-mark { position: relative; display: inline-grid; place-items: center; flex-shrink: 0; border-radius: 50%; background: #0c0d10; }
img { width: 100%; height: 100%; border-radius: 50%; display: block; object-fit: contain; transition: transform .2s; }
.brand-ring { display: none; position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(255,255,255,.2); border-top-color: #fff; }
[data-state='translating'] img { transform: scale(.78); }
[data-state='translating'] .brand-ring { display: block; animation: brand-orbit .9s linear infinite; }
[data-state='translated'] img { animation: brand-invert .7s ease-out; }
@keyframes brand-orbit { to { transform: rotate(360deg); } }
@keyframes brand-invert { 0%, 35% { filter: invert(1); } 100% { filter: none; } }
@media (prefers-reduced-motion: reduce) { img { transition: none; } [data-state='translating'] .brand-ring { animation: none; } [data-state='translated'] img { animation: none; } }
</style>

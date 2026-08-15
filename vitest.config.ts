/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  // Cast: @vitejs/plugin-vue's Plugin type targets a newer Vite than vitest bundles.
  plugins: [vue() as never],
  test: {
    environment: 'jsdom',
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

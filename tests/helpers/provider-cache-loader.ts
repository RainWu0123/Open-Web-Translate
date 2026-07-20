import * as fs from 'fs';
import * as path from 'path';

export async function getGeminiProviderClass(): Promise<any> {
  const relPath = '../../src/infrastructure/providers/gemini-provider';
  const absPath = path.resolve(__dirname, '../../src/infrastructure/providers/gemini-provider.ts');
  if (fs.existsSync(absPath)) {
    try {
      const mod = await import(/* @vite-ignore */ relPath);
      if (mod?.GeminiProvider) return mod.GeminiProvider;
    } catch (_) {}
  }
  const ref = await import('./gemini-provider-ref');
  return ref.GeminiProvider;
}

export async function getTranslationCacheClass(): Promise<any> {
  const relPath = '../../src/infrastructure/storage/translation-cache';
  const absPath = path.resolve(__dirname, '../../src/infrastructure/storage/translation-cache.ts');
  if (fs.existsSync(absPath)) {
    try {
      const mod = await import(/* @vite-ignore */ relPath);
      if (mod?.TranslationCache) return mod.TranslationCache;
    } catch (_) {}
  }
  const ref = await import('./translation-cache-ref');
  return ref.TranslationCache;
}

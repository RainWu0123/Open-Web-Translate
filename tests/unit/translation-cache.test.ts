import 'fake-indexeddb/auto';
// @ts-expect-error fake-indexeddb deep import declaration
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import { describe, it, expect, beforeEach } from 'vitest';
import { getTranslationCacheClass } from '../helpers/provider-cache-loader';
import { TTL_MS } from '../helpers/translation-cache-ref';

describe('TranslationCache Unit Tests', () => {
  let TranslationCache: any;
  let cache: any;

  beforeEach(async () => {
    globalThis.indexedDB = new FDBFactory() as any;
    TranslationCache = await getTranslationCacheClass();
    cache = new TranslationCache();
  });

  it('generates SHA-256 cache key deterministically', async () => {
    const params = {
      sourceText: 'Hello world',
      sourceLang: 'en',
      targetLang: 'zh-Hant',
      providerId: 'gemini',
      providerFingerprint: 'gemini-2.0-flash',
      promptVersion: 'v1',
      glossaryVersion: 'g1',
    };

    const key1 = await cache.generateKey(params);
    const key2 = await cache.generateKey(params);

    expect(typeof key1).toBe('string');
    expect(key1.length).toBe(64); // SHA-256 hex string length
    expect(key1).toBe(key2);
  });

  it('returns cache hit without invoking fetch or provider call', async () => {
    const key = await cache.generateKey({
      sourceText: 'Cache Test Text',
      targetLang: 'zh-Hant',
      providerId: 'gemini',
    });

    await cache.set(key, '快取測試文字');

    const result = await cache.get(key);
    expect(result).toBe('快取測試文字');
  });

  it('causes cache miss when provider, model, targetLang, fingerprint, or promptVersion changes', async () => {
    const baseParams = {
      sourceText: 'Universal Text',
      sourceLang: 'en',
      targetLang: 'zh-Hant',
      providerId: 'gemini',
      providerFingerprint: 'gemini-2.0-flash',
      promptVersion: 'v1',
    };

    const baseKey = await cache.generateKey(baseParams);
    await cache.set(baseKey, '通用譯文');

    // 1. Provider change
    const p1Key = await cache.generateKey({ ...baseParams, providerId: 'openai' });
    expect(await cache.get(p1Key)).toBeNull();

    // 2. Model / fingerprint change
    const p2Key = await cache.generateKey({ ...baseParams, providerFingerprint: 'gemini-1.5-pro' });
    expect(await cache.get(p2Key)).toBeNull();

    // 3. Target language change
    const p3Key = await cache.generateKey({ ...baseParams, targetLang: 'ja' });
    expect(await cache.get(p3Key)).toBeNull();

    // 4. Prompt version change
    const p4Key = await cache.generateKey({ ...baseParams, promptVersion: 'v2' });
    expect(await cache.get(p4Key)).toBeNull();
  });

  it('handles 30-day TTL expiration correctly', async () => {
    const key = await cache.generateKey({
      sourceText: 'TTL Test Segment',
      targetLang: 'zh-Hant',
      providerId: 'gemini',
    });

    const now = Date.now();
    const expiredTs = now - (TTL_MS + 1000); // 30 days + 1 sec ago
    const validTs = now - (TTL_MS - 60000); // ~29.9 days ago

    // Expired entry
    await cache.set(key + '-expired', 'Old Translation', expiredTs);
    expect(await cache.get(key + '-expired')).toBeNull();

    // Valid entry
    await cache.set(key + '-valid', 'Fresh Translation', validTs);
    expect(await cache.get(key + '-valid')).toBe('Fresh Translation');
  });

  it('supports IndexedDB v1 to v2 schema migration', async () => {
    // 1. Open DB at version 1
    const dbV1 = await cache.openDB(1);
    expect(dbV1.version).toBe(1);
    dbV1.close();

    // 2. Open DB at version 2 (upgrades)
    const dbV2 = await cache.openDB(2);
    expect(dbV2.version).toBe(2);
    expect(dbV2.objectStoreNames.contains('translationCache')).toBe(true);

    const tx = dbV2.transaction('translationCache', 'readonly');
    const store = tx.objectStore('translationCache');
    expect(store.indexNames.contains('timestamp')).toBe(true);
    dbV2.close();

    // 3. Repeated open v2 succeeds cleanly
    const dbV2Repeat = await cache.openDB(2);
    expect(dbV2Repeat.version).toBe(2);
    dbV2Repeat.close();
  });

  it('prunes entries via LRU eviction when entry count exceeds limit', async () => {
    const baseTs = Date.now();

    for (let i = 0; i < 25; i++) {
      const key = `lru-key-${i}`;
      await cache.set(key, `Val-${i}`, baseTs + i);
    }

    const evicted = await cache.evictLRUIfNeeded(20);
    expect(evicted).toBe(5);

    // Oldest 5 entries (0 to 4) should be evicted
    expect(await cache.get('lru-key-0')).toBeNull();
    expect(await cache.get('lru-key-4')).toBeNull();

    // Key 5 and above should still exist
    expect(await cache.get('lru-key-5')).toBe('Val-5');
    expect(await cache.get('lru-key-24')).toBe('Val-24');
  });

  it('clears all cached entries on clear() operation', async () => {
    await cache.set('k1', 'val1');
    await cache.set('k2', 'val2');

    expect(await cache.get('k1')).toBe('val1');
    expect(await cache.get('k2')).toBe('val2');

    await cache.clear();

    expect(await cache.get('k1')).toBeNull();
    expect(await cache.get('k2')).toBeNull();
  });
});

/**
 * IndexedDB Translation Cache Repository
 *
 * Provides SHA-256 key hashing, 30-day TTL expiration, index-based LRU/expired eviction,
 * and clear cache capability.
 */
import { Database } from './database';
import type { TranslationCacheEntry } from './schemas';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('CacheRepository');

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_CACHE_ENTRIES = 5000;

export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface CacheKeyInput {
  normalizedSourceHash: string;
  sourceLanguage: string;
  targetLanguage: string;
  providerId: string;
  providerFingerprint?: string;
  promptVersion?: string;
  glossaryVersion?: string;
}

export interface CacheGetParams {
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  providerId: string;
  providerFingerprint?: string;
  promptVersion?: string;
  glossaryVersion?: string;
}

export interface CacheSetParams extends CacheGetParams {
  translatedText: string;
}

const AUTO_EVICT_COOLDOWN_MS = 60_000;
const AUTO_EVICT_WRITE_THRESHOLD = 50;

export class CacheRepository {
  private db = Database.getInstance();
  private lastAutoEvictAt = 0;
  private writesSinceLastEvict = 0;
  private autoEvictInFlight: Promise<number> | null = null;

  /** Normalize source text (trim + collapse whitespace) */
  static normalizeSourceText(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
  }

  /** Compute SHA-256 hash of normalized source text */
  static async computeSourceHash(sourceText: string): Promise<string> {
    const normalized = CacheRepository.normalizeSourceText(sourceText);
    return sha256(normalized);
  }

  /** Compute full SHA-256 cache key */
  static async computeCacheKey(input: CacheKeyInput): Promise<string> {
    const rawKey = [
      input.normalizedSourceHash,
      input.sourceLanguage,
      input.targetLanguage,
      input.providerId,
      input.providerFingerprint ?? 'default',
      input.promptVersion ?? 'v1',
      input.glossaryVersion ?? 'none',
    ].join(':');
    return sha256(rawKey);
  }

  private scheduleAutoEviction(writesAdded = 1): void {
    this.writesSinceLastEvict += writesAdded;
    const now = Date.now();
    if (
      this.autoEvictInFlight ||
      (now - this.lastAutoEvictAt < AUTO_EVICT_COOLDOWN_MS &&
        this.writesSinceLastEvict < AUTO_EVICT_WRITE_THRESHOLD)
    ) {
      return;
    }

    this.lastAutoEvictAt = now;
    this.writesSinceLastEvict = 0;
    this.autoEvictInFlight = this.evictExpiredAndLRU()
      .catch((err) => {
        logger.error('Eviction error', err);
        return 0;
      })
      .finally(() => {
        this.autoEvictInFlight = null;
      });
  }

  /** Retrieve a cached translation result if valid and not expired */
  async get(params: CacheGetParams): Promise<string | null> {
    try {
      const normalizedSourceHash = await CacheRepository.computeSourceHash(params.sourceText);
      const cacheKey = await CacheRepository.computeCacheKey({
        normalizedSourceHash,
        sourceLanguage: params.sourceLanguage,
        targetLanguage: params.targetLanguage,
        providerId: params.providerId,
        providerFingerprint: params.providerFingerprint,
        promptVersion: params.promptVersion,
        glossaryVersion: params.glossaryVersion,
      });

      const store = await this.db.getStore('translationCache', 'readwrite');
      const entry = await new Promise<TranslationCacheEntry | undefined>((resolve, reject) => {
        const req = store.get(cacheKey);
        req.onsuccess = () => resolve(req.result as TranslationCacheEntry | undefined);
        req.onerror = () => reject(req.error);
      });

      if (!entry) {
        return null;
      }

      const now = Date.now();
      if (entry.expiresAt <= now) {
        // Expired entry -> delete
        store.delete(cacheKey);
        return null;
      }

      // Valid entry -> update lastAccessedAt
      entry.lastAccessedAt = now;
      store.put(entry);

      return entry.translationResult;
    } catch (err) {
      logger.error('Failed to get cache entry', err);
      return null;
    }
  }

  /** Retrieve multiple cached translation results in a single IndexedDB transaction */
  async getMany(paramsList: CacheGetParams[]): Promise<Array<string | null>> {
    if (paramsList.length === 0) return [];
    try {
      const keys = await Promise.all(
        paramsList.map(async (params) => {
          const normalizedSourceHash = await CacheRepository.computeSourceHash(params.sourceText);
          return CacheRepository.computeCacheKey({
            normalizedSourceHash,
            sourceLanguage: params.sourceLanguage,
            targetLanguage: params.targetLanguage,
            providerId: params.providerId,
            providerFingerprint: params.providerFingerprint,
            promptVersion: params.promptVersion,
            glossaryVersion: params.glossaryVersion,
          });
        }),
      );

      const store = await this.db.getStore('translationCache', 'readwrite');
      const now = Date.now();

      return await Promise.all(
        keys.map(
          (cacheKey) =>
            new Promise<string | null>((resolve, reject) => {
              const req = store.get(cacheKey);
              req.onsuccess = () => {
                const entry = req.result as TranslationCacheEntry | undefined;
                if (!entry) {
                  resolve(null);
                  return;
                }
                if (entry.expiresAt <= now) {
                  store.delete(cacheKey);
                  resolve(null);
                  return;
                }
                entry.lastAccessedAt = now;
                store.put(entry);
                resolve(entry.translationResult);
              };
              req.onerror = () => reject(req.error);
            }),
        ),
      );
    } catch (err) {
      logger.error('Failed to getMany cache entries', err);
      return paramsList.map(() => null);
    }
  }

  /** Save a translation result to cache */
  async set(params: CacheSetParams): Promise<void> {
    try {
      const normalizedSourceHash = await CacheRepository.computeSourceHash(params.sourceText);
      const cacheKey = await CacheRepository.computeCacheKey({
        normalizedSourceHash,
        sourceLanguage: params.sourceLanguage,
        targetLanguage: params.targetLanguage,
        providerId: params.providerId,
        providerFingerprint: params.providerFingerprint,
        promptVersion: params.promptVersion,
        glossaryVersion: params.glossaryVersion,
      });

      const now = Date.now();
      const entry: TranslationCacheEntry = {
        cacheKey,
        normalizedSourceHash,
        sourceLanguage: params.sourceLanguage,
        targetLanguage: params.targetLanguage,
        providerId: params.providerId,
        providerFingerprint: params.providerFingerprint ?? 'default',
        promptVersion: params.promptVersion ?? 'v1',
        glossaryVersion: params.glossaryVersion ?? 'none',
        translationResult: params.translatedText,
        createdAt: now,
        lastAccessedAt: now,
        expiresAt: now + TTL_MS,
        schemaVersion: 2,
      };

      const store = await this.db.getStore('translationCache', 'readwrite');
      await new Promise<void>((resolve, reject) => {
        const req = store.put(entry);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

      this.scheduleAutoEviction(1);
    } catch (err) {
      logger.error('Failed to set cache entry', err);
    }
  }

  /** Save multiple translation results in a single IndexedDB transaction */
  async setMany(paramsList: CacheSetParams[]): Promise<void> {
    if (paramsList.length === 0) return;
    try {
      const now = Date.now();
      const entries = await Promise.all(
        paramsList.map(async (params): Promise<TranslationCacheEntry> => {
          const normalizedSourceHash = await CacheRepository.computeSourceHash(params.sourceText);
          const cacheKey = await CacheRepository.computeCacheKey({
            normalizedSourceHash,
            sourceLanguage: params.sourceLanguage,
            targetLanguage: params.targetLanguage,
            providerId: params.providerId,
            providerFingerprint: params.providerFingerprint,
            promptVersion: params.promptVersion,
            glossaryVersion: params.glossaryVersion,
          });
          return {
            cacheKey,
            normalizedSourceHash,
            sourceLanguage: params.sourceLanguage,
            targetLanguage: params.targetLanguage,
            providerId: params.providerId,
            providerFingerprint: params.providerFingerprint ?? 'default',
            promptVersion: params.promptVersion ?? 'v1',
            glossaryVersion: params.glossaryVersion ?? 'none',
            translationResult: params.translatedText,
            createdAt: now,
            lastAccessedAt: now,
            expiresAt: now + TTL_MS,
            schemaVersion: 2,
          };
        }),
      );

      const store = await this.db.getStore('translationCache', 'readwrite');
      await Promise.all(
        entries.map(
          (entry) =>
            new Promise<void>((resolve, reject) => {
              const req = store.put(entry);
              req.onsuccess = () => resolve();
              req.onerror = () => reject(req.error);
            }),
        ),
      );

      this.scheduleAutoEviction(entries.length);
    } catch (err) {
      logger.error('Failed to setMany cache entries', err);
    }
  }

  /** Index-based LRU and expired eviction */
  async evictExpiredAndLRU(maxEntries: number = MAX_CACHE_ENTRIES): Promise<number> {
    let evictedCount = 0;
    try {
      const store = await this.db.getStore('translationCache', 'readwrite');
      const now = Date.now();

      // 1. Evict expired entries using 'expiresAt' index
      const expiresIndex = store.index('expiresAt');
      const expiredRange = IDBKeyRange.upperBound(now);

      await new Promise<void>((resolve, reject) => {
        const req = expiresIndex.openCursor(expiredRange);
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            cursor.delete();
            evictedCount++;
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => reject(req.error);
      });

      // 2. Check total entries count for LRU eviction
      const count = await new Promise<number>((resolve, reject) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (count > maxEntries) {
        const excess = count - maxEntries;
        const lastAccessedIndex = store.index('lastAccessedAt');

        let deletedLRU = 0;
        await new Promise<void>((resolve, reject) => {
          const req = lastAccessedIndex.openCursor(); // ascending order: oldest accessed first
          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor && deletedLRU < excess) {
              cursor.delete();
              deletedLRU++;
              evictedCount++;
              cursor.continue();
            } else {
              resolve();
            }
          };
          req.onerror = () => reject(req.error);
        });
      }
    } catch (err) {
      logger.error('Failed eviction', err);
    }
    return evictedCount;
  }

  /** Clear all translation cache entries */
  async clear(): Promise<void> {
    try {
      const store = await this.db.getStore('translationCache', 'readwrite');
      await new Promise<void>((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      logger.error('Failed to clear cache', err);
      throw err;
    }
  }

  /** Purge expired cache entries (alias for startup purge) */
  async purgeExpired(): Promise<number> {
    return this.evictExpiredAndLRU();
  }
}

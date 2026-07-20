import type { TranslationCacheEntry } from './schemas';

export type MigrationFunction = (db: IDBDatabase, transaction: IDBTransaction) => void;

export const migrations: Record<number, MigrationFunction> = {
  1: (db, transaction) => {
    if (!db.objectStoreNames.contains('translationCache')) {
      db.createObjectStore('translationCache', { keyPath: 'key' });
    }
    if (!db.objectStoreNames.contains('glossaryEntries')) {
      db.createObjectStore('glossaryEntries', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('vocabularyItems')) {
      db.createObjectStore('vocabularyItems', { keyPath: 'id' });
    }
  },
  2: (db, transaction) => {
    if (db.objectStoreNames.contains('translationCache')) {
      const oldStore = transaction.objectStore('translationCache');
      const req = oldStore.getAll();

      req.onsuccess = () => {
        const v1Entries: any[] = req.result || [];
        db.deleteObjectStore('translationCache');
        const newStore = db.createObjectStore('translationCache', { keyPath: 'cacheKey' });

        newStore.createIndex('providerId', 'providerId', { unique: false });
        newStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        newStore.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });

        const now = Date.now();
        const DEFAULT_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

        for (const oldEntry of v1Entries) {
          const key = oldEntry.key || oldEntry.cacheKey;
          if (key) {
            const v2Entry: TranslationCacheEntry = {
              cacheKey: key,
              normalizedSourceHash: key,
              sourceLanguage: oldEntry.sourceLanguage || 'auto',
              targetLanguage: oldEntry.targetLanguage || 'unknown',
              providerId: oldEntry.providerId || 'mock-provider',
              providerFingerprint: oldEntry.providerFingerprint || 'v1-migrated',
              promptVersion: oldEntry.promptVersion || '1.0',
              glossaryVersion: oldEntry.glossaryVersion || 'none',
              translationResult: oldEntry.translationResult ?? oldEntry.translatedText ?? '',
              createdAt: oldEntry.createdAt || oldEntry.timestamp || now,
              lastAccessedAt: oldEntry.lastAccessedAt || oldEntry.timestamp || now,
              expiresAt: oldEntry.expiresAt || (oldEntry.timestamp ? oldEntry.timestamp + DEFAULT_TTL : now + DEFAULT_TTL),
              schemaVersion: 2,
            };
            newStore.put(v2Entry);
          }
        }
      };
    } else {
      const store = db.createObjectStore('translationCache', { keyPath: 'cacheKey' });
      store.createIndex('providerId', 'providerId', { unique: false });
      store.createIndex('expiresAt', 'expiresAt', { unique: false });
      store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
    }
  },
};

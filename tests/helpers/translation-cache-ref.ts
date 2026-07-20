export interface CacheKeyParams {
  sourceText: string;
  sourceLang?: string;
  targetLang: string;
  providerId: string;
  providerFingerprint?: string;
  promptVersion?: string;
  glossaryVersion?: string;
}

export interface CacheEntry {
  key: string;
  translatedText: string;
  timestamp: number;
  schemaVersion: number;
  params?: CacheKeyParams;
}

export const DB_NAME = 'open-web-translate';
export const DB_VERSION = 2;
export const MAX_CACHE_ENTRIES = 5000;
export const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class TranslationCache {
  async generateKey(params: CacheKeyParams): Promise<string> {
    const norm = [
      params.sourceText,
      params.sourceLang || 'auto',
      params.targetLang,
      params.providerId,
      params.providerFingerprint || '',
      params.promptVersion || 'v1',
      params.glossaryVersion || '',
    ].join('::');

    const encoder = new TextEncoder();
    const data = encoder.encode(norm);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async openDB(targetVersion: number = DB_VERSION): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, targetVersion);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const transaction = request.transaction!;
        const oldVersion = event.oldVersion;

        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('translationCache')) {
            db.createObjectStore('translationCache', { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains('glossaryEntries')) {
            db.createObjectStore('glossaryEntries', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('vocabularyItems')) {
            db.createObjectStore('vocabularyItems', { keyPath: 'id' });
          }
        }

        if (oldVersion < 2 || targetVersion >= 2) {
          if (db.objectStoreNames.contains('translationCache')) {
            const store = transaction.objectStore('translationCache');
            if (!store.indexNames.contains('timestamp')) {
              store.createIndex('timestamp', 'timestamp', { unique: false });
            }
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(key: string): Promise<string | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('translationCache', 'readonly');
      const store = tx.objectStore('translationCache');
      const req = store.get(key);

      req.onsuccess = () => {
        const entry = req.result as CacheEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }

        // 30-day TTL check
        if (Date.now() - entry.timestamp > TTL_MS) {
          this.delete(key).catch(() => {});
          resolve(null);
          return;
        }

        resolve(entry.translatedText);
      };

      req.onerror = () => reject(req.error);
    });
  }

  async set(key: string, translatedText: string, timestamp?: number): Promise<void> {
    const db = await this.openDB();
    const ts = timestamp ?? Date.now();
    const entry: CacheEntry = {
      key,
      translatedText,
      timestamp: ts,
      schemaVersion: 2,
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('translationCache', 'readwrite');
      const store = tx.objectStore('translationCache');
      const req = store.put(entry);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    await this.evictLRUIfNeeded();
  }

  async delete(key: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('translationCache', 'readwrite');
      const store = tx.objectStore('translationCache');
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('translationCache', 'readwrite');
      const store = tx.objectStore('translationCache');
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async evictLRUIfNeeded(maxLimit: number = MAX_CACHE_ENTRIES): Promise<number> {
    const db = await this.openDB();
    const allEntries = await new Promise<CacheEntry[]>((resolve, reject) => {
      const tx = db.transaction('translationCache', 'readonly');
      const store = tx.objectStore('translationCache');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as CacheEntry[]);
      req.onerror = () => reject(req.error);
    });

    if (allEntries.length <= maxLimit) {
      return 0;
    }

    allEntries.sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = allEntries.slice(0, allEntries.length - maxLimit);

    const tx = db.transaction('translationCache', 'readwrite');
    const store = tx.objectStore('translationCache');
    for (const item of toRemove) {
      store.delete(item.key);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return toRemove.length;
  }
}

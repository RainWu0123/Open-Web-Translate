/**
 * Vocabulary Repository
 * Manages storage operations for vocabulary items in IndexedDB.
 */
import { Database } from './database';
import type { VocabularyItem } from './schemas';

export class VocabularyRepository {
  private db = Database.getInstance();

  async add(item: Omit<VocabularyItem, 'addedAt' | 'schemaVersion'>): Promise<void> {
    const store = await this.db.getStore('vocabularyItems', 'readwrite');
    const vocabItem: VocabularyItem = {
      ...item,
      addedAt: Date.now(),
      schemaVersion: 1,
    };
    return new Promise((resolve, reject) => {
      const request = store.put(vocabItem);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<VocabularyItem[]> {
    const store = await this.db.getStore('vocabularyItems', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const items = request.result || [];
        // Sort by addedAt desc
        items.sort((a, b) => b.addedAt - a.addedAt);
        resolve(items);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: string): Promise<void> {
    const store = await this.db.getStore('vocabularyItems', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    const store = await this.db.getStore('vocabularyItems', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

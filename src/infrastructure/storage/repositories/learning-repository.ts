/**
 * Learning Repository
 *
 * Unified storage and query manager for vocabulary cards with SRS progression,
 * backwards-compatible with legacy IndexedDB vocabularyItems and local storage.
 */
import { Database } from '../indexeddb/database';
import { SrsEngine } from '@/core/learning/srs-engine';
import type { LearningCard, SrsGrade } from '@/core/domain/learning-types';
import { extensionBridge } from '@/infrastructure/messaging/extension-bridge';
import { createLogger } from '@/shared/logger';

const logger = createLogger('LearningRepository');

export class LearningRepository {
  private db = Database.getInstance();
  private hasMigratedLocalStorage = false;

  private normalizeCard(raw: any): LearningCard {
    const now = Date.now();
    const createdAt = raw.createdAt || raw.addedAt || now;
    const word = raw.word || raw.surface || raw.sourceText || '';
    const meaning = raw.meaning || raw.translation || raw.translatedText || '';

    const srs = raw.srs || SrsEngine.createInitialState(createdAt);

    return {
      id: raw.id || `card_${now}_${Math.random().toString(36).slice(2, 7)}`,
      word,
      lemma: raw.lemma || word,
      pos: raw.pos || undefined,
      phonetic: raw.phonetic || raw.reading || undefined,
      meaning,
      contextSentence: raw.contextSentence || raw.context || (raw.example && raw.example.text) || '',
      contextTranslation: raw.contextTranslation || (raw.example && raw.example.translation) || undefined,
      sourceUrl: raw.sourceUrl || raw.url || undefined,
      mediaTimestampMs: raw.mediaTimestampMs ?? (raw.example && raw.example.cueStartMs) ?? undefined,
      mediaTitle: raw.mediaTitle || (raw.example && raw.example.episodeId) || undefined,
      sourceLang: raw.sourceLang || raw.language || 'auto',
      targetLang: raw.targetLang || 'zh-Hant',
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      srs,
      createdAt,
      updatedAt: raw.updatedAt || now,
    };
  }

  /**
   * Imports any legacy cards from storage.local ('owt_saved_vocabulary').
   */
  public async syncLocalStorageIfPresent(): Promise<void> {
    if (this.hasMigratedLocalStorage) return;
    this.hasMigratedLocalStorage = true;

    try {
      const list = await extensionBridge.getLocalStorage<any[]>('owt_saved_vocabulary');
      if (list && Array.isArray(list) && list.length > 0) {
        for (const item of list) {
          const card = this.normalizeCard(item);
          await this.save(card);
        }
        logger.info(`Migrated ${list.length} cards from local storage into LearningRepository`);
      }
    } catch (err) {
      logger.debug('No local storage cards to migrate or storage unready', err);
    }
  }

  public async save(card: LearningCard): Promise<LearningCard> {
    const store = await this.db.getStore('vocabularyItems', 'readwrite');
    const normalized = this.normalizeCard(card);
    return new Promise((resolve, reject) => {
      const request = store.put(normalized);
      request.onsuccess = () => resolve(normalized);
      request.onerror = () => reject(request.error);
    });
  }

  public async add(
    item: Partial<LearningCard> & { word: string; meaning: string },
  ): Promise<LearningCard> {
    const now = Date.now();
    const id = item.id || `card_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const fullCard: LearningCard = this.normalizeCard({
      ...item,
      id,
      createdAt: now,
      updatedAt: now,
      srs: item.srs || SrsEngine.createInitialState(now),
    });

    return await this.save(fullCard);
  }

  public async getById(id: string): Promise<LearningCard | null> {
    const store = await this.db.getStore('vocabularyItems', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
        } else {
          resolve(this.normalizeCard(request.result));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  public async getAll(): Promise<LearningCard[]> {
    await this.syncLocalStorageIfPresent();
    const store = await this.db.getStore('vocabularyItems', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const items = (request.result || []).map((raw) => this.normalizeCard(raw));
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };
      request.onerror = () => reject(request.error);
    });
  }

  public async getDueCards(now: number = Date.now()): Promise<LearningCard[]> {
    const all = await this.getAll();
    return all.filter((card) => SrsEngine.isDue(card.srs, now));
  }

  public async recordReview(id: string, grade: SrsGrade, now: number = Date.now()): Promise<LearningCard> {
    const card = await this.getById(id);
    if (!card) throw new Error(`Card not found: ${id}`);

    const nextSrs = SrsEngine.calculateNextState(card.srs, grade, now);
    card.srs = nextSrs;
    card.updatedAt = now;

    await this.save(card);
    return card;
  }

  public async delete(id: string): Promise<void> {
    const store = await this.db.getStore('vocabularyItems', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public async clear(): Promise<void> {
    const store = await this.db.getStore('vocabularyItems', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ─── Anki & CSV Exporters ──────────────────────────────────────────

  /**
   * Generates Anki-compatible TSV format with Front (Word + Context cloze),
   * Back (Meaning + Reading + Explanation), and Tags.
   */
  public static exportToAnki(cards: LearningCard[]): string {
    const lines = cards.map((c) => {
      const front = c.word;
      const reading = c.phonetic ? `[${c.phonetic}]` : '';
      const back = [
        c.meaning,
        reading,
        c.pos ? `(${c.pos})` : '',
        c.lemma && c.lemma !== c.word ? `原形: ${c.lemma}` : '',
        c.contextSentence ? `<br><br><i>${c.contextSentence}</i>` : '',
        c.contextTranslation ? `<br><span style="color:#888">${c.contextTranslation}</span>` : '',
      ]
        .filter(Boolean)
        .join(' ');

      const tags = (c.tags || []).join(' ');
      // Anki tab-separated values: Front \t Back \t Tags
      return `${front.replace(/\t/g, ' ')}\t${back.replace(/\t/g, ' ')}\t${tags}`;
    });

    return lines.join('\n');
  }

  public static exportToCSV(cards: LearningCard[]): string {
    const headers = ['Word', 'Meaning', 'Phonetic', 'POS', 'Lemma', 'Context Sentence', 'Context Translation', 'URL', 'Created At'];
    const rows = cards.map((c) => [
      `"${(c.word || '').replace(/"/g, '""')}"`,
      `"${(c.meaning || '').replace(/"/g, '""')}"`,
      `"${(c.phonetic || '').replace(/"/g, '""')}"`,
      `"${(c.pos || '').replace(/"/g, '""')}"`,
      `"${(c.lemma || '').replace(/"/g, '""')}"`,
      `"${(c.contextSentence || '').replace(/"/g, '""')}"`,
      `"${(c.contextTranslation || '').replace(/"/g, '""')}"`,
      `"${(c.sourceUrl || '').replace(/"/g, '""')}"`,
      new Date(c.createdAt).toISOString(),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}

export const learningRepository = new LearningRepository();

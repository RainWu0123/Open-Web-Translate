/**
 * IndexedDB Schemas
 */
export interface GlossaryEntry {
  id: string;
  sourceText: string;
  targetText: string;
  schemaVersion: number;
}

export interface TranslationCacheEntry {
  cacheKey: string;
  normalizedSourceHash: string;
  sourceLanguage: string;
  targetLanguage: string;
  providerId: string;
  providerFingerprint: string;
  promptVersion: string;
  glossaryVersion: string;
  translationResult: string;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number;
  schemaVersion: 2;
}

export interface VocabularyItem {
  id: string;
  word: string;
  translation: string;
  context: string;
  url?: string;
  addedAt: number;
  schemaVersion: number;
}

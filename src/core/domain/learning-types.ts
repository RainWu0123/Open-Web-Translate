/**
 * AI Language Learning Core Domain Types
 */

export interface WordAnalysisRequest {
  word: string;
  sentence: string;
  sourceLang: string;
  targetLang: string;
}

export interface WordAnalysisResult {
  word: string;
  lemma: string;
  pos: string;
  phonetic?: string;
  meaningInContext: string;
  generalMeanings: string[];
  collocations?: string[];
  examples?: Array<{ sentence: string; translation: string }>;
}

export interface GrammarExplanationRequest {
  sentence: string;
  focusWord?: string;
  sourceLang: string;
  targetLang: string;
}

export interface GrammarBreakdownItem {
  segment: string;
  role: string;
  explanation: string;
}

export interface GrammarExplanation {
  sentence: string;
  translation: string;
  breakdown: GrammarBreakdownItem[];
  keyPoints: string[];
  difficultyLevel?: string;
  nuanceOrTone?: string;
}

export type SrsGrade = 'again' | 'hard' | 'good' | 'easy';

export interface SrsHistoryItem {
  date: number;
  grade: SrsGrade;
  interval: number;
}

export interface SrsState {
  interval: number;        // Interval in days
  repetition: number;      // Repetition count
  easeFactor: number;      // Ease factor (defaults to 2.5)
  nextReviewDate: number;  // Timestamp in ms
  lastReviewDate?: number;
  history?: SrsHistoryItem[];
}

export interface LearningCard {
  id: string;
  word: string;
  lemma: string;
  pos?: string;
  phonetic?: string;
  meaning: string;
  contextSentence: string;
  contextTranslation?: string;
  sourceUrl?: string;
  mediaTimestampMs?: number;
  mediaTitle?: string;
  sourceLang: string;
  targetLang: string;
  tags: string[];
  srs: SrsState;
  createdAt: number;
  updatedAt: number;
}

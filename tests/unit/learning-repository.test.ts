import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LearningRepository } from '../../src/infrastructure/storage/repositories/learning-repository';
import type { LearningCard } from '../../src/core/domain/learning-types';

describe('LearningRepository Unit Tests', () => {
  it('correctly formats Anki deck export TSV format', () => {
    const mockCards: LearningCard[] = [
      {
        id: 'card-1',
        word: 'benevolent',
        lemma: 'benevolent',
        pos: 'adjective',
        phonetic: '/bəˈnev.əl.ənt/',
        meaning: '仁慈的、和藹的',
        contextSentence: 'He was a benevolent leader.',
        contextTranslation: '他是一位仁慈的領袖。',
        sourceLang: 'en',
        targetLang: 'zh-Hant',
        tags: ['advanced', 'leadership'],
        srs: {
          interval: 1,
          repetition: 1,
          easeFactor: 2.5,
          nextReviewDate: 1718000000000,
        },
        createdAt: 1718000000000,
        updatedAt: 1718000000000,
      },
    ];

    const ankiTsv = LearningRepository.exportToAnki(mockCards);
    expect(ankiTsv).toContain('benevolent\t');
    expect(ankiTsv).toContain('仁慈的、和藹的');
    expect(ankiTsv).toContain('[/bəˈnev.əl.ənt/]');
    expect(ankiTsv).toContain('(adjective)');
    expect(ankiTsv).toContain('He was a benevolent leader.');
    expect(ankiTsv).toContain('他是一位仁慈的領袖。');
    expect(ankiTsv).toContain('advanced leadership');
  });

  it('correctly formats CSV export', () => {
    const mockCards: LearningCard[] = [
      {
        id: 'card-2',
        word: 'apple',
        lemma: 'apple',
        pos: 'noun',
        phonetic: 'æp.əl',
        meaning: '蘋果',
        contextSentence: 'An apple a day',
        contextTranslation: '一天一蘋果',
        sourceUrl: 'https://example.com',
        sourceLang: 'en',
        targetLang: 'zh-Hant',
        tags: [],
        srs: {
          interval: 6,
          repetition: 2,
          easeFactor: 2.5,
          nextReviewDate: 1718500000000,
        },
        createdAt: 1718000000000,
        updatedAt: 1718000000000,
      },
    ];

    const csv = LearningRepository.exportToCSV(mockCards);
    expect(csv).toContain('Word,Meaning,Phonetic,POS,Lemma,Context Sentence,Context Translation,URL,Created At');
    expect(csv).toContain('"apple"');
    expect(csv).toContain('"蘋果"');
    expect(csv).toContain('"æp.əl"');
    expect(csv).toContain('"An apple a day"');
  });
});

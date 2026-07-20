import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VocabularyRepository } from '../../src/infrastructure/storage/indexeddb/vocabulary-repository';
import { VocabularyExporter } from '../../src/infrastructure/storage/repositories/vocabulary-exporter';

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
      },
    },
  },
}));

describe('Vocabulary Workbench Unit Tests', () => {
  let repository: VocabularyRepository;

  beforeEach(() => {
    repository = new VocabularyRepository();
    vi.restoreAllMocks();
  });

  it('correctly exports vocabulary items to CSV', () => {
    const mockItems = [
      {
        id: 'test-1',
        word: 'benevolent',
        translation: 'kind and helpful',
        context: 'He was a benevolent leader.',
        url: 'https://youtube.com/watch?v=123&t=12s',
        addedAt: 1718000000000,
        schemaVersion: 1,
      },
    ];

    const csv = VocabularyExporter.exportToCSV(mockItems);
    expect(csv).toContain('benevolent');
    expect(csv).toContain('kind and helpful');
    expect(csv).toContain('He was a benevolent leader.');
    expect(csv).toContain('https://youtube.com/watch?v=123&t=12s');
  });
});

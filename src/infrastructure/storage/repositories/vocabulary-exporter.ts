/**
 * Vocabulary Exporter
 * Generates CSV files suitable for direct import into Anki or spreadsheet applications.
 */
import type { VocabularyItem } from '../indexeddb/schemas';

export class VocabularyExporter {
  static exportToCSV(items: VocabularyItem[]): string {
    const header = 'Word,Translation,Context,Video URL,Added At\n';
    const rows = items.map((item) => {
      const escape = (text: string) => `"${text.replaceAll('"', '""')}"`;
      const dateStr = new Date(item.addedAt).toISOString();
      return `${escape(item.word)},${escape(item.translation)},${escape(item.context)},${escape(item.url || '')},${escape(dateStr)}`;
    });
    return header + rows.join('\n');
  }

  static downloadCSV(items: VocabularyItem[]): void {
    const csvContent = this.exportToCSV(items);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `owt-vocabulary-${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

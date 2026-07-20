/** Formats available for export */
export type ExportFormat = "csv" | "anki" | "json";

/** An item saved for vocabulary learning */
export interface VocabularyItem {
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  context?: string;
  url?: string;
  timestamp: number;
}

/** Options for exporting learning data */
export interface ExportOptions {
  format: ExportFormat;
  includeContext: boolean;
  tags?: string[];
}

/** Exporter interface */
export interface LearningExporter {
  export(items: VocabularyItem[], options: ExportOptions): Promise<Blob>;
}

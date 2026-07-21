import { SubtitleCue } from '@/shared/subtitles/ttml-parser';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { createLogger } from '@/shared/logger';

const logger = createLogger('NetflixTranslationPipeline');

export const BATCH_MAX_CHARS = 3000;

export function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

export class NetflixTranslationPipeline {
  private cache = new Map<string, string>();
  private pendingRequests = new Map<string, Promise<string>>();

  constructor() {}

  public getCacheKey(lang: string, text: string): string {
    return `${lang}:${djb2Hash(text)}`;
  }

  public getCached(lang: string, text: string): string | undefined {
    return this.cache.get(this.getCacheKey(lang, text));
  }

  public setCache(lang: string, text: string, translation: string): void {
    const key = this.getCacheKey(lang, text);
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= 2000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, translation);
  }

  public clearCache(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  /**
   * Translate a single text string, checking cache first.
   */
  public async translateText(text: string, targetLang: string): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return '';

    const cached = this.getCached(targetLang, trimmed);
    if (cached) return cached;

    const key = this.getCacheKey(targetLang, trimmed);
    const existing = this.pendingRequests.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const response = await messageRouter.sendMessage<any>({
          type: 'TRANSLATE_REQUEST',
          segments: [{ id: 'nf_cue', text: trimmed }],
          sourceLanguage: 'auto',
          targetLanguage: targetLang,
        });

        const translated = response?.segments?.[0]?.translatedText ?? trimmed;
        this.setCache(targetLang, trimmed, translated);
        return translated;
      } catch (err) {
        logger.warn('Translation failed, falling back to original text:', err);
        return trimmed;
      } finally {
        this.pendingRequests.delete(key);
      }
    })();

    this.pendingRequests.set(key, promise);
    return promise;
  }

  /**
   * Batch pre-translate cues while keeping total payload under BATCH_MAX_CHARS.
   */
  public async batchTranslateCues(cues: SubtitleCue[], targetLang: string): Promise<void> {
    const uncachedCues: SubtitleCue[] = [];
    let currentBatchLen = 0;

    for (const cue of cues) {
      if (!cue.text || this.getCached(targetLang, cue.text.trim())) {
        continue;
      }
      if (currentBatchLen + cue.text.length > BATCH_MAX_CHARS) {
        break; // Process in chunks up to BATCH_MAX_CHARS
      }
      uncachedCues.push(cue);
      currentBatchLen += cue.text.length;
    }

    if (uncachedCues.length === 0) return;

    // Parallel translate uncached cues in batch
    await Promise.allSettled(
      uncachedCues.map((cue) => this.translateText(cue.text, targetLang)),
    );
  }
}

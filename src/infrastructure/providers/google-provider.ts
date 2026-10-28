/**
 * Google Translate Provider (undocumented web endpoint).
 *
 * IMPORTANT: translate.googleapis.com/translate_a/single with client=gtx is
 * not the documented Google Cloud Translation API and carries no compatibility
 * guarantee from Google. OWT contains only its own request/response adapter;
 * no Google source code is bundled. Users who need a supported contractual API
 * should prefer a documented provider such as DeepL, Gemini, or Custom HTTP.
 */
import type { ProviderId, SegmentId } from '../../core/contracts/common';
import type { ProviderCapabilities } from '../../core/contracts/capabilities';
import type {
  TranslationProvider,
  ProviderConfigValidation,
} from '../../core/contracts/provider';
import type {
  TranslationRequest,
  TranslationResult,
  TranslatedSegment,
} from '../../core/contracts/translation';
import {
  ProviderError,
  NetworkError,
  QuotaExceededError,
} from '../../core/domain/errors/translation-errors';
import { httpTranslationFetch } from './http-translation-client';
import { createLogger } from '../../shared/logger';
import { normalizeSubtitleAlternatives } from '../../shared/utils/subtitle-text';

const logger = createLogger('GoogleTranslateProvider');

const GOOGLE_TRANSLATE_ORIGIN = 'https://translate.googleapis.com';

export class GoogleTranslateProvider implements TranslationProvider {
  readonly id = 'google-provider' as ProviderId;
  readonly displayName = 'Google Translate (Free)';
  readonly capabilities: ProviderCapabilities = {
    streaming: false,
    glossary: false,
    context: false,
    maxSegments: 50,
  };

  validateConfig(_config: unknown): ProviderConfigValidation {
    return { isValid: true };
  }

  private mapTargetLanguage(lang: string): string {
    const l = lang.trim().toLowerCase();
    if (l === 'zh-hant' || l === 'zh-tw' || l === 'zh-hk') return 'zh-TW';
    if (l === 'zh-hans' || l === 'zh-cn') return 'zh-CN';
    return lang.split('-')[0];
  }

  private async translateSingle(text: string, targetLang: string, signal?: AbortSignal): Promise<string> {
    const url = `${GOOGLE_TRANSLATE_ORIGIN}/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

    try {
      const { json } = await httpTranslationFetch(this.id, {
        url,
        signal,
        retries: 2,
        interpretStatus: (status) =>
          status === 429 ? new QuotaExceededError('Google Translate rate limit reached') : null,
      });

      if (Array.isArray(json) && Array.isArray((json as unknown[])[0])) {
        return ((json as unknown[])[0] as unknown[]).map((item: any) => item[0]).join('');
      }
      throw new ProviderError(this.id, 'Unexpected Google Translate response format');
    } catch (primaryErr) {
      if (signal?.aborted) throw primaryErr;
      try {
        const backupUrl = `${GOOGLE_TRANSLATE_ORIGIN}/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(targetLang)}&q=${encodeURIComponent(text)}`;
        const { json: backupJson } = await httpTranslationFetch(this.id, {
          url: backupUrl,
          signal,
          retries: 1,
        });
        if (Array.isArray(backupJson) && typeof backupJson[0] === 'string' && backupJson[0].trim()) {
          return backupJson[0];
        }
        if (
          Array.isArray(backupJson) &&
          Array.isArray(backupJson[0]) &&
          typeof backupJson[0][0] === 'string' &&
          backupJson[0][0].trim()
        ) {
          return backupJson[0][0];
        }
      } catch {
        // Re-throw primary error below so existing error semantics are preserved
      }
      throw primaryErr;
    }
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const targetLang = this.mapTargetLanguage(request.targetLanguage);

    const translatedSegments: TranslatedSegment[] = [];
    try {
      if (request.segments.length === 1) {
        const seg = request.segments[0];
        const translatedText = await this.translateSingle(seg.text, targetLang, request.signal);
        translatedSegments.push({
          id: seg.id,
          text: normalizeSubtitleAlternatives(translatedText),
        });
      } else {
        const chunkSize = 8;
        for (let i = 0; i < request.segments.length; i += chunkSize) {
          const batch = request.segments.slice(i, i + chunkSize);
          const sanitizedLines = batch.map((s) => s.text.replace(/\r?\n+/g, ' ').trim());
          let resolvedBatch: TranslatedSegment[] | null = null;

          if (batch.length > 1 && sanitizedLines.every((l) => l.length > 0)) {
            try {
              const joined = sanitizedLines.join('\n');
              const combinedTranslated = await this.translateSingle(joined, targetLang, request.signal);
              const splitLines = combinedTranslated
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean);
              if (splitLines.length === batch.length) {
                resolvedBatch = batch.map((seg, idx) => ({
                  id: seg.id,
                  text: normalizeSubtitleAlternatives(splitLines[idx]),
                }));
              }
            } catch {
              // Fall back to individual requests below
            }
          }

          if (resolvedBatch) {
            translatedSegments.push(...resolvedBatch);
            continue;
          }

          const concurrency = 3;
          for (let j = 0; j < batch.length; j += concurrency) {
            const subBatch = batch.slice(j, j + concurrency);
            const subResults = await Promise.all(
              subBatch.map(async (seg) => {
                const translatedText = await this.translateSingle(seg.text, targetLang, request.signal);
                return {
                  id: seg.id,
                  text: normalizeSubtitleAlternatives(translatedText),
                };
              }),
            );
            translatedSegments.push(...subResults);
          }
        }
      }
    } catch (err: any) {
      if (err instanceof QuotaExceededError || err instanceof NetworkError || err instanceof ProviderError) {
        throw err;
      }
      logger.error('Google Translate error', err);
      throw new NetworkError(`Google Translate failed: ${err?.message || 'Unknown error'}`);
    }

    return {
      providerId: this.id,
      segments: translatedSegments,
      warnings: [],
      cacheable: true,
    };
  }
}

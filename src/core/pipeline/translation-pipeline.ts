import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { getProvider } from '@/infrastructure/providers';
import { CacheRepository } from '@/infrastructure/storage/repositories/cache-repository';
import { createLogger } from '@/shared/logger';
import type { ExtensionSettings } from '@/core/contracts/messages';

const logger = createLogger('TranslationPipeline');

export interface TranslationPipelineRequest {
  bypassCache?: boolean;
  segments: Array<{ id: string; text: string }>;
  sourceLanguage: string;
  targetLanguage: string;
  forceProvider?: string;
  context?: {
    previous?: Array<{ source: string; translation: string }>;
  };
}

export interface TranslationPipelineResponse {
  segments: Array<{ id: string; translatedText: string }>;
  error?: {
    code: string;
    message: string;
  };
}

export class TranslationPipeline {
  private cacheRepo = new CacheRepository();

  /**
   * Settings cache: subtitle mode calls translate() on every caption, and
   * storage reads dominated latency. Invalidated by SettingsStorage.onChange.
   */
  private cachedSettings: ExtensionSettings | null = null;
  private settingsCacheReady = false;

  constructor() {
    try {
      SettingsStorage.watch(() => {
        this.settingsCacheReady = false;
      });
    } catch {
      // storage listener unavailable (tests/sandboxed contexts)
    }
  }

  private async getSettings(): Promise<ExtensionSettings> {
    if (this.settingsCacheReady && this.cachedSettings) return this.cachedSettings;
    this.cachedSettings = await SettingsStorage.get();
    this.settingsCacheReady = true;
    return this.cachedSettings;
  }

  public async translate(msg: TranslationPipelineRequest): Promise<TranslationPipelineResponse> {
    const settings = await this.getSettings();
    const activeProviderId = msg.forceProvider || settings.activeProviderId || 'google-provider';
    const provider = getProvider(activeProviderId, settings);

    const resultsMap = new Map<string, string>();
    const segmentsToTranslate: Array<{ id: string; text: string }> = [];

    const providerFingerprint =
      activeProviderId === 'gemini-provider'
        ? `v2:${settings.geminiModel?.trim() || 'gemini-2.0-flash'}:${settings.aiTranslationInstructions?.trim() || ''}`
        : activeProviderId === 'ollama-provider'
        ? `v2:${settings.ollamaEndpoint?.trim() || 'default'}:${settings.ollamaModel?.trim() || 'llama3'}:${settings.aiTranslationInstructions?.trim() || ''}`
        : activeProviderId === 'local-http-provider'
        ? `v2:${settings.localHttpEndpoint?.trim() || 'default'}:${settings.localHttpModel?.trim() || 'local-model'}:${settings.aiTranslationInstructions?.trim() || ''}`
        : activeProviderId === 'google-provider' || activeProviderId === 'google'
        ? 'free-v2-subtitle'
        : 'default';

    // 1. Concurrent cache lookups (were N sequential IndexedDB roundtrips)
    const cacheHits = await Promise.all(
      msg.segments.map((seg) => msg.bypassCache ? Promise.resolve({ seg, cached: null }) :
        this.cacheRepo
          .get({
            sourceText: seg.text,
            sourceLanguage: msg.sourceLanguage,
            targetLanguage: msg.targetLanguage,
            providerId: activeProviderId,
            providerFingerprint,
          })
          .then((cached) => ({ seg, cached })),
      ),
    );

    for (const { seg, cached } of cacheHits) {
      if (cached !== null) {
        resultsMap.set(seg.id, cached);
      } else {
        segmentsToTranslate.push(seg);
      }
    }

    // 2. All-cache-hit fast path
    if (segmentsToTranslate.length === 0) {
      logger.debug('Translation cache hit for all segments');
      return {
        segments: msg.segments.map((s) => ({
          id: s.id,
          translatedText: resultsMap.get(s.id) || '',
        })),
      };
    }

    // 3. Call the selected provider; failures remain visible to the caller.
    logger.info(
      `Cache miss for ${segmentsToTranslate.length}/${msg.segments.length} segments, calling provider ${activeProviderId}`,
    );

    const request = {
      segments: segmentsToTranslate.map((s) => ({ id: s.id as any, text: s.text })),
      sourceLanguage: msg.sourceLanguage as any,
      targetLanguage: msg.targetLanguage as any,
      mode: settings.defaultTranslationMode || 'fast',
      ...(settings.aiTranslationInstructions?.trim()
        ? { instructions: settings.aiTranslationInstructions.trim().slice(0, 2000) }
        : {}),
      ...(msg.context?.previous?.length ? { context: msg.context } : {}),
    };

    // A failed service is an error, never a successful echo of the source.
    // Keep the selected provider and its privacy boundary explicit.
    const providerResult = await provider.translate(request);
    if (segmentsToTranslate.some(segment => !providerResult.segments.some(result => result.id === segment.id && result.text.trim()))) {
      throw new Error('翻譯服務未回傳完整譯文，請重試或更換服務。');
    }

    // 4. Persist new translations (concurrent writes; Map lookup instead of
    //    the previous O(n*m) find-per-result loop)
    const sourceById = new Map(segmentsToTranslate.map((s) => [s.id as string, s]));
    if (providerResult.cacheable) {
      await Promise.all(
        providerResult.segments.map((resSeg: { id: unknown; text: string }) => {
          const originalSeg = sourceById.get(resSeg.id as string);
          if (!originalSeg) return Promise.resolve();
          return this.cacheRepo.set({
            sourceText: originalSeg.text,
            translatedText: resSeg.text,
            sourceLanguage: msg.sourceLanguage,
            targetLanguage: msg.targetLanguage,
            providerId: activeProviderId,
            providerFingerprint,
          });
        }),
      );
    }
    for (const resSeg of providerResult.segments) {
      const originalSeg = sourceById.get(resSeg.id as string);
      if (originalSeg) {
        resultsMap.set(originalSeg.id, resSeg.text);
      }
    }

    return {
      segments: msg.segments.map((s) => ({
        id: s.id,
        translatedText: resultsMap.get(s.id) || '',
      })),
    };
  }
}

export const translationPipeline = new TranslationPipeline();

import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { getProvider } from '@/infrastructure/providers';
import { getProviderCacheIdentity } from '@/infrastructure/providers/cache-identity';
import { CacheRepository, sha256 } from '@/infrastructure/storage/repositories/cache-repository';
import { createLogger } from '@/shared/logger';
import type { InternalExtensionSettings } from '@/core/contracts/messages';
import { ConfigurationError } from '@/core/domain/errors/translation-errors';

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
  private cachedSettings: InternalExtensionSettings | null = null;
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

  private async getSettings(): Promise<InternalExtensionSettings> {
    if (this.settingsCacheReady && this.cachedSettings) return this.cachedSettings;
    this.cachedSettings = await SettingsStorage.getInternal();
    this.settingsCacheReady = true;
    return this.cachedSettings;
  }

  public async translate(msg: TranslationPipelineRequest): Promise<TranslationPipelineResponse> {
    const settings = await this.getSettings();
    const activeProviderId = msg.forceProvider || settings.activeProviderId || 'google-provider';
    const provider = getProvider(activeProviderId, settings);

    // Brand-new installs must see the data-transfer disclosure before the
    // first remote translation request. Local providers remain usable.
    // Undefined is intentionally allowed so existing installs are not
    // retroactively blocked during upgrade.
    if (settings.remoteProviderDisclosureVersion === 0 && provider.isLocal !== true) {
      throw new ConfigurationError(
        '使用雲端或遠端翻譯服務前，請先在 Open Web Translate 設定頁確認資料傳輸說明。',
      );
    }

    const resultsMap = new Map<string, string>();
    const segmentsToTranslate: Array<{ id: string; text: string }> = [];

    const cacheIdentity = getProviderCacheIdentity(activeProviderId, settings);
    const cacheProviderId = cacheIdentity.providerId;
    const contextPairs =
      provider.capabilities?.context && msg.context?.previous?.length
        ? msg.context.previous.map((pair) => ({
            source: pair.source.trim().replace(/\s+/g, ' '),
            translation: pair.translation.trim().replace(/\s+/g, ' '),
          }))
        : [];
    const contextFingerprint =
      contextPairs.length > 0
        ? await sha256(JSON.stringify(contextPairs))
        : 'none';
    const providerFingerprint =
      `${cacheIdentity.fingerprint};context=${contextFingerprint}`;

    // 1. Concurrent cache lookups (were N sequential IndexedDB roundtrips)
    const cacheHits = await Promise.all(
      msg.segments.map((seg) => msg.bypassCache ? Promise.resolve({ seg, cached: null }) :
        this.cacheRepo
          .get({
            sourceText: seg.text,
            sourceLanguage: msg.sourceLanguage,
            targetLanguage: msg.targetLanguage,
            providerId: cacheProviderId,
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

    const configuredMaxSegments = provider.capabilities?.maxSegments;
    const maxSegmentsPerRequest =
      Number.isFinite(configuredMaxSegments) && configuredMaxSegments > 0
        ? Math.floor(configuredMaxSegments)
        : segmentsToTranslate.length;

    const batches: Array<typeof segmentsToTranslate> = [];
    for (let offset = 0; offset < segmentsToTranslate.length; offset += maxSegmentsPerRequest) {
      batches.push(segmentsToTranslate.slice(offset, offset + maxSegmentsPerRequest));
    }

    if (batches.length > 1) {
      logger.info(
        `Splitting ${segmentsToTranslate.length} segments into ${batches.length} batches (provider limit: ${maxSegmentsPerRequest})`,
      );
    }

    const translatedForCache: Array<{
      source: { id: string; text: string };
      translatedText: string;
      cacheable: boolean;
    }> = [];

    // A failed service is an error, never a successful echo of the source.
    // Keep the selected provider and its privacy boundary explicit. Batches
    // are executed sequentially so local providers are not overloaded and
    // result ordering remains deterministic.
    for (const batch of batches) {
      const request = {
        segments: batch.map((s) => ({ id: s.id as any, text: s.text })),
        sourceLanguage: msg.sourceLanguage as any,
        targetLanguage: msg.targetLanguage as any,
        mode: settings.defaultTranslationMode || 'fast',
        ...(settings.aiTranslationInstructions?.trim()
          ? { instructions: settings.aiTranslationInstructions.trim().slice(0, 2000) }
          : {}),
        ...(provider.capabilities?.context && msg.context?.previous?.length
          ? { context: msg.context }
          : {}),
      };

      const providerResult = await provider.translate(request);
      const resultById = new Map(
        providerResult.segments.map((result) => [result.id as string, result.text]),
      );

      if (batch.some((segment) => !resultById.get(segment.id)?.trim())) {
        throw new Error('翻譯服務未回傳完整譯文，請重試或更換服務。');
      }

      for (const segment of batch) {
        const translatedText = resultById.get(segment.id)!;
        resultsMap.set(segment.id, translatedText);
        translatedForCache.push({
          source: segment,
          translatedText,
          cacheable: providerResult.cacheable,
        });
      }
    }

    // 4. Persist new translations only after every provider batch succeeded.
    // This avoids leaving a partially-cached page when a later batch fails.
    await Promise.all(
      translatedForCache
        .filter((entry) => entry.cacheable)
        .map((entry) =>
          this.cacheRepo.set({
            sourceText: entry.source.text,
            translatedText: entry.translatedText,
            sourceLanguage: msg.sourceLanguage,
            targetLanguage: msg.targetLanguage,
            providerId: cacheProviderId,
            providerFingerprint,
          }),
        ),
    );

    return {
      segments: msg.segments.map((s) => ({
        id: s.id,
        translatedText: resultsMap.get(s.id) || '',
      })),
    };
  }
}

export const translationPipeline = new TranslationPipeline();

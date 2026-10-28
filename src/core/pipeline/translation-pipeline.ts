import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { getProvider } from '@/infrastructure/providers';
import { getProviderCacheIdentity } from '@/infrastructure/providers/cache-identity';
import { CacheRepository, sha256 } from '@/infrastructure/storage/repositories/cache-repository';
import { createLogger } from '@/shared/logger';
import type { InternalExtensionSettings } from '@/core/contracts/messages';
import { ConfigurationError } from '@/core/domain/errors/translation-errors';
import { resolveProviderId, type TranslationUsage } from '@/core/settings/provider-selection';

const logger = createLogger('TranslationPipeline');

export interface TranslationPipelineRequest {
  bypassCache?: boolean;
  segments: Array<{ id: string; text: string }>;
  sourceLanguage: string;
  targetLanguage: string;
  forceProvider?: string;
  usage?: TranslationUsage;
  context?: {
    title?: string;
    previousText?: string;
    nextText?: string;
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
    const activeProviderId = resolveProviderId(settings, msg.usage, msg.forceProvider);
    const provider = getProvider(activeProviderId, settings);

    // Brand-new installs must see the data-transfer disclosure before the
    // first remote translation request. Local providers remain usable.
    // Undefined is intentionally allowed so existing installs are not
    // retroactively blocked during upgrade. Video subtitles explicitly enabled
    // by the user are also allowed so playback is never blocked.
    if (
      msg.usage !== 'video' &&
      settings.remoteProviderDisclosureVersion === 0 &&
      provider.isLocal !== true
    ) {
      throw new ConfigurationError(
        '使用雲端或遠端翻譯服務前，請先在 Open Web Translate 設定頁確認資料傳輸說明。',
      );
    }

    const resultsMap = new Map<string, string>();
    const segmentsToTranslate: Array<{ id: string; text: string }> = [];

    const cacheIdentity = getProviderCacheIdentity(activeProviderId, settings);
    const cacheProviderId = cacheIdentity.providerId;
    const norm = (value?: string): string | undefined => {
      const cleaned = value?.trim().replace(/\s+/g, ' ');
      return cleaned ? cleaned : undefined;
    };
    const contextPairs =
      provider.capabilities?.context && msg.context?.previous?.length
        ? msg.context.previous.map((pair) => ({
            source: pair.source.trim().replace(/\s+/g, ' '),
            translation: pair.translation.trim().replace(/\s+/g, ' '),
          }))
        : [];
    const prevContextLines = (msg.context?.previousText || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const nextContextLines = (msg.context?.nextText || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const computeSegmentProviderFingerprint = async (segIndex: number): Promise<string> => {
      if (!provider.capabilities?.context || !msg.context) {
        return `${cacheIdentity.fingerprint};context=none`;
      }
      const prevLine =
        segIndex > 0
          ? norm(msg.segments[segIndex - 1].text)
          : norm(prevContextLines.at(-1));
      const nextLine =
        segIndex + 1 < msg.segments.length
          ? norm(msg.segments[segIndex + 1].text)
          : norm(nextContextLines[0]);

      const contextHash = await sha256(
        JSON.stringify({
          title: norm(msg.context.title),
          prevLine,
          nextLine,
          ...(prevLine === undefined && contextPairs.length > 0 ? { previous: contextPairs } : {}),
        }),
      );
      return `${cacheIdentity.fingerprint};context=${contextHash}`;
    };

    const segmentFingerprints = await Promise.all(
      msg.segments.map((_, index) => computeSegmentProviderFingerprint(index)),
    );
    const fingerprintBySegmentId = new Map<string, string>(
      msg.segments.map((seg, index) => [seg.id, segmentFingerprints[index]]),
    );

    // 1. Concurrent cache lookups (were N sequential IndexedDB roundtrips)
    const cacheHits = await Promise.all(
      msg.segments.map((seg, index) =>
        msg.bypassCache
          ? Promise.resolve({ seg, cached: null })
          : this.cacheRepo
              .get({
                sourceText: seg.text,
                sourceLanguage: msg.sourceLanguage,
                targetLanguage: msg.targetLanguage,
                providerId: cacheProviderId,
                providerFingerprint: segmentFingerprints[index],
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

    const canFallbackForVideo =
      msg.usage === 'video' &&
      !msg.forceProvider &&
      provider.isLocal !== true &&
      activeProviderId !== 'google-provider';

    const translateWithVideoFallback = async (
      fallbackBatch: Array<{ id: string; text: string }>,
    ): Promise<Map<string, string>> => {
      const fallbackProvider = getProvider('google-provider', settings);
      const fallbackResult = await fallbackProvider.translate({
        segments: fallbackBatch.map((s) => ({ id: s.id as any, text: s.text })),
        sourceLanguage: msg.sourceLanguage as any,
        targetLanguage: msg.targetLanguage as any,
        mode: 'fast',
      });
      return new Map(
        fallbackResult.segments.map((result) => [result.id as string, result.text]),
      );
    };

    // A failed service is an error, never a successful echo of the source.
    // Keep the selected provider and its privacy boundary explicit. Batches
    // are executed sequentially so local providers are not overloaded and
    // result ordering remains deterministic.
    for (const batch of batches) {
      let context = msg.context;
      if (provider.capabilities?.context && context) {
        // Service limits and cache hits can split a scene. Preserve neighbouring
        // source lines even when they are outside this particular request.
        const first = msg.segments.findIndex(segment => segment.id === batch[0].id);
        const last = msg.segments.findIndex(segment => segment.id === batch.at(-1)!.id);
        const preceding = msg.segments.slice(Math.max(0, first - 8), first);
        const following = msg.segments.slice(last + 1, last + 9);
        context = {
          ...context,
          previousText: [context.previousText, ...preceding.map(segment => segment.text)].filter(Boolean).join('\n') || undefined,
          nextText: [...following.map(segment => segment.text), context.nextText].filter(Boolean).join('\n') || undefined,
          previous: [
            ...(context.previous || []),
            ...preceding.filter(segment => resultsMap.has(segment.id)).map(segment => ({
              source: segment.text, translation: resultsMap.get(segment.id)!,
            })),
          ].slice(-8),
        };
      }
      const request = {
        segments: batch.map((s) => ({ id: s.id as any, text: s.text })),
        sourceLanguage: msg.sourceLanguage as any,
        targetLanguage: msg.targetLanguage as any,
        mode: settings.defaultTranslationMode || 'fast',
        ...(settings.aiTranslationInstructions?.trim()
          ? { instructions: settings.aiTranslationInstructions.trim().slice(0, 2000) }
          : {}),
        ...(provider.capabilities?.context && context
          ? { context }
          : {}),
      };

      let resultById = new Map<string, string>();
      let batchCacheable = true;
      const fallbackSegmentIds = new Set<string>();

      try {
        const providerResult = await provider.translate(request);
        batchCacheable = providerResult.cacheable;
        resultById = new Map(
          providerResult.segments.map((result) => [result.id as string, result.text]),
        );
      } catch (primaryError) {
        if (!canFallbackForVideo) {
          throw primaryError;
        }
        logger.warn(
          `Primary video provider (${activeProviderId}) failed; falling back to google-provider for ${batch.length} subtitle cue(s)`,
          primaryError,
        );
        resultById = await translateWithVideoFallback(batch);
        batchCacheable = false;
        for (const seg of batch) fallbackSegmentIds.add(seg.id);
      }

      const missingSegments = batch.filter((segment) => !resultById.get(segment.id)?.trim());
      if (missingSegments.length > 0 && canFallbackForVideo) {
        try {
          logger.warn(
            `Primary video provider (${activeProviderId}) omitted ${missingSegments.length}/${batch.length} subtitle cue(s); filling missing cues via google-provider`,
          );
          const repairedMap = await translateWithVideoFallback(missingSegments);
          for (const seg of missingSegments) {
            const repairedText = repairedMap.get(seg.id)?.trim();
            if (repairedText) {
              resultById.set(seg.id, repairedText);
              fallbackSegmentIds.add(seg.id);
            }
          }
        } catch (fallbackErr) {
          logger.warn('Fallback for omitted video subtitle cues failed', fallbackErr);
        }
      }

      if (batch.some((segment) => !resultById.get(segment.id)?.trim())) {
        throw new Error('翻譯服務未回傳完整譯文，請重試或更換服務。');
      }

      for (const segment of batch) {
        const translatedText = resultById.get(segment.id)!;
        resultsMap.set(segment.id, translatedText);
        translatedForCache.push({
          source: segment,
          translatedText,
          cacheable: batchCacheable && !fallbackSegmentIds.has(segment.id),
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
            providerFingerprint:
              fingerprintBySegmentId.get(entry.source.id) ||
              `${cacheIdentity.fingerprint};context=none`,
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

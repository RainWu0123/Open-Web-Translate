import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { MockProvider, GoogleTranslateProvider, getProvider } from '@/infrastructure/providers';
import { CacheRepository } from '@/infrastructure/storage/repositories/cache-repository';
import { createLogger } from '@/shared/logger';
import type { ExtensionSettings } from '@/core/contracts/messages';

const logger = createLogger('TranslationPipeline');

export interface TranslationPipelineRequest {
  segments: Array<{ id: string; text: string }>;
  sourceLanguage: string;
  targetLanguage: string;
  forceProvider?: string;
}

export interface TranslationPipelineResponse {
  segments: Array<{ id: string; translatedText: string }>;
  error?: {
    code: string;
    message: string;
  };
}

export class TranslationPipeline {
  private googleProvider = new GoogleTranslateProvider();
  private mockProvider = new MockProvider();
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
        ? settings.geminiModel?.trim() || 'gemini-2.0-flash'
        : activeProviderId === 'ollama-provider'
        ? settings.ollamaModel?.trim() || 'llama3'
        : activeProviderId === 'local-http-provider'
        ? settings.localHttpModel?.trim() || 'local-model'
        : 'default';

    // 1. Concurrent cache lookups (were N sequential IndexedDB roundtrips)
    const cacheHits = await Promise.all(
      msg.segments.map((seg) =>
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

    // 3. Cache miss: call active provider with failover logic
    logger.info(
      `Cache miss for ${segmentsToTranslate.length}/${msg.segments.length} segments, calling provider ${activeProviderId}`,
    );

    const request = {
      segments: segmentsToTranslate.map((s) => ({ id: s.id as any, text: s.text })),
      sourceLanguage: msg.sourceLanguage as any,
      targetLanguage: msg.targetLanguage as any,
      mode: settings.defaultTranslationMode || 'fast',
    };

    let providerResult;
    let degraded: string | undefined;
    try {
      providerResult = await provider.translate(request);
    } catch (err: any) {
      if (provider.isLocal) {
        logger.error(
          `Local private provider ${activeProviderId} failed. Privacy boundary enforced (no fallback).`,
          err,
        );
        throw err;
      }

      logger.warn(`Primary provider ${activeProviderId} failed, falling back to GoogleTranslateProvider`, err);

      try {
        if (activeProviderId !== 'google-provider' && activeProviderId !== 'google') {
          providerResult = await this.googleProvider.translate(request);
        } else {
          degraded = 'mock-fallback';
          providerResult = await this.mockProvider.translate(request);
        }
      } catch (fallbackErr: any) {
        // Double failure: surface mock text but flag it so callers can warn.
        degraded = 'mock-fallback';
        logger.warn(`Fallback provider failed, serving MockProvider placeholder output`, fallbackErr);
        providerResult = await this.mockProvider.translate(request);
      }
    }

    // 4. Persist new translations (concurrent writes; Map lookup instead of
    //    the previous O(n*m) find-per-result loop)
    const sourceById = new Map(segmentsToTranslate.map((s) => [s.id as string, s]));
    if (providerResult.cacheable) {
      await Promise.all(
        providerResult.segments.map((resSeg) => {
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
      ...(degraded ? { error: { code: 'DEGRADED', message: degraded } } : {}),
    };
  }
}

export const translationPipeline = new TranslationPipeline();

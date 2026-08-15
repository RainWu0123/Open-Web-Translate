import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { MockProvider, GoogleTranslateProvider, getProvider } from '@/infrastructure/providers';
import { CacheRepository } from '@/infrastructure/storage/repositories/cache-repository';
import { createLogger } from '@/shared/logger';

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

  public async translate(msg: TranslationPipelineRequest): Promise<TranslationPipelineResponse> {
    const settings = await SettingsStorage.getSettings();
    const activeProviderId = msg.forceProvider || settings.activeProviderId || 'google-provider';
    const provider = getProvider(activeProviderId, settings);

    const segmentsToTranslate: Array<{ id: string; text: string }> = [];
    const resultsMap = new Map<string, string>();

    const providerFingerprint =
      activeProviderId === 'gemini-provider'
        ? settings.geminiModel?.trim() || 'gemini-2.0-flash'
        : activeProviderId === 'ollama-provider'
        ? settings.ollamaModel?.trim() || 'llama3'
        : activeProviderId === 'local-http-provider'
        ? settings.localHttpModel?.trim() || 'local-model'
        : 'default';

    // 1. Check cache FIRST for each segment
    for (const seg of msg.segments) {
      const cached = await this.cacheRepo.get({
        sourceText: seg.text,
        sourceLanguage: msg.sourceLanguage,
        targetLanguage: msg.targetLanguage,
        providerId: activeProviderId,
        providerFingerprint,
      });

      if (cached !== null) {
        resultsMap.set(seg.id, cached);
      } else {
        segmentsToTranslate.push(seg);
      }
    }

    // 2. If all segments hit cache (0 misses), return immediately
    if (segmentsToTranslate.length === 0) {
      logger.info('Translation cache hit for all segments');
      return {
        segments: msg.segments.map((s) => ({
          id: s.id,
          translatedText: resultsMap.get(s.id) || '',
        })),
      };
    }

    // 3. Cache miss: Call active provider with failover logic
    logger.info(
      `Cache miss for ${segmentsToTranslate.length}/${msg.segments.length} segments, calling provider ${activeProviderId}`,
    );

    let providerResult;
    try {
      providerResult = await provider.translate({
        segments: segmentsToTranslate.map((s) => ({ id: s.id as any, text: s.text })),
        sourceLanguage: msg.sourceLanguage as any,
        targetLanguage: msg.targetLanguage as any,
        mode: settings.defaultTranslationMode || 'fast',
      });
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
          providerResult = await this.googleProvider.translate({
            segments: segmentsToTranslate.map((s) => ({ id: s.id as any, text: s.text })),
            sourceLanguage: msg.sourceLanguage as any,
            targetLanguage: msg.targetLanguage as any,
            mode: settings.defaultTranslationMode || 'fast',
          });
        } else {
          providerResult = await this.mockProvider.translate({
            segments: segmentsToTranslate.map((s) => ({ id: s.id as any, text: s.text })),
            sourceLanguage: msg.sourceLanguage as any,
            targetLanguage: msg.targetLanguage as any,
            mode: settings.defaultTranslationMode || 'fast',
          });
        }
      } catch (fallbackErr: any) {
        logger.warn(`Fallback provider failed, attempting final MockProvider failover`, fallbackErr);
        providerResult = await this.mockProvider.translate({
          segments: segmentsToTranslate.map((s) => ({ id: s.id as any, text: s.text })),
          sourceLanguage: msg.sourceLanguage as any,
          targetLanguage: msg.targetLanguage as any,
          mode: settings.defaultTranslationMode || 'fast',
        });
      }
    }

    // 4. Save newly translated segments in cache
    for (const resSeg of providerResult.segments) {
      const originalSeg = segmentsToTranslate.find((s) => s.id === (resSeg.id as string));
      if (originalSeg) {
        resultsMap.set(originalSeg.id, resSeg.text);

        if (providerResult.cacheable) {
          await this.cacheRepo.set({
            sourceText: originalSeg.text,
            translatedText: resSeg.text,
            sourceLanguage: msg.sourceLanguage,
            targetLanguage: msg.targetLanguage,
            providerId: activeProviderId,
            providerFingerprint,
          });
        }
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

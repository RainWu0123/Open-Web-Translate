/**
 * Background Service Worker
 *
 * Registers message handlers, routes translation requests with cache-first logic
 * to active provider (MockProvider or GeminiProvider), and relays tab translation/restore
 * commands to content scripts via browser.tabs.sendMessage.
 */
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { MockProvider, GoogleTranslateProvider, getProvider } from '@/infrastructure/providers';
import { CacheRepository } from '@/infrastructure/storage/repositories/cache-repository';
import { VocabularyRepository } from '@/infrastructure/storage/repositories/vocabulary-repository';
import type { TranslationProvider } from '@/core/contracts/provider';
import { MessageErrorCode } from '@/core/contracts/messages';
import { createLogger } from '@/shared/logger';

const logger = createLogger('Background');

export default defineBackground(() => {
  logger.info('Service worker starting', { id: browser.runtime.id });

  const googleProvider = new GoogleTranslateProvider();
  const mockProvider = new MockProvider();
  const cacheRepo = new CacheRepository();

  // Purge expired cache entries on service worker launch
  cacheRepo.purgeExpired().catch(() => {});

  // ── TRANSLATE_REQUEST ──────────────────────────────────────────
  messageRouter.registerHandler('TRANSLATE_REQUEST', async (msg) => {
    try {
      const settings = await SettingsStorage.getSettings();
      const activeProviderId = msg.forceProvider || settings.activeProviderId || 'mock-provider';
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
        const cached = await cacheRepo.get({
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

      // 2. If all segments hit cache (0 misses), return immediately (0 fetch calls)
      if (segmentsToTranslate.length === 0) {
        logger.info('Translation cache hit for all segments');
        return {
          segments: msg.segments.map((s) => ({
            id: s.id,
            translatedText: resultsMap.get(s.id) || '',
          })),
        };
      }

      // 3. For cache misses, call active provider with auto-failover (unless local provider)
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
        // Enforce Strict Privacy Boundary: DO NOT auto-fallback to cloud or mock providers when active provider is local/private
        if (provider.isLocal) {
          logger.error(
            `Local private provider ${activeProviderId} failed. Privacy boundary enforced (no cloud/mock fallback).`,
            err,
          );
          throw err;
        }

        logger.warn(`Primary provider ${activeProviderId} failed, trying GoogleTranslateProvider fallback`, err);

        // Failover fallback (GoogleTranslateProvider first, then MockProvider)
        try {
          if (activeProviderId !== 'google-provider' && activeProviderId !== 'google') {
            providerResult = await googleProvider.translate({
              segments: segmentsToTranslate.map((s) => ({ id: s.id as any, text: s.text })),
              sourceLanguage: msg.sourceLanguage as any,
              targetLanguage: msg.targetLanguage as any,
              mode: settings.defaultTranslationMode || 'fast',
            });
          } else {
            throw err;
          }
        } catch (fallbackErr: any) {
          logger.warn(`Fallback provider failed, attempting final MockProvider failover`, fallbackErr);
          providerResult = await mockProvider.translate({
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
            await cacheRepo.set({
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

      // 5. Return complete translated segments array in original order
      return {
        segments: msg.segments.map((s) => ({
          id: s.id,
          translatedText: resultsMap.get(s.id) || s.text,
        })),
      };
    } catch (err: any) {
      logger.error('Error in TRANSLATE_REQUEST', err);
      throw err;
    }
  });

  // ── GET_SETTINGS ───────────────────────────────────────────────
  messageRouter.registerHandler('GET_SETTINGS', async () => {
    return await SettingsStorage.getSettings();
  });

  // ── UPDATE_SETTINGS ────────────────────────────────────────────
  messageRouter.registerHandler('UPDATE_SETTINGS', async (msg) => {
    await SettingsStorage.saveSettings(msg.settings);
    return await SettingsStorage.getSettings() as any;
  });

  // ── Helper: Relay active tab commands ───────────────────────────
  async function relayCommandToActiveTab(
    commandType: 'EXECUTE_PAGE_TRANSLATION' | 'RESTORE_PAGE_TRANSLATION',
    errorMessages: { tabNotFound: string; scriptUnavailable: string; executionFailed: string },
  ): Promise<any> {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (!activeTab || typeof activeTab.id !== 'number') {
        return {
          success: false,
          error: {
            code: MessageErrorCode.ACTIVE_TAB_NOT_FOUND,
            message: errorMessages.tabNotFound,
          },
        };
      }

      let res: any;
      try {
        res = await browser.tabs.sendMessage(activeTab.id, { type: commandType });
      } catch (initialErr) {
        logger.info('Content script missing or detached, injecting on the fly into tab', activeTab.id);
        try {
          if (browser.scripting) {
            await browser.scripting.executeScript({
              target: { tabId: activeTab.id },
              files: ['/content-scripts/content.js'],
            });
          } else if ((browser.tabs as any).executeScript) {
            await (browser.tabs as any).executeScript(activeTab.id, {
              file: 'content-scripts/content.js',
            });
          }
          await new Promise((resolve) => setTimeout(resolve, 150));
          res = await browser.tabs.sendMessage(activeTab.id, { type: commandType });
        } catch (injectErr) {
          throw initialErr;
        }
      }

      if (res && res.ok) {
        return res.payload;
      }
      if (res && res.ok === false) {
        return {
          success: false,
          error: {
            code: MessageErrorCode.UNKNOWN_ERROR,
            message: res.error || errorMessages.executionFailed,
          },
        };
      }
      return res || { success: true };
    } catch (err: any) {
      logger.error(`Failed to communicate with content script for ${commandType}`, err);
      return {
        success: false,
        error: {
          code: MessageErrorCode.CONTENT_SCRIPT_UNAVAILABLE,
          message: errorMessages.scriptUnavailable,
          details: err?.message,
        },
      };
    }
  }

  // ── TRANSLATE_ACTIVE_TAB ───────────────────────────────────────
  messageRouter.registerHandler('TRANSLATE_ACTIVE_TAB', async () => {
    return relayCommandToActiveTab('EXECUTE_PAGE_TRANSLATION', {
      tabNotFound: '找不到作用中的分頁 (Active tab not found)',
      scriptUnavailable: '無法在目前的頁面上執行翻譯（Content Script 未回應）',
      executionFailed: '翻譯執行失敗',
    });
  });

  // ── RESTORE_ACTIVE_TAB ─────────────────────────────────────────
  messageRouter.registerHandler('RESTORE_ACTIVE_TAB', async () => {
    return relayCommandToActiveTab('RESTORE_PAGE_TRANSLATION', {
      tabNotFound: '找不到作用中的分頁 (Active tab not found)',
      scriptUnavailable: '無法在目前的頁面上執行還原（Content Script 未回應）',
      executionFailed: '還原執行失敗',
    });
  });

  // ── VOCABULARY & DIAGNOSTICS ───────────────────────────────────
  const vocabRepo = new VocabularyRepository();

  messageRouter.registerHandler('SAVE_VOCAB_ITEM', async (msg) => {
    try {
      const id = `${msg.word}-${Date.now()}`;
      await vocabRepo.add({
        id,
        word: msg.word,
        translation: msg.translation,
        context: msg.context || '',
        url: msg.url,
      });
      return { success: true };
    } catch (err: any) {
      logger.error('Failed to save vocab item', err);
      throw err;
    }
  });

  messageRouter.registerHandler('GET_VOCAB_ITEMS', async () => {
    return await vocabRepo.getAll();
  });

  messageRouter.registerHandler('DELETE_VOCAB_ITEM', async (msg) => {
    await vocabRepo.delete(msg.id);
    return true;
  });

  messageRouter.registerHandler('CLEAR_VOCAB_ITEMS', async () => {
    await vocabRepo.clear();
    return true;
  });

  // Start listening
  messageRouter.listen();

  // ── Context Menu Registration (idempotent) ─────────────────────
  browser.runtime.onInstalled.addListener(async (details) => {
    logger.info('Extension installed/updated', { reason: details.reason });

    // removeAll first to ensure idempotent re-registration on update/restart
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: 'owt-translate-page',
      title: '翻譯整頁內容',
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    });
  });

  // ── Context Menu Click Handler ─────────────────────────────────
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'owt-translate-page') return;
    if (!tab?.id) {
      logger.warn('Context menu clicked but no tab.id available');
      return;
    }

    try {
      // Use callback tab.id — NOT active tab query
      await browser.tabs.sendMessage(tab.id, { type: 'EXECUTE_PAGE_TRANSLATION' });
    } catch (err: any) {
      logger.warn('Content script unavailable for context menu translation', {
        tabId: tab.id,
        error: err?.message,
      });
    }
  });
});

/**
 * Background Service Worker
 *
 * Registers message handlers, routes translation requests with cache-first logic
 * to active provider (MockProvider or GeminiProvider), and relays tab translation/restore
 * commands to content scripts via browser.tabs.sendMessage.
 */
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { translationPipeline } from '@/core/pipeline/translation-pipeline';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { CacheRepository } from '@/infrastructure/storage/repositories/cache-repository';
import { VocabularyRepository } from '@/infrastructure/storage/repositories/vocabulary-repository';
import { MessageErrorCode } from '@/core/contracts/messages';
import { createLogger } from '@/shared/logger';

const logger = createLogger('Background');

export default defineBackground(() => {
  logger.info('Service worker starting', { id: browser.runtime.id });

  const cacheRepo = new CacheRepository();

  // Purge expired cache entries on service worker launch
  cacheRepo.purgeExpired().catch(() => {});

  // Fold legacy sync-area Netflix config into the single settings store
  SettingsStorage.migrateLegacyKeys().catch(() => {});

  // ── TRANSLATE_REQUEST ──────────────────────────────────────────
  messageRouter.registerHandler('TRANSLATE_REQUEST', async (msg) => {
    return translationPipeline.translate(msg);
  });

  // ── GET_SETTINGS ───────────────────────────────────────────────
  messageRouter.registerHandler('GET_SETTINGS', async () => {
    return await SettingsStorage.get();
  });

  // ── UPDATE_SETTINGS ────────────────────────────────────────────
  messageRouter.registerHandler('UPDATE_SETTINGS', async (msg) => {
    await SettingsStorage.set(msg.settings);
    return true;
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

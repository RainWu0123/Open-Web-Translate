/**
 * Background Service Worker
 *
 * Registers message handlers, routes translation requests with cache-first logic
 * to active provider (MockProvider or GeminiProvider), and relays tab translation/restore
 * commands to content scripts via browser.tabs.sendMessage.
 */
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { extensionBridge } from '@/infrastructure/messaging/extension-bridge';
import { translationPipeline } from '@/core/pipeline/translation-pipeline';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { CacheRepository } from '@/infrastructure/storage/repositories/cache-repository';
import { VocabularyRepository } from '@/infrastructure/storage/repositories/vocabulary-repository';
import { learningRepository } from '@/infrastructure/storage/repositories/learning-repository';
import { aiLearningEngine } from '@/core/pipeline/ai-learning-engine';
import { MessageErrorCode } from '@/core/contracts/messages';
import { createLogger } from '@/shared/logger';
import { inspectHttpEndpoint } from '@/infrastructure/providers/endpoint-security';
import { translate } from '@/shared/i18n';

const logger = createLogger('Background');

export default defineBackground(() => {
  logger.info('Service worker starting', { id: browser.runtime.id });

  const cacheRepo = new CacheRepository();

  // Purge expired cache entries on service worker launch
  cacheRepo.purgeExpired().catch(() => {});

  // Fold legacy sync-area Netflix config into the single settings store
  SettingsStorage.migrateLegacyKeys().catch(() => {});

  // PR #7 temporarily made the historical Custom HTTP slot local-only. If a
  // user already had a remote endpoint stored there, move it into the restored
  // Custom HTTP provider instead of silently breaking that configuration.
  void (async () => {
    try {
      const settings = await SettingsStorage.getInternal();
      const legacyEndpoint = settings.localHttpEndpoint?.trim();
      if (!legacyEndpoint || settings.customHttpEndpoint?.trim()) return;

      const inspection = inspectHttpEndpoint(legacyEndpoint);
      if (!inspection.isValid || inspection.isLocal) return;

      await SettingsStorage.set({
        customHttpEndpoint: legacyEndpoint,
        customHttpModel: settings.localHttpModel || 'default',
        localHttpEndpoint: 'http://127.0.0.1:8080',
        localHttpModel: 'local-model',
        ...(settings.activeProviderId === 'local-http-provider'
          ? { activeProviderId: 'custom-http-provider' }
          : {}),
      });

      if (settings.localHttpApiKey?.trim()) {
        await SettingsStorage.saveCustomHttpApiKey(settings.localHttpApiKey);
        await SettingsStorage.clearLocalHttpApiKey();
      }

      logger.info('Migrated legacy remote HTTP configuration to Custom HTTP provider');
    } catch (error) {
      logger.warn('Failed to migrate legacy remote HTTP configuration', error);
    }
  })();

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

  // ── SET_API_KEY ────────────────────────────────────────────────
  messageRouter.registerHandler('SET_API_KEY', async (msg) => {
    if (msg.provider === 'gemini') {
      await SettingsStorage.saveGeminiApiKey(msg.apiKey);
    } else if (msg.provider === 'deepl') {
      await SettingsStorage.saveDeeplApiKey(msg.apiKey);
    } else if (msg.provider === 'local-http') {
      await SettingsStorage.saveLocalHttpApiKey(msg.apiKey);
    } else if (msg.provider === 'custom-http') {
      await SettingsStorage.saveCustomHttpApiKey(msg.apiKey);
    } else if (msg.provider === 'openrouter') {
      await SettingsStorage.saveOpenRouterApiKey(msg.apiKey);
    } else if (msg.provider === 'nvidia-nim') {
      await SettingsStorage.saveNvidiaNimApiKey(msg.apiKey);
    }
    return true;
  });

  // ── CLEAR_API_KEY ──────────────────────────────────────────────
  messageRouter.registerHandler('CLEAR_API_KEY', async (msg) => {
    if (msg.provider === 'gemini') {
      await SettingsStorage.clearGeminiApiKey();
    } else if (msg.provider === 'deepl') {
      await SettingsStorage.clearDeeplApiKey();
    } else if (msg.provider === 'local-http') {
      await SettingsStorage.clearLocalHttpApiKey();
    } else if (msg.provider === 'custom-http') {
      await SettingsStorage.clearCustomHttpApiKey();
    } else if (msg.provider === 'openrouter') {
      await SettingsStorage.clearOpenRouterApiKey();
    } else if (msg.provider === 'nvidia-nim') {
      await SettingsStorage.clearNvidiaNimApiKey();
    }
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
        res = await extensionBridge.sendTabCommand(activeTab.id, { type: commandType }, { injectIfNeeded: true });
      } catch (initialErr) {
        logger.info('Content script missing or detached in tab', activeTab.id);
        throw initialErr;
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

  // ── LEARNING & VOCABULARY WORKBENCH ───────────────────────────
  messageRouter.registerHandler('SAVE_VOCAB_ITEM', async (msg) => {
    try {
      await learningRepository.add({
        word: msg.word,
        meaning: msg.meaning || msg.translation || '',
        lemma: msg.lemma,
        pos: msg.pos,
        phonetic: msg.phonetic,
        contextSentence: msg.contextSentence || msg.context,
        contextTranslation: msg.contextTranslation,
        sourceUrl: msg.sourceUrl || msg.url,
        mediaTimestampMs: msg.mediaTimestampMs,
        mediaTitle: msg.mediaTitle,
        sourceLang: msg.sourceLang,
        targetLang: msg.targetLang,
        tags: msg.tags,
      });
      return { success: true };
    } catch (err: any) {
      logger.error('Failed to save vocab item', err);
      throw err;
    }
  });

  messageRouter.registerHandler('GET_VOCAB_ITEMS', async () => {
    return await learningRepository.getAll();
  });

  messageRouter.registerHandler('DELETE_VOCAB_ITEM', async (msg) => {
    await learningRepository.delete(msg.id);
    return true;
  });

  messageRouter.registerHandler('CLEAR_VOCAB_ITEMS', async () => {
    await learningRepository.clear();
    return true;
  });

  messageRouter.registerHandler('ANALYZE_WORD', async (msg) => {
    return await aiLearningEngine.analyzeWord(msg);
  });

  messageRouter.registerHandler('EXPLAIN_GRAMMAR', async (msg) => {
    return await aiLearningEngine.explainGrammar(msg);
  });

  messageRouter.registerHandler('RECORD_SRS_REVIEW', async (msg) => {
    return await learningRepository.recordReview(msg.id, msg.grade);
  });

  messageRouter.registerHandler('GET_DUE_CARDS', async () => {
    return await learningRepository.getDueCards();
  });

  // Start listening
  messageRouter.listen();

  // ── Context Menu Registration (idempotent) ─────────────────────
  async function registerContextMenus(): Promise<void> {
    try {
      // removeAll first to ensure idempotent re-registration on update,
      // restart, service-worker revival, and UI-language changes.
      await browser.contextMenus.removeAll();
      const settings = await SettingsStorage.get();
      browser.contextMenus.create({
        id: 'owt-translate-page',
        title: translate(settings.uiLanguage, 'context.translatePage'),
        contexts: ['page'],
        documentUrlPatterns: ['http://*/*', 'https://*/*'],
      });
      browser.contextMenus.create({
        id: 'owt-translate-selection',
        title: translate(settings.uiLanguage, 'context.translateSelection'),
        contexts: ['selection'],
        documentUrlPatterns: ['http://*/*', 'https://*/*'],
      });
    } catch (err) {
      logger.warn('Failed to register context menus', err);
    }
  }

  browser.runtime.onInstalled.addListener(async (details) => {
    logger.info('Extension installed/updated', { reason: details.reason });
    await registerContextMenus();

    if (details.reason === 'install') {
      // New users see the privacy/provider disclosure before a remote provider
      // is allowed to transmit translation text. Existing upgrades are not
      // retroactively blocked.
      await SettingsStorage.set({ remoteProviderDisclosureVersion: 0 });
      try {
        await browser.runtime.openOptionsPage();
      } catch (error) {
        logger.warn('Could not open first-run settings page', error);
      }
    }
  });

  // Service workers can be revived without onInstalled firing; make sure
  // the menus exist in every session.
  void registerContextMenus();

  SettingsStorage.watch((settings) => {
    if (settings.uiLanguage) void registerContextMenus();
  });

  // ── Context Menu Click Handler ─────────────────────────────────
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'owt-translate-page' && info.menuItemId !== 'owt-translate-selection') return;
    if (!tab?.id) {
      logger.warn('Context menu clicked but no tab.id available');
      return;
    }

    const messageType =
      info.menuItemId === 'owt-translate-page' ? 'EXECUTE_PAGE_TRANSLATION' : 'EXECUTE_SELECTION_TRANSLATION';

    try {
      // Use callback tab.id — NOT active tab query
      await browser.tabs.sendMessage(tab.id, { type: messageType });
    } catch (err: any) {
      logger.warn('Content script unavailable for context menu translation', {
        tabId: tab.id,
        error: err?.message,
      });
    }
  });
});

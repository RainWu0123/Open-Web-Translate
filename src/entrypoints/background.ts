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
    return await SettingsStorage.getSettings();
  });

  // ── TRANSLATE_ACTIVE_TAB ───────────────────────────────────────
  messageRouter.registerHandler('TRANSLATE_ACTIVE_TAB', async () => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (!activeTab || typeof activeTab.id !== 'number') {
        return {
          success: false,
          error: {
            code: MessageErrorCode.ACTIVE_TAB_NOT_FOUND,
            message: '找不到作用中的分頁 (Active tab not found)',
          },
        };
      }

      let res: any;
      try {
        res = await browser.tabs.sendMessage(activeTab.id, {
          type: 'EXECUTE_PAGE_TRANSLATION',
        });
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
          res = await browser.tabs.sendMessage(activeTab.id, {
            type: 'EXECUTE_PAGE_TRANSLATION',
          });
        } catch (injectErr) {
          throw initialErr;
        }
      }

      if (res && res.ok) {
        return res.payload;
      }
      if (res && res.ok === false) {
        return {
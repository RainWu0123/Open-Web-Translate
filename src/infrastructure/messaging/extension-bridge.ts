/**
 * Extension Bridge — Unified abstraction for WXT browser APIs.
 *
 * Prevents Vue components and feature modules from directly referencing
 * `browser.tabs`, `browser.storage`, or `browser.runtime`.
 */

import { browser } from 'wxt/browser';
import { createLogger } from '@/shared/logger';

const logger = createLogger('ExtensionBridge');

export interface ExtensionBridge {
  queryActiveTabId(): Promise<number | null>;
  queryActiveTabUrl(): Promise<string | null>;
  sendTabMessage<T = any>(tabId: number, message: any): Promise<T | null>;
  sendTabCommand<T = any>(
    tabId: number,
    message: any,
    opts?: { injectIfNeeded?: boolean },
  ): Promise<T | null>;
  getSyncStorage<T = any>(key: string): Promise<T | null>;
  setSyncStorage<T = any>(key: string, value: T): Promise<void>;
  getLocalStorage<T = any>(key: string): Promise<T | null>;
  setLocalStorage<T = any>(key: string, value: T): Promise<void>;
  openOptionsPage(): Promise<void>;
}

class ExtensionBridgeImpl implements ExtensionBridge {
  async queryActiveTabId(): Promise<number | null> {
    try {
      if (typeof browser === 'undefined' || !browser?.tabs?.query) return null;
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      return tabs[0]?.id ?? null;
    } catch (err) {
      logger.debug('Failed to query active tab', err);
      return null;
    }
  }

  async queryActiveTabUrl(): Promise<string | null> {
    try {
      if (typeof browser === 'undefined' || !browser?.tabs?.query) return null;
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      return tabs[0]?.url ?? null;
    } catch (err) {
      logger.debug('Failed to query active tab URL', err);
      return null;
    }
  }

  async sendTabMessage<T = any>(tabId: number, message: any): Promise<T | null> {
    try {
      if (typeof browser === 'undefined' || !browser?.tabs?.sendMessage) return null;
      const res = await browser.tabs.sendMessage(tabId, message);
      return res as T;
    } catch (err) {
      logger.debug(`Failed to send tab message to tab ${tabId}`, err);
      return null;
    }
  }

  /**
   * Send a command to a tab's content script with optional on-the-fly
   * injection + retry — the single tab-command transport. Replaces the
   * blind 150ms sleep: a failed send either injects and retries, or
   * reports failure.
   */
  async sendTabCommand<T = any>(
    tabId: number,
    message: any,
    opts: { injectIfNeeded?: boolean } = {},
  ): Promise<T | null> {
    const send = () => this.sendTabMessage<T>(tabId, message);

    let firstError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await send();
        if (res !== null) return res;
        return res; // content script answered (possibly undefined payload)
      } catch (err) {
        firstError = firstError ?? err;
        if (attempt === 0 && opts.injectIfNeeded) {
          try {
            if (browser.scripting) {
              await browser.scripting.executeScript({
                target: { tabId },
                files: ['/content-scripts/content.js'],
              });
            } else if ((browser.tabs as any).executeScript) {
              await (browser.tabs as any).executeScript(tabId, {
                file: 'content-scripts/content.js',
              });
            } else {
              break;
            }
            continue; // retry right after injection
          } catch (injectErr) {
            logger.debug(`Tab command injection failed for tab ${tabId}`, injectErr);
            throw firstError;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    throw firstError ?? new Error('content script unavailable');
  }

  async getSyncStorage<T = any>(key: string): Promise<T | null> {
    try {
      if (typeof browser === 'undefined' || !browser?.storage?.sync) return null;
      const res = await browser.storage.sync.get(key);
      return (res?.[key] as T) ?? null;
    } catch (err) {
      logger.debug(`Failed to get sync storage key ${key}`, err);
      return null;
    }
  }

  async setSyncStorage<T = any>(key: string, value: T): Promise<void> {
    try {
      if (typeof browser === 'undefined' || !browser?.storage?.sync) return;
      await browser.storage.sync.set({ [key]: value });
    } catch (err) {
      logger.debug(`Failed to set sync storage key ${key}`, err);
    }
  }

  async getLocalStorage<T = any>(key: string): Promise<T | null> {
    try {
      if (typeof browser === 'undefined' || !browser?.storage?.local) return null;
      const res = await browser.storage.local.get(key);
      return (res?.[key] as T) ?? null;
    } catch (err) {
      logger.debug(`Failed to get local storage key ${key}`, err);
      return null;
    }
  }

  async setLocalStorage<T = any>(key: string, value: T): Promise<void> {
    try {
      if (typeof browser === 'undefined' || !browser?.storage?.local) return;
      await browser.storage.local.set({ [key]: value });
    } catch (err) {
      logger.debug(`Failed to set local storage key ${key}`, err);
    }
  }

  async openOptionsPage(): Promise<void> {
    try {
      if (typeof browser === 'undefined' || !browser?.runtime) return;
      // Open the options page as a full browser tab directly. Firefox embeds
      // options_ui inside about:addons when reached via openOptionsPage in
      // some flows; a direct tabs.create always yields the full page.
      const url = browser.runtime.getURL('/options.html');
      if (browser.tabs?.create) {
        await browser.tabs.create({ url });
      } else if ((browser.runtime as any).openOptionsPage) {
        await (browser.runtime as any).openOptionsPage();
      } else {
        window.open(url);
      }
    } catch (err) {
      logger.debug('Failed to open options page', err);
    }
  }
}

export const extensionBridge: ExtensionBridge = new ExtensionBridgeImpl();

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
  sendTabMessage<T = any>(tabId: number, message: any): Promise<T | null>;
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
      if (browser.runtime.openOptionsPage) {
        await browser.runtime.openOptionsPage();
      }
    } catch (err) {
      logger.debug('Failed to open options page', err);
    }
  }
}

export const extensionBridge: ExtensionBridge = new ExtensionBridgeImpl();

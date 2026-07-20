/**
 * Message Router — typed messaging between content scripts and background.
 *
 * Uses WXT's unified `browser` API.
 * Compatible with both Chrome (MV3) and Firefox (Promise-based onMessage).
 */

import { browser } from 'wxt/browser';
import type {
  BackgroundMessage,
  ResponseMap,
} from '@/core/contracts/messages';
import { createLogger } from '@/shared/logger';

const logger = createLogger('MessageRouter');

type Handler<T extends BackgroundMessage['type']> = (
  message: Extract<BackgroundMessage, { type: T }>,
) => Promise<ResponseMap[T]>;

class MessageRouterImpl {
  private handlers = new Map<string, Handler<any>>();

  /**
   * Register a handler for a specific message type (called in background).
   */
  registerHandler<T extends BackgroundMessage['type']>(
    type: T,
    handler: Handler<T>,
  ): void {
    this.handlers.set(type, handler as Handler<any>);
  }

  /**
   * Start listening for incoming messages (called once in background).
   */
  listen(): void {
    browser.runtime.onMessage.addListener((raw: unknown, _sender: unknown, sendResponse: (res: any) => void) => {
      const message = raw as BackgroundMessage;
      if (!message || typeof message.type !== 'string') return;

      const handler = this.handlers.get(message.type);
      if (!handler) return;

      handler(message)
        .then((payload) => sendResponse({ ok: true, payload }))
        .catch((err: Error) => {
          logger.error(`Error in message handler [${message.type}]`, err);
          sendResponse({ ok: false, error: err.message });
        });

      return true; // Synchronously return true to keep message port open in Chrome & Firefox
    });
  }

  /**
   * Send a typed message from content/popup/options → background.
   */
  async sendMessage<T extends BackgroundMessage['type']>(
    message: Extract<BackgroundMessage, { type: T }>,
  ): Promise<ResponseMap[T]> {
    try {
      const raw: any = await browser.runtime.sendMessage(message);
      if (raw && raw.ok) return raw.payload as ResponseMap[T];
      throw new Error(raw?.error ?? 'Unknown messaging error');
    } catch (err: any) {
      logger.error(`Failed to send message [${message.type}]`, err);
      throw err;
    }
  }
}

export const messageRouter = new MessageRouterImpl();

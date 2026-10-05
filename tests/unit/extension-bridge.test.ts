import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMessage = vi.fn();
const executeScript = vi.fn();

vi.mock('wxt/browser', () => ({
  browser: {
    tabs: {
      sendMessage,
      query: vi.fn(),
      create: vi.fn(),
    },
    scripting: {
      executeScript,
    },
    storage: {
      local: { get: vi.fn(), set: vi.fn() },
      sync: { get: vi.fn(), set: vi.fn() },
    },
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    },
  },
}));

import { extensionBridge } from '@/infrastructure/messaging/extension-bridge';

describe('ExtensionBridge tab command recovery', () => {
  beforeEach(() => {
    sendMessage.mockReset();
    executeScript.mockReset();
  });

  it('keeps best-effort sendTabMessage behavior for optional callers', async () => {
    sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist'));

    await expect(
      extensionBridge.sendTabMessage(42, { type: 'PING' }),
    ).resolves.toBeNull();
  });

  it('injects the content script and retries when the first strict send fails', async () => {
    sendMessage
      .mockRejectedValueOnce(new Error('Receiving end does not exist'))
      .mockResolvedValueOnce({ success: true });
    executeScript.mockResolvedValueOnce([]);

    const result = await extensionBridge.sendTabCommand(
      42,
      { type: 'EXECUTE_PAGE_TRANSLATION' },
      { injectIfNeeded: true },
    );

    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ['/content-scripts/content.js'],
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ success: true });
  });
});

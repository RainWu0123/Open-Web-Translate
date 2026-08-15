import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '@/shared/constants';

let registeredListener: ((changes: any) => void) | null = null;

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        onChanged: {
          addListener: vi.fn((fn) => {
            registeredListener = fn;
          }),
        },
      },
    },
  },
}));

describe('SettingsStorage.onChange Seam Unit Tests', () => {
  beforeEach(() => {
    registeredListener = null;
    vi.clearAllMocks();
  });

  it('subscribes to storage changes and invokes callback with decorated settings', () => {
    const callback = vi.fn();
    SettingsStorage.onChange(callback);

    expect(registeredListener).not.toBeNull();

    // Trigger storage change
    if (registeredListener) {
      registeredListener({
        [STORAGE_KEYS.SETTINGS]: {
          newValue: {
            ...DEFAULT_SETTINGS,
            targetLanguage: 'ja',
            geminiApiKey: 'test-api-key-12345',
          },
        },
      });
    }

    expect(callback).toHaveBeenCalledTimes(1);
    const updated = callback.mock.calls[0][0];
    expect(updated.targetLanguage).toBe('ja');
    expect(updated.hasGeminiApiKey).toBe(true);
    expect(updated.geminiApiKeyMasked).toBe('test••••••••2345');
  });
});

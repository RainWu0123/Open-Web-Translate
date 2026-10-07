import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/shared/constants';

const state = vi.hoisted(() => ({
  store: {} as Record<string, any>,
  listeners: [] as Array<(changes: Record<string, any>) => void>,
}));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: state.store[key] })),
        set: vi.fn(async (obj: Record<string, any>) => {
          Object.assign(state.store, obj);
        }),
        onChanged: {
          addListener: vi.fn((fn: (changes: Record<string, any>) => void) => state.listeners.push(fn)),
          removeListener: vi.fn(),
        },
      },
      sync: {
        get: vi.fn(async () => ({})),
        remove: vi.fn(async () => undefined),
      },
    },
  },
}));

import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';

describe('SettingsStorage secret boundary', () => {
  beforeEach(() => {
    state.store = {
      [STORAGE_KEYS.SETTINGS]: {
        sourceLanguage: 'auto',
        targetLanguage: 'zh-Hant',
        enabled: true,
        defaultTranslationMode: 'fast',
        activeProviderId: 'gemini-provider',
        geminiApiKey: 'gem-secret-123456789',
        deeplApiKey: 'deepl-secret-123456789',
        localHttpApiKey: 'local-secret-123456789',
        customHttpApiKey: 'custom-secret-123456789',
        openRouterApiKey: 'or-secret-123456789',
        nvidiaNimApiKey: 'nv-secret-123456789',
      },
    };
    state.listeners.length = 0;
    vi.clearAllMocks();
  });

  it('never exposes raw API keys through the public settings view', async () => {
    const settings = await SettingsStorage.get();

    expect('geminiApiKey' in settings).toBe(false);
    expect('deeplApiKey' in settings).toBe(false);
    expect('localHttpApiKey' in settings).toBe(false);
    expect('customHttpApiKey' in settings).toBe(false);
    expect('openRouterApiKey' in settings).toBe(false);
    expect('nvidiaNimApiKey' in settings).toBe(false);
    expect(settings.hasGeminiApiKey).toBe(true);
    expect(settings.hasDeeplApiKey).toBe(true);
    expect(settings.hasLocalHttpApiKey).toBe(true);
    expect(settings.hasCustomHttpApiKey).toBe(true);
    expect(settings.hasOpenRouterApiKey).toBe(true);
    expect(settings.hasNvidiaNimApiKey).toBe(true);
    expect(settings.geminiApiKeyMasked).not.toContain('gem-secret-123456789');
  });

  it('keeps raw credentials available only through the internal settings view', async () => {
    const settings = await SettingsStorage.getInternal();

    expect(settings.geminiApiKey).toBe('gem-secret-123456789');
    expect(settings.deeplApiKey).toBe('deepl-secret-123456789');
    expect(settings.localHttpApiKey).toBe('local-secret-123456789');
    expect(settings.customHttpApiKey).toBe('custom-secret-123456789');
    expect(settings.openRouterApiKey).toBe('or-secret-123456789');
    expect(settings.nvidiaNimApiKey).toBe('nv-secret-123456789');
  });

  it('preserves existing secrets when public settings are updated', async () => {
    await SettingsStorage.set({ targetLanguage: 'ja' });

    const raw = state.store[STORAGE_KEYS.SETTINGS];
    expect(raw.targetLanguage).toBe('ja');
    expect(raw.geminiApiKey).toBe('gem-secret-123456789');
    expect(raw.deeplApiKey).toBe('deepl-secret-123456789');
    expect(raw.localHttpApiKey).toBe('local-secret-123456789');
    expect(raw.customHttpApiKey).toBe('custom-secret-123456789');
    expect(raw.openRouterApiKey).toBe('or-secret-123456789');
    expect(raw.nvidiaNimApiKey).toBe('nv-secret-123456789');
  });

  it('drops secret and derived fields from untyped public patches', async () => {
    await SettingsStorage.set({
      targetLanguage: 'ko',
      geminiApiKey: 'attacker-value',
      hasGeminiApiKey: false,
      geminiApiKeyMasked: 'fake-mask',
    } as any);

    const raw = state.store[STORAGE_KEYS.SETTINGS];
    expect(raw.targetLanguage).toBe('ko');
    expect(raw.geminiApiKey).toBe('gem-secret-123456789');
    expect(raw.hasGeminiApiKey).toBeUndefined();
    expect(raw.geminiApiKeyMasked).toBeUndefined();
  });
});

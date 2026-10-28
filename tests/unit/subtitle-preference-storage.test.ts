import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { storage: { local: {
  get: storage.get, set: storage.set, onChanged: { addListener: storage.addListener, removeListener: storage.removeListener },
} } } }));
import { SUBTITLE_PREFERENCE_KEY, SubtitlePreferenceStorage } from '@/infrastructure/storage/extension-storage/subtitle-preference-storage';

describe('subtitle preference storage', () => {
  beforeEach(() => { vi.clearAllMocks(); storage.get.mockResolvedValue({}); storage.set.mockResolvedValue(undefined); });

  it('defaults invalid or missing values to native and stores only a separate preference key', async () => {
    expect(await SubtitlePreferenceStorage.get()).toEqual({ mode: 'native' });
    storage.get.mockResolvedValue({ [SUBTITLE_PREFERENCE_KEY]: { mode: 'unexpected' } });
    expect(await SubtitlePreferenceStorage.get()).toEqual({ mode: 'native' });
    await SubtitlePreferenceStorage.set({ mode: 'native', language: 'zh-Hant' });
    expect(storage.set).toHaveBeenCalledWith({ [SUBTITLE_PREFERENCE_KEY]: { mode: 'native', language: 'zh-Hant' } });
  });

  it('does not allow a late initial read to override a newer storage event', async () => {
    let finish!: (result: unknown) => void;
    storage.get.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const callback = vi.fn();
    const stop = SubtitlePreferenceStorage.observe(callback);
    const listener = storage.addListener.mock.calls[0][0];
    listener({ [SUBTITLE_PREFERENCE_KEY]: { newValue: { mode: 'ai' } } });
    finish({ [SUBTITLE_PREFERENCE_KEY]: { mode: 'native' } });
    await Promise.resolve(); await Promise.resolve();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ mode: 'ai' });
    stop();
    expect(storage.removeListener).toHaveBeenCalledWith(listener);
  });
});

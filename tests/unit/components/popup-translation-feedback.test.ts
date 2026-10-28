import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import { getProviderTestFingerprint } from '@/infrastructure/providers/cache-identity';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  watch: vi.fn(() => () => {}),
  watchCallback: undefined as undefined | ((settings: any) => void),
  sendMessage: vi.fn(),
  queryActiveTabUrl: vi.fn(async () => 'https://example.com'),
  queryActiveTabId: vi.fn(async () => 42),
  sendTabCommand: vi.fn(async (_tabId: number, _msg: any): Promise<any> => null),
  sendTabMessage: vi.fn(async (_tabId: number, _msg: any): Promise<any> => null),
  preferenceGet: vi.fn(async () => ({ mode: 'native' as const })),
  preferenceSet: vi.fn(async (_value: any) => {}),
}));
vi.mock('@/infrastructure/storage/extension-storage/settings-storage', () => ({ SettingsStorage: mocks }));
vi.mock('@/infrastructure/storage/extension-storage/subtitle-preference-storage', () => ({ SubtitlePreferenceStorage: {
  get: mocks.preferenceGet, set: mocks.preferenceSet,
  observe: (callback: (value: any) => void) => { void mocks.preferenceGet().then(callback); return () => {}; },
} }));
vi.mock('@/infrastructure/messaging/message-router', () => ({ messageRouter: { sendMessage: mocks.sendMessage } }));
vi.mock('@/infrastructure/messaging/extension-bridge', () => ({ extensionBridge: {
  queryActiveTabUrl: mocks.queryActiveTabUrl,
  queryActiveTabId: mocks.queryActiveTabId,
  sendTabCommand: mocks.sendTabCommand,
  sendTabMessage: mocks.sendTabMessage,
  getLocalStorage: async () => [],
  openOptionsPage: vi.fn(),
} }));
import Popup from '@/entrypoints/popup/App.vue';

beforeEach(() => {
  mocks.get.mockResolvedValue({ ...DEFAULT_SETTINGS, enabled: true, uiLanguage: 'zh-Hant' });
  mocks.set.mockReset().mockResolvedValue(DEFAULT_SETTINGS);
  mocks.sendMessage.mockReset();
  mocks.queryActiveTabUrl.mockReset().mockResolvedValue('https://example.com');
  mocks.queryActiveTabId.mockReset().mockResolvedValue(42);
  mocks.sendTabCommand.mockReset().mockResolvedValue(null);
  mocks.sendTabMessage.mockReset().mockResolvedValue(null);
  mocks.preferenceGet.mockReset().mockResolvedValue({ mode: 'native' });
  mocks.preferenceSet.mockReset().mockResolvedValue(undefined);
  (mocks.watch as any).mockReset().mockImplementation((callback: (settings: any) => void) => {
    mocks.watchCallback = callback;
    return () => {};
  });
  mocks.watchCallback = undefined;
});

describe('Translation feedback follows real request results', () => {
  it('keeps original and translation subtitle selectors separate and restores the prior value on failure', async () => {
    mocks.queryActiveTabUrl.mockResolvedValue('https://www.netflix.com/watch/123');
    const state = { isActive: true, primaryStatus: 'active', secondaryStatus: 'track', modeLabel: '', modeClass: '',
      discoveredTracksCount: 3, selectionMode: 'manual', originalTrackId: 'ja', selectedTrackId: 'zh',
      tracks: [{ id: 'ja', label: '日語', isCC: false }, { id: 'zh', label: '中文（繁體）', isCC: false }, { id: 'en', label: '英語', isCC: false }] };
    mocks.sendTabMessage.mockResolvedValue(state);
    mocks.sendTabCommand.mockImplementation(async (_id, msg) => msg.type === 'SET_NETFLIX_SELECTION' ? false : state);
    const wrapper = mount(Popup); await flushPromises();
    const original = wrapper.get<HTMLSelectElement>('[data-testid="original-subtitle-source-select"]');
    const translation = wrapper.get<HTMLSelectElement>('[data-testid="subtitle-source-select"]');
    expect(original.element.value).toBe('track:ja');
    expect(translation.element.value).toBe('track:zh');
    await original.setValue('track:en'); await flushPromises();
    expect(mocks.sendTabCommand).toHaveBeenCalledWith(42, { type: 'SET_NETFLIX_SELECTION', source: 'track', trackId: 'en', side: 'original' });
    expect(original.element.value).toBe('track:ja');
    expect(translation.element.value).toBe('track:zh');
    expect(wrapper.get('[role="alert"]').text()).toContain('無法載入所選字幕');
    wrapper.unmount();
  });
  it('shows progress until the request completes, then clears completion after restore', async () => {
    let resolve!: (response: { success: boolean; translatedCount: number }) => void;
    mocks.sendMessage.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const wrapper = mount(Popup); await flushPromises();
    const button = wrapper.get('[data-testid="translate-page-btn"]');
    await button.trigger('click');
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'TRANSLATE_ACTIVE_TAB' });
    expect(button.attributes('aria-busy')).toBe('true');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.get('.brand-mark').attributes('data-state')).toBe('translating');
    resolve({ success: true, translatedCount: 3 }); await flushPromises();
    expect(button.attributes('aria-busy')).toBe('false');
    expect(button.get('.brand-mark').attributes('data-state')).toBe('translated');
    mocks.sendMessage.mockResolvedValueOnce({ success: true, restoredCount: 3 });
    await wrapper.get('[data-testid="restore-page-btn"]').trigger('click'); await flushPromises();
    expect(button.get('.brand-mark').attributes('data-state')).toBe('idle');
    wrapper.unmount();
  });
  it('stops progress without showing completion when translation fails', async () => {
    mocks.sendMessage.mockResolvedValueOnce({ success: false, error: { message: '連線失敗' } });
    const wrapper = mount(Popup); await flushPromises();
    const button = wrapper.get('[data-testid="translate-page-btn"]');
    await button.trigger('click'); await flushPromises();
    expect(button.get('.brand-mark').attributes('data-state')).toBe('idle');
    expect(button.attributes('disabled')).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toBe('連線失敗');
    wrapper.unmount();
  });
  it('enables Netflix subtitles through the upper sliding action and shows real prefetch status', async () => {
    mocks.queryActiveTabUrl.mockResolvedValue('https://www.netflix.com/watch/81996836');
    mocks.sendTabCommand.mockImplementation(async (_tabId: number, msg: any): Promise<any> => {
      if (msg.type === 'SET_NETFLIX_ACTIVE') return true;
      if (msg.type === 'GET_NETFLIX_STATE') {
        return {
          isActive: true,
          primaryStatus: 'active',
          secondaryStatus: 'ai',
          modeLabel: 'bilingual',
          modeClass: 'ai-mode',
          discoveredTracksCount: 1,
          selectedTrackId: 'ai-translate',
          selectionMode: 'auto',
          tracks: [{ id: 'ja', label: 'Japanese', isCC: false }],
          secondaryCuesCount: 0,
          learningMode: false,
          dualTrack: false,
          translationMode: 'prefetch',
          prefetchedCount: 40,
        };
      }
      return null;
    });

    const wrapper = mount(Popup);
    await flushPromises();

    expect(wrapper.find('[data-testid="subtitle-quick-settings"]').exists()).toBe(true);
    const toggle = wrapper.get('[data-testid="subtitle-toggle"]');
    await toggle.trigger('click');
    await flushPromises();

    expect(mocks.sendTabCommand).toHaveBeenCalledWith(42, { type: 'SET_NETFLIX_ACTIVE', active: true });
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        netflix: expect.objectContaining({ enabled: true }),
      }),
    );
    expect(toggle.attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[data-testid="netflix-summary"]').text()).toContain('已提前翻譯 40 句字幕');
    expect(wrapper.get('[data-testid="netflix-summary"]').text()).toContain('暫時使用 AI／機翻');
    expect(wrapper.get('[data-testid="subtitle-restore-btn"]').text()).toContain('原始字幕');
    expect(wrapper.find('[data-testid="translate-page-btn"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the translated page selected when restoring fails', async () => {
    mocks.sendMessage.mockResolvedValueOnce({ success: true, translatedCount: 3 });
    const wrapper = mount(Popup); await flushPromises();
    await wrapper.get('[data-testid="translate-page-btn"]').trigger('click'); await flushPromises();
    mocks.sendMessage.mockResolvedValueOnce({ success: false, error: { message: '還原失敗' } });
    await wrapper.get('[data-testid="restore-page-btn"]').trigger('click'); await flushPromises();
    expect(wrapper.get('.action-slider').attributes('data-side')).toBe('left');
    expect(wrapper.get('[data-testid="translate-page-btn"] .brand-mark').attributes('data-state')).toBe('translated');
    expect(wrapper.get('[role="alert"]').text()).toBe('還原失敗');
    wrapper.unmount();
  });

  it('returns the subtitle slider to its previous mode when the command fails', async () => {
    mocks.queryActiveTabUrl.mockResolvedValue('https://www.netflix.com/watch/81996836');
    let rejectCommand!: (error: Error) => void;
    mocks.sendTabCommand.mockImplementation((_tabId: number, msg: any): Promise<any> => {
      if (msg.type === 'SET_NETFLIX_ACTIVE') return new Promise((_resolve, reject) => { rejectCommand = reject; });
      return Promise.resolve(null);
    });
    const wrapper = mount(Popup); await flushPromises();
    await wrapper.get('[data-testid="subtitle-toggle"]').trigger('click'); await flushPromises();
    expect(wrapper.get('.action-slider').attributes('data-side')).toBe('left');
    expect(wrapper.get('[data-testid="subtitle-toggle"]').attributes('aria-busy')).toBe('true');
    expect(wrapper.get('[data-testid="subtitle-restore-btn"]').attributes('disabled')).toBeDefined();
    rejectCommand(new Error('Disconnected')); await flushPromises();
    expect(wrapper.get('.action-slider').attributes('data-side')).toBe('right');
    expect(wrapper.get('[data-testid="subtitle-toggle"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('[role="alert"]').text()).toContain('無法');
    wrapper.unmount();
  });

  it('makes the upper translate action usable when the webpage engine was disabled', async () => {
    mocks.get.mockResolvedValue({ ...DEFAULT_SETTINGS, enabled: false, uiLanguage: 'zh-Hant' });
    mocks.sendMessage.mockResolvedValueOnce({ success: true, translatedCount: 3 });
    const wrapper = mount(Popup); await flushPromises();
    const button = wrapper.get('[data-testid="translate-page-btn"]');
    expect(button.attributes('disabled')).toBeUndefined();
    await button.trigger('click'); await flushPromises();
    expect(mocks.set).toHaveBeenCalledWith({ enabled: true });
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: 'TRANSLATE_ACTIVE_TAB' });
    wrapper.unmount();
  });

  it('switches YouTube back to original captions without sending a webpage restore request', async () => {
    mocks.queryActiveTabUrl.mockResolvedValue('https://www.youtube.com/watch?v=sample');
    let active = true;
    mocks.sendTabCommand.mockImplementation(async (_tabId: number, msg: any): Promise<any> => {
      if (msg.type === 'SET_YOUTUBE_ACTIVE') { active = msg.active; return true; }
      if (msg.type === 'GET_YOUTUBE_STATE') return { isActive: active, tracks: [] };
      return null;
    });
    const wrapper = mount(Popup); await flushPromises();
    expect(wrapper.get('[data-testid="subtitle-toggle"]').text()).toBe('雙語字幕');
    await wrapper.get('[data-testid="subtitle-restore-btn"]').trigger('click'); await flushPromises();
    expect(mocks.sendTabCommand).toHaveBeenCalledWith(42, { type: 'SET_YOUTUBE_ACTIVE', active: false });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(wrapper.get('.action-slider').attributes('data-side')).toBe('right');
    expect(wrapper.get('[data-testid="subtitle-restore-btn"]').attributes('aria-pressed')).toBe('true');
    wrapper.unmount();
  });

  it('offers independent YouTube subtitle tracks and restores the previous selection on failure', async () => {
    mocks.queryActiveTabUrl.mockResolvedValue('https://www.youtube.com/watch?v=sample');
    const state = { isActive: true, originalSourceId: 'ja', translationSourceId: 'en', tracks: [
      { id: 'ja', languageCode: 'ja', label: '日本語' },
      { id: 'en', languageCode: 'en', label: 'English' },
      { id: 'en-asr', languageCode: 'en', label: 'English', kind: 'asr' },
    ] };
    mocks.sendTabCommand.mockImplementation(async (_tabId: number, msg: any): Promise<any> => {
      if (msg.type === 'GET_YOUTUBE_STATE') return state;
      if (msg.type === 'SET_YOUTUBE_SOURCES') return false;
      return null;
    });
    const wrapper = mount(Popup); await flushPromises();
    const original = wrapper.get('[data-testid="youtube-track-select"]');
    const translation = wrapper.get('[data-testid="youtube-translation-source-select"]');
    expect((original.element as HTMLSelectElement).value).toBe('ja');
    expect((translation.element as HTMLSelectElement).value).toBe('en');
    await translation.setValue('en-asr'); await flushPromises();
    expect(mocks.sendTabCommand).toHaveBeenCalledWith(42, { type: 'SET_YOUTUBE_SOURCES', side: 'translation', value: 'en-asr' });
    expect((translation.element as HTMLSelectElement).value).toBe('en');
    expect(wrapper.get('[role="alert"]').text()).toContain('無法');
    wrapper.unmount();
  });

  it('remembers the chosen YouTube source policy and the native track language', async () => {
    mocks.queryActiveTabUrl.mockResolvedValue('https://www.youtube.com/watch?v=sample');
    const state: { isActive: boolean; originalSourceId: string | null; translationSourceId: string | null; tracks: Array<{ id: string; languageCode: string; label: string }> } = { isActive: true, originalSourceId: null, translationSourceId: null, tracks: [
      { id: 'en', languageCode: 'en', label: 'English' },
    ] };
    mocks.sendTabCommand.mockImplementation(async (_tabId: number, msg: any): Promise<any> => {
      if (msg.type === 'GET_YOUTUBE_STATE') return state;
      if (msg.type === 'SET_YOUTUBE_SOURCES') { state.translationSourceId = msg.value === 'en' ? 'en' : null; return true; }
      return null;
    });
    const wrapper = mount(Popup); await flushPromises();
    const select = wrapper.get('[data-testid="youtube-translation-source-select"]');
    await select.setValue('en'); await flushPromises();
    expect(mocks.preferenceSet).toHaveBeenLastCalledWith({ mode: 'native', language: 'en' });
    await select.setValue('ai'); await flushPromises();
    expect(mocks.preferenceSet).toHaveBeenLastCalledWith({ mode: 'ai' });
    wrapper.unmount();
  });

  it('reports when a subtitle source changes but saving the preference fails', async () => {
    mocks.queryActiveTabUrl.mockResolvedValue('https://www.youtube.com/watch?v=sample');
    mocks.preferenceSet.mockRejectedValueOnce(new Error('storage unavailable'));
    const state = { isActive: true, originalSourceId: null, translationSourceId: null, tracks: [{ id: 'en', languageCode: 'en', label: 'English' }] };
    mocks.sendTabCommand.mockImplementation(async (_tabId: number, msg: any): Promise<any> => msg.type === 'GET_YOUTUBE_STATE' ? state : msg.type === 'SET_YOUTUBE_SOURCES');
    const wrapper = mount(Popup); await flushPromises();
    await wrapper.get('[data-testid="youtube-translation-source-select"]').setValue('ai'); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('無法儲存偏好');
    wrapper.unmount();
  });

  it('binds the green provider status to the complete live endpoint fingerprint', async () => {
    const tested = {
      ...DEFAULT_SETTINGS,
      activeProviderId: 'ollama-provider',
      ollamaEndpoint: 'http://127.0.0.1:11434',
      ollamaModel: 'qwen3:4b',
      providerLastTestedId: 'ollama-provider',
      providerLastTestSucceeded: true,
      providerCredentialRevision: 2,
    };
    tested.providerLastTestFingerprint = getProviderTestFingerprint('ollama-provider', tested);
    mocks.get.mockResolvedValue(tested);

    const wrapper = mount(Popup);
    await flushPromises();
    expect(wrapper.get('.provider-status-dot').classes()).toContain('success');

    mocks.watchCallback?.({ ...tested, ollamaEndpoint: 'http://127.0.0.1:9999' });
    await flushPromises();
    expect(wrapper.get('.provider-status-dot').classes()).not.toContain('success');
    wrapper.unmount();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { DEFAULT_SETTINGS } from '@/shared/constants';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  watch: vi.fn(() => () => {}),
  sendMessage: vi.fn(),
  queryActiveTabUrl: vi.fn(async () => 'https://example.com'),
  queryActiveTabId: vi.fn(async () => 42),
  sendTabCommand: vi.fn(async (_tabId: number, _msg: any): Promise<any> => null),
  sendTabMessage: vi.fn(async (_tabId: number, _msg: any): Promise<any> => null),
}));
vi.mock('@/infrastructure/storage/extension-storage/settings-storage', () => ({ SettingsStorage: mocks }));
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
});

describe('Translation feedback follows real request results', () => {
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
    expect(wrapper.get('[data-testid="netflix-summary"]').text()).toBe('已提前翻譯 40 句字幕');
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
});

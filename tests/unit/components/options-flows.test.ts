import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { DEFAULT_SETTINGS } from '@/shared/constants';

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), watch: vi.fn(() => () => {}), sendMessage: vi.fn() }));
vi.mock('@/infrastructure/storage/extension-storage/settings-storage', () => ({ SettingsStorage: mocks }));
vi.mock('@/infrastructure/messaging/message-router', () => ({ messageRouter: { sendMessage: mocks.sendMessage } }));
import Options from '@/entrypoints/options/App.vue';

beforeEach(() => {
  mocks.get.mockResolvedValue({ ...DEFAULT_SETTINGS, theme: 'light', uiLanguage: 'zh-Hant' });
  mocks.set.mockReset().mockResolvedValue(DEFAULT_SETTINGS);
  mocks.sendMessage.mockReset().mockResolvedValue([]);
  Element.prototype.scrollTo = vi.fn();
  window.scrollTo = vi.fn();
});

describe('Settings controls are connected to storage and services', () => {
  it('saves sentence pause independently from learning mode', async () => {
    const wrapper = mount(Options); await flushPromises();
    await wrapper.get('[data-testid="tab-subtitles"]').trigger('click');
    await wrapper.get('[aria-label="學習模式（單字逐詞點擊）"]').setValue(true); await flushPromises();
    const pause = wrapper.get<HTMLInputElement>('[aria-label="每句字幕結束時暫停"]');
    expect(pause.element.checked).toBe(false);
    await pause.setValue(true); await flushPromises();
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ netflix: expect.objectContaining({ learningMode: true, autoPause: true }) }));
    wrapper.unmount();
  });
  it('loads and persists the theme', async () => {
    const wrapper = mount(Options); await flushPromises();
    expect(document.documentElement.dataset.theme).toBe('light');
    await wrapper.get('[aria-label="介面主題"]').setValue('dark'); await flushPromises();
    expect(mocks.set).toHaveBeenCalledWith({ theme: 'dark' });
    await wrapper.get('button.theme-toggle').trigger('click'); await flushPromises();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(mocks.set).toHaveBeenLastCalledWith({ theme: 'light' });
    mocks.set.mockRejectedValueOnce(new Error('storage unavailable'));
    await wrapper.get('button.theme-toggle').trigger('click'); await flushPromises();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(wrapper.text()).toContain('外觀設定未儲存');
    wrapper.unmount();
  });
  it('contains no demo flashcards or fake diagnostics', async () => {
    const wrapper = mount(Options); await flushPromises();
    await wrapper.get('[data-testid="tab-learning"]').trigger('click');
    expect(wrapper.text()).toContain('還沒有收藏的單字');
    expect(wrapper.text()).not.toContain('儚い');
    await wrapper.get('[data-testid="tab-subtitles"]').trigger('click');
    expect(wrapper.find('#sub-diagnostics').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('圖片字幕自動救援');
    wrapper.unmount();
  });
  it('saves interface language from the full settings page', async () => {
    const wrapper = mount(Options); await flushPromises();
    await wrapper.get('#interface-language').setValue('en'); await flushPromises();
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ uiLanguage: 'en' }));
    expect(wrapper.get('[data-testid="tab-general"]').text()).toBe('Reading');
    expect(document.documentElement.dataset.theme).toBe('light');
    wrapper.unmount();
  });
  it('saves local model configuration and shows only a real test response', async () => {
    const wrapper = mount(Options); await flushPromises();
    await wrapper.get('[data-testid="tab-providers"]').trigger('click');
    await wrapper.get('[aria-label="使用的服務"]').setValue('local-http-provider');
    await wrapper.get('#http-model').setValue('my-model');
    await flushPromises();
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ localHttpModel: 'my-model' }));
    mocks.sendMessage.mockResolvedValueOnce({ segments: [{ id: 'connection-check', translatedText: '你好' }] });
    const testButton = wrapper.findAll('button').find(button => button.text() === '試譯一句')!;
    await testButton.trigger('click'); await flushPromises();
    expect(mocks.sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'TRANSLATE_REQUEST', forceProvider: 'local-http-provider' }));
    expect(wrapper.text()).toContain('收到譯文：你好');
    mocks.sendMessage.mockRejectedValueOnce(new Error('offline'));
    await testButton.trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('試譯失敗：offline');
    expect(wrapper.text()).not.toContain('收到譯文：你好');
    wrapper.unmount();
  });
  it('dismisses remote data notice feedback on tab switch and close button', async () => {
    mocks.get.mockResolvedValue({ ...DEFAULT_SETTINGS, remoteProviderDisclosureVersion: 0, theme: 'light', uiLanguage: 'zh-Hant' });
    const wrapper = mount(Options); await flushPromises();
    const acceptBtn = wrapper.find('button.btn-stitch-accent');
    await acceptBtn.trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('已確認資料傳輸說明');
    const closeBtn = wrapper.find('button.feedback-close-btn');
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click'); await flushPromises();
    expect(wrapper.text()).not.toContain('已確認資料傳輸說明');

    // Also verify switching tab clears any feedback
    await wrapper.get('[data-testid="tab-subtitles"]').trigger('click');
    expect(wrapper.find('.feedback').exists()).toBe(false);
    wrapper.unmount();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import NetflixSubtitleConfigCard from '@/components/NetflixSubtitleConfigCard.vue';
import { browser } from 'wxt/browser';

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      sync: {
        get: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 101, url: 'https://www.netflix.com/watch/12345' }]),
      sendMessage: vi.fn().mockResolvedValue(true),
    },
  },
}));

describe('NetflixSubtitleConfigCard Vue Component Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders slider controls and status badge correctly', async () => {
    const wrapper = mount(NetflixSubtitleConfigCard);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(wrapper.find('[data-testid="netflix-subtitle-config-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="primary-size-slider"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="secondary-size-slider"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="bottom-position-slider"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="line-spacing-slider"]').exists()).toBe(true);
  });

  it('persists slider changes through the single Settings seam (storage.local), with no push message', async () => {
    const wrapper = mount(NetflixSubtitleConfigCard);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const slider = wrapper.find('[data-testid="primary-size-slider"]');
    await slider.setValue(26);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Written once via SettingsStorage.set → storage.local under owt_settings
    expect(browser.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        owt_settings: expect.objectContaining({
          netflix: expect.objectContaining({ primarySize: 26 }),
        }),
      }),
    );

    // The dedicated UPDATE_NETFLIX_CONFIG tab message is gone: the content
    // script picks changes up from the same store via SettingsStorage.watch.
    // (GET_NETFLIX_STATE polls are the HUD status query and still allowed.)
    for (const call of (browser.tabs.sendMessage as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[1]?.type).not.toBe('UPDATE_NETFLIX_CONFIG');
    }
  });
});

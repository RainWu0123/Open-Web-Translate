import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import NetflixSubtitleConfigCard from '@/components/NetflixSubtitleConfigCard.vue';
import { browser } from 'wxt/browser';

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      sync: {
        get: vi.fn().mockResolvedValue({
          owt_netflix_config: {
            enabled: true,
            primarySize: 20,
            secondarySize: 24,
            bottomPosition: 100,
            lineSpacing: 8,
            enableBitmapRescue: true,
            learningMode: false,
          },
        }),
        set: vi.fn().mockResolvedValue(undefined),
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

  it('persists slider changes to browser.storage.sync and sends update message to tab', async () => {
    const wrapper = mount(NetflixSubtitleConfigCard);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const slider = wrapper.find('[data-testid="primary-size-slider"]');
    await slider.setValue(26);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(browser.storage.sync.set).toHaveBeenCalled();
    expect(browser.tabs.sendMessage).toHaveBeenLastCalledWith(
      101,
      expect.objectContaining({
        type: 'UPDATE_NETFLIX_CONFIG',
        payload: expect.objectContaining({ primarySize: 26 }),
      }),
    );
  });
});

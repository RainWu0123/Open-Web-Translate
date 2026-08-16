import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import type { ExtensionSettings } from '@/core/contracts/messages';
import { YouTubeCaptionAdapter } from '../../src/adapters/youtube/youtube-caption-adapter';
import { messageRouter } from '../../src/infrastructure/messaging/message-router';

// Mock messageRouter
vi.mock('../../src/infrastructure/messaging/message-router', () => ({
  messageRouter: {
    sendMessage: vi.fn(),
  },
}));

describe('YouTubeCaptionAdapter', () => {
  let adapter: YouTubeCaptionAdapter;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <div class="html5-video-player">
        <div class="ytp-caption-window-container"></div>
        <div class="ytp-right-controls">
          <button class="ytp-settings-button"></button>
        </div>
      </div>
    `;

    // We need to mock location and some APIs
    Object.defineProperty(window, 'location', {
      value: { hostname: 'www.youtube.com', pathname: '/watch', search: '?v=123' },
      writable: true,
    });

    adapter = new YouTubeCaptionAdapter();
    adapter.init();
    vi.useFakeTimers();
  });

  afterEach(() => {
    adapter.stop();
    vi.clearAllTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('should inject toggle button into .ytp-right-controls', () => {
    // Advance timers so setInterval triggers button injection
    vi.advanceTimersByTime(2500);

    const rightControls = document.querySelector('.ytp-right-controls');
    const toggleBtn = rightControls?.querySelector('.owt-yt-toggle-btn');

    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn?.getAttribute('aria-label')).toBe('OWT 雙語字幕');
  });

  it('clicking toggle button should start adapter without triggering page translation', async () => {
    vi.advanceTimersByTime(2500);
    const toggleBtn = document.querySelector('.owt-yt-toggle-btn') as HTMLButtonElement;

    // Settings now come from the single Settings seam (storage.local), not a
    // background message round-trip.
    vi.spyOn(SettingsStorage, 'get').mockResolvedValue({
      ...(DEFAULT_SETTINGS as ExtensionSettings),
      targetLanguage: 'en',
      displayMode: 'bilingual',
    });

    toggleBtn.click();
    await vi.advanceTimersByTimeAsync(500);

    // Check if adapter started
    expect((adapter as any).isActive).toBe(true);

    const svg = toggleBtn.querySelector('svg');
    expect(svg?.style.fill).toBe('#818cf8');

    // Make sure no full page translation was triggered (which would involve
    // extracting targets and sending a huge request)
    expect(messageRouter.sendMessage).not.toHaveBeenCalled();
  });

  it('clicking toggle button again should stop adapter', async () => {
    vi.advanceTimersByTime(2500);
    const toggleBtn = document.querySelector('.owt-yt-toggle-btn') as HTMLButtonElement;

    vi.mocked(messageRouter.sendMessage).mockResolvedValueOnce({ targetLanguage: 'en', displayMode: 'bilingual' } as any);
    toggleBtn.click();
    await vi.advanceTimersByTimeAsync(500);
    expect((adapter as any).isActive).toBe(true);

    toggleBtn.click();
    await vi.advanceTimersByTimeAsync(500);
    expect((adapter as any).isActive).toBe(false);

    const svg = toggleBtn.querySelector('svg');
    expect(svg?.style.fill).toBe('rgba(255, 255, 255, 0.85)');
  });
});

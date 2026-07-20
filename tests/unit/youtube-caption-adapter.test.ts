import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

    vi.mocked(messageRouter.sendMessage).mockResolvedValue({ targetLanguage: 'en', displayMode: 'bilingual' } as any);
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

  it('clicking toggle button should toggle adapter state without triggering page translation', async () => {
    vi.advanceTimersByTime(2500);
    const toggleBtn = document.querySelector('.owt-yt-toggle-btn') as HTMLButtonElement;

    // Initially auto-started
    expect((adapter as any).isActive).toBe(true);

    toggleBtn.click();
    await vi.advanceTimersByTimeAsync(500);

    // Clicking toggles it off
    expect((adapter as any).isActive).toBe(false);

    const svg = toggleBtn.querySelector('svg');
    expect(svg?.style.fill).toBe('rgba(255, 255, 255, 0.85)');

    // Make sure no full page translation was triggered
    expect(messageRouter.sendMessage).toHaveBeenCalledWith({ type: 'GET_SETTINGS' });
  });

  it('clicking toggle button again should restart adapter', async () => {
    vi.advanceTimersByTime(2500);
    const toggleBtn = document.querySelector('.owt-yt-toggle-btn') as HTMLButtonElement;

    // Toggle off
    toggleBtn.click();
    await vi.advanceTimersByTimeAsync(500);
    expect((adapter as any).isActive).toBe(false);

    // Toggle on again
    toggleBtn.click();
    await vi.advanceTimersByTimeAsync(500);
    expect((adapter as any).isActive).toBe(true);

    const svg = toggleBtn.querySelector('svg');
    expect(svg?.style.fill).toBe('#818cf8');
  });
});

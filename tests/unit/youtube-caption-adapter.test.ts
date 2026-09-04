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

  it('injects no player button — the popup is the command center', () => {
    vi.advanceTimersByTime(2500);
    expect(document.querySelector('.owt-yt-toggle-btn')).toBeNull();
  });

  it('setActive(true) starts without triggering page translation', async () => {
    adapter.setActive(true);
    await vi.advanceTimersByTimeAsync(500);

    expect((adapter as any).isActive).toBe(true);
    expect(adapter.getStateInfo()).toMatchObject({ isActive: true });

    // Subtitle mode must not fire a full page-translation request.
    expect(messageRouter.sendMessage).not.toHaveBeenCalled();
  });

  it('setActive(false) stops the engine after starting', async () => {
    adapter.setActive(true);
    await vi.advanceTimersByTimeAsync(500);
    expect((adapter as any).isActive).toBe(true);

    adapter.setActive(false);
    await vi.advanceTimersByTimeAsync(500);

    expect((adapter as any).isActive).toBe(false);
    expect(adapter.getStateInfo()).toMatchObject({ isActive: false });
  });

  it('ensureCorrectTrackSelected auto-switches to original track when current track is target language and foreign tracks exist', () => {
    (adapter as any).isActive = true;
    (adapter as any).targetLang = 'zh-Hant';
    (adapter as any).sourceLang = 'auto';
    (adapter as any).selectedTrackId = 'zh-TW';
    (adapter as any).discoveredTracks = [
      { id: '1', languageCode: 'ja', label: 'Japanese' },
      { id: '2', languageCode: 'zh-TW', label: 'Chinese (Traditional)' },
    ];

    const setTrackSpy = vi.spyOn(adapter, 'setTrack');
    (adapter as any).ensureCorrectTrackSelected();

    expect(setTrackSpy).toHaveBeenCalledWith('auto');
  });

  it('ensureCorrectTrackSelected does NOT switch when video original is Chinese and all tracks are Chinese', () => {
    (adapter as any).isActive = true;
    (adapter as any).targetLang = 'zh-Hant';
    (adapter as any).sourceLang = 'auto';
    (adapter as any).selectedTrackId = 'zh-TW';
    (adapter as any).discoveredTracks = [
      { id: '1', languageCode: 'zh-TW', label: 'Chinese (Traditional)' },
      { id: '2', languageCode: 'zh-CN', label: 'Chinese (Simplified)' },
    ];

    const setTrackSpy = vi.spyOn(adapter, 'setTrack');
    (adapter as any).ensureCorrectTrackSelected();

    expect(setTrackSpy).not.toHaveBeenCalled();
  });
});

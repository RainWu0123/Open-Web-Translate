import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YouTubeCaptionAdapter } from '../../src/adapters/youtube/youtube-caption-adapter';
import { messageRouter } from '../../src/infrastructure/messaging/message-router';
import { trackSelectionMatches } from '../../src/adapters/youtube/youtube-bridge';

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

  it('commits a track change only after the MAIN-world result confirms it', async () => {
    let command: any;
    window.addEventListener('owt:yt-command-event', ((event: CustomEvent<string>) => {
      command = JSON.parse(event.detail);
    }) as EventListener, { once: true });

    const pending = adapter.setTrack('ja');
    expect(adapter.getStateInfo().selectedTrackId).not.toBe('ja');
    expect(command.requestId).toBeTruthy();

    window.dispatchEvent(new CustomEvent('owt:yt-tracks-updated', {
      detail: JSON.stringify({
        type: 'OWT_YT_TRACK_SET_RESULT', source: 'owt-youtube-main', revision: 999,
        requestId: command.requestId, ok: true, selectedTrackId: 'ja',
      }),
    }));

    await expect(pending).resolves.toBe(true);
    expect(adapter.getStateInfo().selectedTrackId).toBe('ja');
  });

  it('confirms auto selection against the expected original track identity', () => {
    expect(trackSelectionMatches('en-US', 'en')).toBe(true);
    expect(trackSelectionMatches('zh-TW', 'ja')).toBe(false);
    expect(trackSelectionMatches(null, 'ja')).toBe(false);
  });
});

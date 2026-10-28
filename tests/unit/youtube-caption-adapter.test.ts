import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YouTubeCaptionAdapter } from '../../src/adapters/youtube/youtube-caption-adapter';
import { messageRouter } from '../../src/infrastructure/messaging/message-router';
import { findExactResponseTrack, trackSelectionMatches } from '../../src/adapters/youtube/youtube-bridge';

// Mock messageRouter
vi.mock('../../src/infrastructure/messaging/message-router', () => ({
  messageRouter: {
    sendMessage: vi.fn(),
  },
}));

describe('YouTubeCaptionAdapter', () => {
  it('resolves same-language tracks by exact identity and never guesses an ambiguous track', () => {
    const tracks = [
      { vssId: '.en.first', languageCode: 'en', baseUrl: 'first' },
      { vssId: '.en.second', languageCode: 'en', baseUrl: 'second' },
    ];
    expect(findExactResponseTrack(tracks, 'en', undefined, '.en.second')?.baseUrl).toBe('second');
    expect(findExactResponseTrack(tracks, 'en')).toBeUndefined();
    expect(findExactResponseTrack(tracks, 'en', undefined, '.en.missing')).toBeUndefined();
  });
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

  it('selects two native tracks independently and follows both subtitle timelines', async () => {
    const a = adapter as any; a.isActive = true; a.selectedTrackId = 'ja';
    a.discoveredTracks = [
      { id: 'ja-human', languageCode: 'ja', label: '日本語', baseUrl: 'https://example.test/ja' },
      { id: 'en-human', languageCode: 'en', label: 'English', baseUrl: 'https://example.test/en-human' },
      { id: 'en-asr', languageCode: 'en', label: 'English', kind: 'asr', baseUrl: 'https://example.test/en-asr' },
    ];
    const fetch = vi.spyOn(a, 'fetchTimedTextViaMainWorld').mockImplementation(async (_url: unknown, _timeout: unknown, id: unknown) => JSON.stringify({ events: [
      { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: id }] },
      { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: `${id}-2` }] },
    ] }));
    const render = vi.spyOn(a, 'renderOverlay').mockImplementation(() => {});
    await expect(adapter.setSubtitleSources('original', 'ja-human')).resolves.toBe(true);
    await expect(adapter.setSubtitleSources('translation', 'en-asr')).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith('https://example.test/en-asr', 6000, 'en-asr');
    expect(adapter.getStateInfo()).toMatchObject({ originalSourceId: 'ja-human', translationSourceId: 'en-asr' });
    a.syncEngine.syncOnce(1000);
    expect(render).toHaveBeenLastCalledWith('ja-human', 'en-asr', 'ready', true);
    a.syncEngine.syncOnce(2000);
    expect(render).toHaveBeenLastCalledWith('ja-human-2', 'en-asr-2', 'ready', true);
  });

  it('preserves the old pair if a selected track cannot be loaded', async () => {
    const a = adapter as any; a.isActive = true; a.selectedTrackId = 'ja';
    a.discoveredTracks = ['ja', 'en', 'zh'].map(id => ({ id, languageCode: id, label: id, baseUrl: `https://example.test/${id}` }));
    vi.spyOn(a, 'fetchTimedTextViaMainWorld').mockImplementation(async (_url: unknown, _timeout: unknown, id: unknown) => {
      if (id === 'zh') throw new Error('unavailable');
      return JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: id }] }] });
    });
    a.originalSourceId = 'ja';
    await expect(adapter.setSubtitleSources('translation', 'en')).resolves.toBe(true);
    await expect(adapter.setSubtitleSources('translation', 'zh')).resolves.toBe(false);
    expect(adapter.getStateInfo()).toMatchObject({ originalSourceId: 'ja', translationSourceId: 'en' });
    expect(a.nativePairActive).toBe(true);
  });

  it('does not start automatic AI prefetch while a manual original is selected or loading', async () => {
    const a = adapter as any; a.isActive = true;
    a.discoveredTracks = [{ id: 'en-asr', languageCode: 'en', kind: 'asr', baseUrl: 'https://example.test/en' }];
    const load = vi.spyOn(a.aiPrefetch, 'load');
    a.originalSourceId = 'en-asr';
    await expect(adapter.startAiPrefetchIfAvailable()).resolves.toBe(false);
    await expect(adapter.setTrack('ja')).resolves.toBe(false);
    a.originalSourceId = null;
    a.pendingSelectionEpoch = 7;
    await expect(adapter.startAiPrefetchIfAvailable()).resolves.toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps the shared AI preference when native tracks are discovered later', () => {
    const a = adapter as any; a.isActive = true; a.subtitlePreferenceReady = true;
    a.subtitlePreference = { mode: 'ai' };
    a.discoveredTracks = [{ id: 'zh-new', languageCode: 'zh-Hant', label: '繁體中文', baseUrl: 'https://example.test/zh' }];
    const nativeSelection = vi.spyOn(adapter, 'setSubtitleSources');
    vi.spyOn(adapter, 'startAiPrefetchIfAvailable').mockResolvedValue(true);
    a.reconcileSubtitlePreference();
    expect(nativeSelection).not.toHaveBeenCalled();
    expect(adapter.startAiPrefetchIfAvailable).toHaveBeenCalledOnce();
  });

  it('reopens using the latest AI preference even if a native pair was selected before stopping', async () => {
    const a = adapter as any; a.isActive = true;
    a.originalSourceId = 'ja'; a.translationSourceId = 'en'; a.nativePairActive = true;
    adapter.stop();
    a.applySubtitlePreference({ mode: 'ai' });
    const select = vi.spyOn(adapter, 'setSubtitleSources').mockResolvedValue(true);
    await adapter.start();
    expect(select).toHaveBeenCalledWith('translation', 'ai');
  });

  it('reloads the preferred native pair after stopping and restarting the same video', async () => {
    const a = adapter as any; a.isActive = true; a.subtitlePreferenceReady = true; a.targetLang = 'en';
    a.subtitlePreference = { mode: 'native' }; a.selectedTrackId = 'ja';
    a.discoveredTracks = ['ja', 'en'].map(id => ({ id, languageCode: id, label: id, baseUrl: `https://example.test/${id}` }));
    const fetch = vi.spyOn(a, 'fetchTimedTextViaMainWorld').mockImplementation(async (_url: unknown, _timeout: unknown, id: unknown) =>
      JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: String(id) }] }] }));
    const select = vi.spyOn(adapter, 'setSubtitleSources');
    a.reconcileSubtitlePreference();
    await select.mock.results[0].value;
    expect(a.nativePairActive).toBe(true);
    adapter.stop();
    await adapter.start();
    await select.mock.results[1].value;
    expect(a.nativePairActive).toBe(true);
    expect(adapter.getStateInfo().translationSourceId).toBe('en');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('rejects a pending old target track when the target language changes', async () => {
    const a = adapter as any; a.isActive = true; a.subtitlePreferenceReady = true; a.targetLang = 'en';
    a.subtitlePreference = { mode: 'native' }; a.lastSettingsTarget = 'en'; a.selectedTrackId = 'ja';
    a.discoveredTracks = [
      { id: 'ja', languageCode: 'ja', label: 'Japanese', baseUrl: 'https://example.test/ja' },
      { id: 'en', languageCode: 'en', label: 'English', baseUrl: 'https://example.test/en' },
      { id: 'zh', languageCode: 'zh-Hant', label: '繁體中文', baseUrl: 'https://example.test/zh' },
    ];
    let finishEnglish!: (payload: string) => void;
    const payload = (id: unknown) => JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: String(id) }] }] });
    vi.spyOn(a, 'fetchTimedTextViaMainWorld').mockImplementation((_url: unknown, _timeout: unknown, id: unknown) =>
      id === 'en' ? new Promise<string>(resolve => { finishEnglish = resolve; }) : Promise.resolve(payload(id)));
    const select = vi.spyOn(adapter, 'setSubtitleSources');
    a.reconcileSubtitlePreference();
    const previous = select.mock.results[0].value;
    a.applySharedSettings({ targetLanguage: 'zh-Hant' });
    a.onSharedSettingsApplied({ targetLanguage: 'zh-Hant' });
    const current = select.mock.results[1].value;
    finishEnglish(payload('en'));
    await expect(previous).resolves.toBe(false);
    await expect(current).resolves.toBe(true);
    expect(adapter.getStateInfo().translationSourceId).toBe('zh');
  });

  it('reconciles native subtitles when a following-target language changes', () => {
    const a = adapter as any; a.isActive = true; a.subtitlePreferenceReady = true;
    a.subtitlePreference = { mode: 'native' }; a.lastSettingsTarget = 'en';
    a.originalSourceId = 'ja'; a.translationSourceId = 'en'; a.nativePairActive = true;
    a.discoveredTracks = [
      { id: 'ja', languageCode: 'ja', label: 'Japanese', baseUrl: 'https://example.test/ja' },
      { id: 'en', languageCode: 'en', label: 'English', baseUrl: 'https://example.test/en' },
      { id: 'zh', languageCode: 'zh-Hant', label: '繁體中文', baseUrl: 'https://example.test/zh' },
    ];
    const select = vi.spyOn(adapter, 'setSubtitleSources').mockResolvedValue(true);
    a.applySharedSettings({ targetLanguage: 'zh-Hant' });
    a.onSharedSettingsApplied({ targetLanguage: 'zh-Hant' });
    expect(select).toHaveBeenCalledWith('translation', 'zh');
  });

  it('uses AI fallback if a new target has no native track even with a manually selected original', () => {
    const a = adapter as any; a.isActive = true; a.subtitlePreferenceReady = true;
    a.subtitlePreference = { mode: 'native' }; a.targetLang = 'zh-Hant';
    a.originalSourceId = 'ja'; a.translationSourceId = 'en'; a.nativePairActive = true;
    a.discoveredTracks = [{ id: 'ja', languageCode: 'ja', label: 'Japanese', baseUrl: 'https://example.test/ja' }];
    const select = vi.spyOn(adapter, 'setSubtitleSources').mockResolvedValue(true);
    a.reconcileSubtitlePreference();
    expect(select).toHaveBeenCalledWith('translation', 'ai');
  });

  it('falls back to AI when a preferred native replacement cannot be loaded', async () => {
    const a = adapter as any; a.isActive = true; a.subtitlePreferenceReady = true; a.targetLang = 'zh-Hant';
    a.subtitlePreference = { mode: 'native', language: 'zh-Hant' };
    a.originalSourceId = 'ja'; a.translationSourceId = 'en'; a.nativePairActive = true;
    a.discoveredTracks = [
      { id: 'ja', languageCode: 'ja', label: 'Japanese', baseUrl: 'https://example.test/ja' },
      { id: 'en', languageCode: 'en', label: 'English', baseUrl: 'https://example.test/en' },
      { id: 'zh', languageCode: 'zh-Hant', label: '繁體中文', baseUrl: 'https://example.test/zh' },
    ];
    vi.spyOn(a, 'fetchTimedTextViaMainWorld').mockRejectedValue(new Error('unavailable'));
    vi.spyOn(a.aiPrefetch, 'load').mockImplementation(async (_track: unknown, _valid: unknown, beforeCommit: unknown) => { (beforeCommit as () => void)(); return true; });
    const select = vi.spyOn(adapter, 'setSubtitleSources');
    a.reconcileSubtitlePreference();
    await select.mock.results[0].value;
    expect(select).toHaveBeenCalledWith('translation', 'ai');
    await select.mock.results[1].value;
    expect(adapter.getStateInfo()).toMatchObject({ translationSourceId: null, nativeFallback: true });
    expect(a.subtitlePreference).toEqual({ mode: 'native', language: 'zh-Hant' });
  });

  it('does not let a failed automatic native request override a newer manual choice', async () => {
    const a = adapter as any; a.isActive = true; a.subtitlePreferenceReady = true; a.targetLang = 'zh-Hant';
    a.subtitlePreference = { mode: 'native', language: 'zh-Hant' };
    a.originalSourceId = 'ja'; a.translationSourceId = 'en'; a.nativePairActive = true;
    a.discoveredTracks = ['ja', 'en', 'zh', 'fr'].map(id => ({ id, languageCode: id === 'zh' ? 'zh-Hant' : id, label: id, baseUrl: `https://example.test/${id}` }));
    let failChinese!: (reason: Error) => void;
    const payload = (id: unknown) => JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: String(id) }] }] });
    vi.spyOn(a, 'fetchTimedTextViaMainWorld').mockImplementation((_url: unknown, _timeout: unknown, id: unknown) =>
      id === 'zh' ? new Promise((_resolve, reject) => { failChinese = reject; }) : Promise.resolve(payload(id)));
    const select = vi.spyOn(adapter, 'setSubtitleSources');
    a.reconcileSubtitlePreference();
    const oldRequest = select.mock.results[0].value;
    await expect(adapter.setSubtitleSources('translation', 'fr')).resolves.toBe(true);
    failChinese(new Error('unavailable'));
    await expect(oldRequest).resolves.toBe(false);
    expect(adapter.getStateInfo().translationSourceId).toBe('fr');
    expect(select).not.toHaveBeenCalledWith('translation', 'ai');
  });

  it('does not clear a newer manual pair when an older AI fallback fails', async () => {
    const a = adapter as any; a.isActive = true; a.subtitlePreferenceReady = true; a.targetLang = 'zh-Hant';
    a.subtitlePreference = { mode: 'native', language: 'zh-Hant' };
    a.originalSourceId = 'ja'; a.translationSourceId = 'en'; a.nativePairActive = true;
    a.discoveredTracks = ['ja', 'en', 'zh', 'fr'].map(id => ({ id, languageCode: id === 'zh' ? 'zh-Hant' : id, label: id, baseUrl: `https://example.test/${id}` }));
    const payload = (id: unknown) => JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: String(id) }] }] });
    vi.spyOn(a, 'fetchTimedTextViaMainWorld').mockImplementation((_url: unknown, _timeout: unknown, id: unknown) =>
      id === 'zh' ? Promise.reject(new Error('unavailable')) : Promise.resolve(payload(id)));
    let finishAi!: (value: boolean) => void;
    vi.spyOn(a.aiPrefetch, 'load').mockImplementation(() => new Promise(resolve => { finishAi = resolve; }));
    const select = vi.spyOn(adapter, 'setSubtitleSources');
    a.reconcileSubtitlePreference();
    await select.mock.results[0].value;
    const oldFallback = select.mock.results[1].value;
    await expect(adapter.setSubtitleSources('translation', 'fr')).resolves.toBe(true);
    finishAi(false);
    await expect(oldFallback).resolves.toBe(false);
    await Promise.resolve();
    expect(adapter.getStateInfo()).toMatchObject({ translationSourceId: 'fr', nativeFallback: false });
    expect(a.nativePairActive).toBe(true);
  });

  it('prefers a matching native track on a new video and never reuses the old track id', async () => {
    const a = adapter as any; a.isActive = true; a.subtitlePreferenceReady = true;
    a.subtitlePreference = { mode: 'native', language: 'zh-Hant' };
    a.translationSourceId = 'old-video-track'; a.nativePairActive = true;
    a.onVideoChanged();
    a.discoveredTracks = [
      { id: 'simplified', languageCode: 'zh-Hans', label: '简体中文', baseUrl: 'https://example.test/hans' },
      { id: 'new-traditional', languageCode: 'zh-Hant', label: '繁體中文', baseUrl: 'https://example.test/hant' },
    ];
    const load = vi.spyOn(adapter, 'setSubtitleSources').mockResolvedValue(true);
    a.reconcileSubtitlePreference(); await Promise.resolve();
    expect(load).toHaveBeenCalledWith('translation', 'new-traditional');
    expect(a.translationSourceId).not.toBe('old-video-track');
  });

  it('reports a temporary AI fallback without changing the native preference', () => {
    const a = adapter as any; a.isActive = true; a.subtitlePreferenceReady = true;
    a.subtitlePreference = { mode: 'native', language: 'zh-Hant' };
    a.discoveredTracks = [{ id: 'en', languageCode: 'en', label: 'English', baseUrl: 'https://example.test/en' }];
    const prefetch = vi.spyOn(adapter, 'startAiPrefetchIfAvailable').mockResolvedValue(true);
    a.reconcileSubtitlePreference();
    expect(prefetch).toHaveBeenCalledOnce();
    expect(adapter.getStateInfo().nativeFallback).toBe(true);
    expect(a.subtitlePreference).toEqual({ mode: 'native', language: 'zh-Hant' });
  });

  it('does not commit a pending native track after switching the shared preference to AI', async () => {
    const a = adapter as any; a.isActive = true; a.selectedTrackId = 'ja'; a.subtitlePreferenceReady = true;
    a.subtitlePreference = { mode: 'native' };
    a.discoveredTracks = ['ja', 'en'].map(id => ({ id, languageCode: id, label: id, baseUrl: `https://example.test/${id}` }));
    const finish: Array<(payload: string) => void> = [];
    vi.spyOn(a, 'fetchTimedTextViaMainWorld').mockImplementation(() => new Promise<string>(resolve => finish.push(resolve)));
    vi.spyOn(adapter, 'startAiPrefetchIfAvailable').mockResolvedValue(true);
    const pending = adapter.setSubtitleSources('translation', 'en');
    a.applySubtitlePreference({ mode: 'ai' });
    const payload = JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'line' }] }] });
    finish.forEach(resolve => resolve(payload));
    await expect(pending).resolves.toBe(false);
    expect(a.nativePairActive).toBe(false);
    expect(a.subtitlePreference).toEqual({ mode: 'ai' });
  });

  it('discards a subtitle pair that finishes after navigation to a different video', async () => {
    const a = adapter as any; a.isActive = true; a.selectedTrackId = 'ja';
    a.discoveredTracks = ['ja', 'en'].map(id => ({ id, languageCode: id, label: id, baseUrl: `https://example.test/${id}` }));
    const finish: Array<(s: string) => void> = [];
    vi.spyOn(a, 'fetchTimedTextViaMainWorld').mockImplementation(() => new Promise<string>(resolve => { finish.push(resolve); }));
    const pending = adapter.setSubtitleSources('translation', 'en');
    window.location.search = '?v=different';
    const text = JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'line' }] }] });
    // Complete both requests after navigation.
    finish.forEach(resolve => resolve(text));
    await expect(pending).resolves.toBe(false);
    expect(a.nativePairActive).toBe(false);
  });

  it('never falls back to downloading a subtitle URL from a different video', async () => {
    const a = adapter as any; a.isActive = true; a.sourceLang = 'en';
    a.discoveredTracks = [{ id: 'en', languageCode: 'en', baseUrl: 'https://www.youtube.com/api/timedtext?v=old&lang=en' }];
    const bridge = vi.spyOn(a, 'fetchTimedTextViaMainWorld').mockRejectedValue(new Error('rejected'));
    const direct = vi.fn().mockResolvedValue({ ok: true, text: async () => 'old subtitles' });
    vi.stubGlobal('fetch', direct);
    await expect(adapter.startAiPrefetchIfAvailable()).resolves.toBe(false);
    expect(bridge).not.toHaveBeenCalled();
    expect(direct).not.toHaveBeenCalled();
    expect(a.aiPrefetch.isActive()).toBe(false);
    expect(messageRouter.sendMessage).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('allows the direct fallback for a subtitle URL from the current video', async () => {
    const a = adapter as any;
    vi.spyOn(a, 'fetchTimedTextViaMainWorld').mockRejectedValue(new Error('bridge unavailable'));
    const direct = vi.fn().mockResolvedValue({ ok: true, text: async () => 'current subtitles' });
    vi.stubGlobal('fetch', direct);
    await expect(a.fetchTimedText('https://www.youtube.com/api/timedtext?v=123&lang=en')).resolves.toBe('current subtitles');
    expect(direct).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('drops queued DOM translations after a native pair takes over', async () => {
    const a = adapter as any; a.isActive = true; a.selectedTrackId = 'ja';
    a.discoveredTracks = ['ja', 'en'].map(id => ({ id, languageCode: id, label: id, baseUrl: `https://example.test/${id}` }));
    const finish: Array<(value: unknown) => void> = [];
    vi.mocked(messageRouter.sendMessage).mockImplementation(() => new Promise(resolve => { finish.push(resolve); }) as any);
    vi.spyOn(a, 'fetchTimedTextViaMainWorld').mockImplementation(async () => JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 4000, segs: [{ utf8: 'native' }] }] }));
    const render = vi.spyOn(a, 'renderOverlay').mockImplementation(() => {});
    const old = ['one', 'two', 'three', 'four'].map(text => { a.lastProcessedText = text; return a.fetchAndRenderOverlay(text, a.routeGeneration); });
    await Promise.resolve(); await Promise.resolve();
    expect(finish).toHaveLength(3);
    await expect(adapter.setSubtitleSources('translation', 'en')).resolves.toBe(true);
    a.syncEngine.syncOnce(1000);
    finish.forEach(resolve => resolve({ segments: [{ translatedText: 'stale' }] }));
    await Promise.all(old);
    expect(finish).toHaveLength(3);
    expect(render).toHaveBeenLastCalledWith('native', 'native', 'ready', true);
  });

  it('cancels the old DOM clear timer when a native pair takes over', async () => {
    const a = adapter as any; a.isActive = true; a.selectedTrackId = 'ja'; a.lastProcessedText = 'old';
    a.discoveredTracks = ['ja', 'en'].map(id => ({ id, languageCode: id, label: id, baseUrl: `https://example.test/${id}` }));
    vi.spyOn(a, 'fetchTimedTextViaMainWorld').mockImplementation(async () => JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 4000, segs: [{ utf8: 'native' }] }] }));
    const clear = vi.spyOn(a, 'clearOverlay').mockImplementation(() => {});
    adapter.processCaptions();
    expect(a.clearGraceTimer).not.toBeNull();
    await expect(adapter.setSubtitleSources('translation', 'en')).resolves.toBe(true);
    a.syncEngine.syncOnce(1000);
    await vi.advanceTimersByTimeAsync(1600);
    expect(clear).not.toHaveBeenCalled();
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

  it('coalesces multi-segment DOM caption windows into a single full-sentence overlay translation and keeps original text visible while pending', async () => {
    const container = document.querySelector('.ytp-caption-window-container')!;
    container.innerHTML = `
      <div class="caption-window ytp-caption-window-bottom">
        <span class="ytp-caption-segment">Welcome to today's</span>
        <span class="ytp-caption-segment">deep dive into AI.</span>
      </div>
    `;

    let resolveTranslation!: (val: any) => void;
    vi.mocked(messageRouter.sendMessage).mockImplementation(
      () => new Promise((resolve) => { resolveTranslation = resolve; }),
    );

    await adapter.start('zh-Hant', 'bilingual');
    const overlayHost = document.getElementById('owt-youtube-overlay-host');
    expect(overlayHost).not.toBeNull();

    // Original text is immediately visible in the single-layer overlay while translation is pending
    expect(overlayHost?.shadowRoot?.textContent).toContain("Welcome to today's deep dive into AI.");
    expect(document.getElementById('owt-hide-native-youtube-subtitles')).not.toBeNull();
    expect(messageRouter.sendMessage).toHaveBeenCalledTimes(1);
    expect(messageRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TRANSLATE_REQUEST',
        segments: [{ id: 'yt-caption', text: "Welcome to today's deep dive into AI." }],
      }),
    );

    resolveTranslation({
      segments: [{ id: 'yt-caption', translatedText: '歡迎來到今天的 AI 深入探討。' }],
    });
    await vi.advanceTimersByTimeAsync(20);

    expect(overlayHost?.shadowRoot?.textContent).toContain("Welcome to today's deep dive into AI.");
    expect(overlayHost?.shadowRoot?.textContent).toContain('歡迎來到今天的 AI 深入探討。');
  });

  it('uses full-sentence timedtext batch prefetch when track baseUrl is available', async () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', { value: 1.5, writable: true });
    document.body.appendChild(video);

    const json3Payload = JSON.stringify({
      events: [
        { tStartMs: 1000, dDurationMs: 4000, segs: [{ utf8: 'This is the first' }] },
        { tStartMs: 2500, dDurationMs: 4000, segs: [{ utf8: 'complete sentence.' }] },
        { tStartMs: 6000, dDurationMs: 3000, segs: [{ utf8: 'And here is the second sentence.' }] },
      ],
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => json3Payload,
    }));

    vi.mocked(messageRouter.sendMessage).mockImplementation(async (msg: any) => ({
      segments: msg.segments.map((s: any) => ({
        id: s.id,
        translatedText: `[譯] ${s.text}`,
      })),
    }));

    (adapter as any).discoveredTracks = [
      {
        id: 'en',
        languageCode: 'en',
        label: 'English',
        kind: 'asr',
        baseUrl: 'https://www.youtube.com/api/timedtext?v=123&lang=en',
      },
    ];

    await adapter.start('zh-Hant', 'bilingual');
    // Advance past MAIN-world bridge timeout fallback to direct fetch in test env
    await vi.advanceTimersByTimeAsync(6500);

    expect(messageRouter.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TRANSLATE_REQUEST',
        segments: [
          expect.objectContaining({ text: 'This is the first complete sentence.' }),
          expect.objectContaining({ text: 'And here is the second sentence.' }),
        ],
      }),
    );

    const overlayHost = document.getElementById('owt-youtube-overlay-host');
    expect(overlayHost).not.toBeNull();
    expect(overlayHost?.shadowRoot?.textContent).toContain('This is the first complete sentence.');
    expect(overlayHost?.shadowRoot?.textContent).toContain('[譯] This is the first complete sentence.');
  });
});

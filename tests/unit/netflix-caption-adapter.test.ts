import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetflixCaptionAdapter } from '@/adapters/netflix/netflix-caption-adapter';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { BRIDGE, bridgeRequest, postToMain } from '@/adapters/netflix/netflix-bridge';

vi.mock('@/adapters/netflix/netflix-bridge', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/adapters/netflix/netflix-bridge')>(),
  bridgeRequest: vi.fn(),
  postToMain: vi.fn(),
}));

vi.mock('@/infrastructure/messaging/message-router', () => ({
  messageRouter: {
    sendMessage: vi.fn(),
    registerHandler: vi.fn(),
    listen: vi.fn(),
  },
}));

describe('NetflixCaptionAdapter Unit Tests', () => {
  let adapter: NetflixCaptionAdapter;

  beforeEach(() => {
    document.body.innerHTML = `
      <div data-uia="controls-standard">
        <button data-uia="control-audio-subtitle">Subtitles</button>
      </div>
    `;
    vi.clearAllMocks();
    adapter = new NetflixCaptionAdapter();
  });

  afterEach(() => {
    if (adapter) {
      adapter.stop();
    }
    vi.unstubAllGlobals();
  });

  it('initializes adapter on netflix.com and starts/stops cleanly', async () => {
    adapter.init();
    expect(adapter.getTrackManager()).toBeDefined();
    expect(adapter.getSyncEngine()).toBeDefined();

    await adapter.start('zh-TW');
    expect(adapter.getOverlayRenderer()).toBeDefined();

    adapter.stop();
  });

  it('does not repeat nested native caption containers', () => {
    document.body.innerHTML = '<div class="player-timedtext"><div class="player-timedtext-text-container">First line</div><div class="player-timedtext-text-container">Second line</div></div>';
    expect((adapter as any).getNativeSubtitleTextFromDOM()).toBe('First line\nSecond line');
  });

  it('keeps the shared AI preference when the Netflix video changes', () => {
    const a = adapter as any;
    a.applySubtitlePreference({ mode: 'ai' });
    a.selectedTrackId = 'old-track';
    a.onVideoChanged();
    expect(adapter.getStateInfo()).toMatchObject({ selectionMode: 'manual', selectedTrackId: 'ai-translate' });
    expect(a.subtitlePreference).toEqual({ mode: 'ai' });
  });

  it('reconciles new-video tracks while an old explicit pair is still loading', async () => {
    const a = adapter as any; a.isActive = true; a.subtitlePreferenceReady = true;
    const original = { id: 'old-ja', language: 'ja', label: 'Japanese', url: '', isCC: false };
    a.discoveredTracks = [original];
    let finishOld!: (track: typeof original) => void;
    vi.spyOn(a, 'ensureTrackDownloadUrl').mockImplementation(() => new Promise(resolve => { finishOld = resolve; }));
    const oldLoad = a.loadExplicitPair(original.id, null, a.subtitleSelectionEpoch, false, 'auto');
    expect(a.pendingPairEpoch).not.toBeNull();
    a.onVideoChanged();
    const run = vi.spyOn(a, 'runAutoSelection').mockResolvedValue(true);
    a.reconcileTrackSelection();
    expect(run).toHaveBeenCalledOnce();
    finishOld({ ...original, url: 'https://example.test/old' });
    await expect(oldLoad).resolves.toBe(false);
    expect(a.pendingPairEpoch).toBeNull();
  });

  it('does not report a new native track as loaded when its replacement fails', async () => {
    const a = adapter as any; a.isActive = true; a.targetLang = 'en';
    const tracks = ['ja', 'en'].map(id => ({ id, language: id, label: id, url: `https://example.test/${id}`, isCC: false, hasUrl: true }));
    a.discoveredTracks = tracks; a.trackManager.setDiscoveredTracks(tracks); a.trackManager.setTargetLanguage('en');
    a.selectedTrackId = 'old-native';
    vi.spyOn(a.dualTrack, 'isActive').mockReturnValue(true);
    vi.spyOn(a.dualTrack, 'selectPrimary').mockResolvedValue(tracks[0]);
    vi.spyOn(a.dualTrack, 'load').mockResolvedValue(false);
    vi.spyOn(a, 'startAiPrefetchOrFallback').mockResolvedValue(false);
    vi.spyOn(adapter, 'processCaptions').mockImplementation(() => {});
    await expect(a.runAutoSelection()).resolves.toBe(true);
    expect(adapter.getStateInfo().selectedTrackId).toBe('ai-translate');
  });

  it('renders the original without a waiting message when an explicitly selected native translation has a gap', async () => {
    const a = adapter as any; a.isActive = true; a.syncVideoIdentity();
    const original = { id: 'ja', language: 'ja', label: '日文', url: 'https://example.test/ja', isCC: false, hasUrl: true };
    const translated = { id: 'zh', language: 'zh-Hant', label: '中文', url: 'https://example.test/zh', isCC: false, hasUrl: true };
    vi.spyOn(adapter, 'fetchTtmlXml').mockImplementation(async url => url.endsWith('/ja')
      ? '<tt><body><p begin="1s" end="4s">原文</p></body></tt>'
      : '<tt><body><p begin="2s" end="4s">譯文</p></body></tt>');
    const render = vi.spyOn(adapter.getOverlayRenderer(), 'render');
    await expect(a.dualTrack.load(original, translated, () => true, { fallback: false })).resolves.toBe(true);
    adapter.getSyncEngine().syncOnce(1000);
    expect(render).toHaveBeenLastCalledWith('原文', '', expect.objectContaining({ isPending: false, isError: false }));
    adapter.getSyncEngine().syncOnce(2000);
    expect(render).toHaveBeenLastCalledWith('原文', '譯文', expect.objectContaining({ isPending: false }));
  });

  it('requests an existing track snapshot when enabled after page discovery', async () => {
    await adapter.start('zh-Hant');
    expect(postToMain).toHaveBeenCalledWith(BRIDGE.messageType.REQUEST_TRACKS);
  });

  it('retries track discovery in manual AI mode while playback is paused', async () => {
    vi.useFakeTimers();
    try {
      const a = adapter as any;
      a.isActive = true;
      a.selectionMode = 'manual';
      a.selectedTrackId = 'ai-translate';
      a.discoveredTracks = [];
      await a.startAiPrefetchOrFallback();
      await vi.advanceTimersByTimeAsync(4000);
      expect(postToMain).toHaveBeenCalledWith(BRIDGE.messageType.REQUEST_TRACKS);
      a.sourceLang = 'ja';
      a.discoveredTracks = [{ id: 'ja', language: 'ja', url: 'https://example.test/ja.ttml' }];
      const load = vi.spyOn(a.aiPrefetch, 'load').mockResolvedValue(true);
      await vi.advanceTimersByTimeAsync(4000);
      expect(load).toHaveBeenCalledOnce();
    } finally {
      adapter.stop();
      vi.useRealTimers();
    }
  });

  it('starts prefetch when tracks arrive after choosing AI, then reuses its cache', async () => {
    const a = adapter as any;
    a.isActive = true;
    a.sourceLang = 'ja';
    a.selectionMode = 'manual';
    a.selectedTrackId = 'ai-translate';
    a.discoveredTracks = [{ id: 'ja', language: 'ja', label: 'Japanese', url: 'https://example.test/ja.ttml' }];
    const load = vi.spyOn(a.aiPrefetch, 'load').mockResolvedValue(true);
    const matches = vi.spyOn(a.aiPrefetch, 'matches').mockReturnValue(false);
    a.reconcileTrackSelection();
    await a.aiLoading;
    expect(load).toHaveBeenCalledTimes(1);
    matches.mockReturnValue(true);
    a.reconcileTrackSelection();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('switches from AI to an available native target track only after its cues load', async () => {
    const a = adapter as any;
    a.isActive = true;
    a.targetLang = 'zh-Hant';
    a.selectionMode = 'manual';
    a.selectedTrackId = 'ai-translate';
    const native = {
      id: 'zh-Hant-track', language: 'zh-Hant', label: '繁體中文',
      url: 'https://example.test/zh-Hant.ttml', isCC: false, hasUrl: true,
    };
    a.discoveredTracks = [native];
    a.trackManager.setDiscoveredTracks([native]);
    vi.spyOn(adapter, 'fetchTtmlXml').mockResolvedValue(
      '<tt><body><div><p begin="00:00:01.000" end="00:00:03.000">這是中文字幕</p></div></body></tt>',
    );

    await expect(adapter.setSubtitleSource('auto')).resolves.toBe(true);
    expect(adapter.getStateInfo()).toMatchObject({
      selectionMode: 'auto',
      selectedTrackId: 'zh-Hant-track',
      translationMode: 'native',
    });
  });

  it('independently selects the original and translated native tracks', async () => {
    const a = adapter as any;
    a.isActive = true;
    const tracks = [
      { id: 'ja', language: 'ja', label: '日語', url: 'https://example.test/ja', isCC: false, hasUrl: true },
      { id: 'en', language: 'en', label: '英語', url: 'https://example.test/en', isCC: false, hasUrl: true },
      { id: 'zh', language: 'zh-Hant', label: '繁體中文', url: 'https://example.test/zh', isCC: false, hasUrl: true },
    ];
    a.discoveredTracks = tracks; a.trackManager.setDiscoveredTracks(tracks);
    a.selectedTrackId = 'zh'; a.selectionMode = 'manual';
    vi.spyOn(adapter, 'fetchTtmlXml').mockImplementation(async url =>
      `<tt><body><p begin="1s" end="3s">${url.split('/').pop()}</p></body></tt>`);
    vi.spyOn(adapter.getSyncEngine(), 'start').mockImplementation(() => {});
    await expect(adapter.setOriginalSubtitleSource('ja')).resolves.toBe(true);
    expect(adapter.getStateInfo()).toMatchObject({ originalTrackId: 'ja', selectedTrackId: 'zh', dualTrack: true });
    await expect(adapter.setSubtitleSource('track', 'en')).resolves.toBe(true);
    expect(adapter.getStateInfo()).toMatchObject({ originalTrackId: 'ja', selectedTrackId: 'en', dualTrack: true });
    expect(a.originalTrackLanguage()).toBe('ja');
  });

  it('preserves the committed pair if another original subtitle fails to load', async () => {
    const a = adapter as any; a.isActive = true;
    const tracks = ['ja', 'en', 'zh'].map(id => ({ id, language: id, label: id, url: `https://example.test/${id}`, isCC: false, hasUrl: true }));
    a.discoveredTracks = tracks; a.trackManager.setDiscoveredTracks(tracks);
    a.selectedTrackId = 'zh'; a.selectionMode = 'manual';
    vi.spyOn(adapter.getSyncEngine(), 'start').mockImplementation(() => {});
    vi.spyOn(adapter, 'fetchTtmlXml').mockImplementation(async url => {
      if (url.endsWith('/en')) throw new Error('offline');
      return '<tt><body><p begin="1s" end="3s">字幕</p></body></tt>';
    });
    await expect(adapter.setOriginalSubtitleSource('ja')).resolves.toBe(true);
    await expect(adapter.setOriginalSubtitleSource('en')).resolves.toBe(false);
    expect(adapter.getStateInfo()).toMatchObject({ originalTrackId: 'ja', selectedTrackId: 'zh', dualTrack: true });
  });

  it('does not commit a pending subtitle pair after the target language changes', async () => {
    const a = adapter as any; a.isActive = true;
    const tracks = ['ja', 'en', 'zh'].map(id => ({ id, language: id, label: id, url: `https://example.test/${id}`, isCC: false, hasUrl: true }));
    a.discoveredTracks = tracks; a.trackManager.setDiscoveredTracks(tracks);
    a.selectedTrackId = 'zh'; a.selectionMode = 'manual';
    a.lastReconciledTargetLang = 'zh';
    vi.spyOn(adapter.getSyncEngine(), 'start').mockImplementation(() => {});
    const xml = '<tt><body><p begin="1s" end="3s">字幕</p></body></tt>';
    let release!: (xml: string) => void;
    vi.spyOn(adapter, 'fetchTtmlXml').mockImplementation(url => url.endsWith('/en')
      ? new Promise<string>(resolve => { release = resolve; }) : Promise.resolve(xml));
    await expect(adapter.setOriginalSubtitleSource('ja')).resolves.toBe(true);
    const pending = adapter.setSubtitleSource('track', 'en');
    await vi.waitFor(() => expect(release).toBeDefined());
    a.applySharedSettings({ targetLanguage: 'en' });
    a.onSharedSettingsApplied({ targetLanguage: 'en' });
    release(xml);
    await expect(pending).resolves.toBe(false);
    expect(adapter.getStateInfo()).toMatchObject({ originalTrackId: 'ja', selectedTrackId: 'zh', dualTrack: true });
  });

  it('invalidates an earlier AI load when an explicit pair is selected', async () => {
    const a = adapter as any; a.isActive = true; a.sourceLang = 'ja';
    const tracks = ['ja', 'zh'].map(id => ({ id, language: id, label: id, url: `https://example.test/${id}`, isCC: false, hasUrl: true }));
    a.discoveredTracks = tracks; a.trackManager.setDiscoveredTracks(tracks);
    a.selectedTrackId = 'zh'; a.selectionMode = 'manual';
    let guard!: () => boolean;
    vi.spyOn(a.aiPrefetch, 'load').mockImplementation(async (_track: unknown, check: unknown) => { guard = check as () => boolean; return true; });
    vi.spyOn(adapter, 'fetchTtmlXml').mockResolvedValue('<tt><body><p begin="1s" end="3s">字幕</p></body></tt>');
    vi.spyOn(adapter.getSyncEngine(), 'start').mockImplementation(() => {});
    await a.startAiPrefetchOrFallback();
    expect(guard()).toBe(true);
    await expect(adapter.setOriginalSubtitleSource('ja')).resolves.toBe(true);
    expect(guard()).toBe(false);
  });

  it('reloads AI subtitles when the target language changes and no native target is available', () => {
    const a = adapter as any; a.isActive = true; a.targetLang = 'fr';
    const original = { id: 'ja', language: 'ja', label: '日本語', url: 'https://example.test/ja', isCC: false, hasUrl: true };
    a.discoveredTracks = [original]; a.trackManager.setDiscoveredTracks([original]);
    a.originalTrackId = 'ja'; a.selectedTrackId = 'ai-translate'; a.selectionMode = 'auto';
    vi.spyOn(a.aiPrefetch, 'matches').mockReturnValue(false);
    const reload = vi.spyOn(a, 'loadExplicitPair').mockResolvedValue(true);
    a.reconcileTrackSelection();
    expect(reload).toHaveBeenCalledWith('ja', null, a.subtitleSelectionEpoch, false, 'auto');
    expect(a.aiPrefetch.matches).toHaveBeenCalledWith(original, 'fr');
  });

  it('restores the selected native pair after disabling and enabling subtitles', async () => {
    const a = adapter as any; a.isActive = true;
    const tracks = ['ja', 'zh'].map(id => ({ id, language: id, label: id, url: `https://example.test/${id}`, isCC: false, hasUrl: true }));
    a.discoveredTracks = tracks; a.trackManager.setDiscoveredTracks(tracks);
    a.selectedTrackId = 'zh'; a.selectionMode = 'manual';
    vi.spyOn(adapter, 'fetchTtmlXml').mockResolvedValue('<tt><body><p begin="1s" end="3s">字幕</p></body></tt>');
    vi.spyOn(adapter.getSyncEngine(), 'start').mockImplementation(() => {});
    await expect(adapter.setOriginalSubtitleSource('ja')).resolves.toBe(true);
    adapter.stop();
    await adapter.start();
    await vi.waitFor(() => expect(adapter.getStateInfo()).toMatchObject({ originalTrackId: 'ja', selectedTrackId: 'zh', dualTrack: true }));
    expect(a.dualTrack.getPrimaryLang()).toBe('ja');
  });

  it.each(['success', 'failure'])('does not let a stale AI %s overwrite a newly selected native subtitle', async outcome => {
    const a = adapter as any; a.isActive = true; a.lastProcessedText = 'Hello';
    let resolve!: (value: unknown) => void;
    let reject!: (error: Error) => void;
    vi.mocked(messageRouter.sendMessage).mockImplementation(() => new Promise((res, rej) => { resolve = res; reject = rej; }) as any);
    const render = vi.spyOn(a, 'renderOverlay').mockImplementation(() => {});
    const pending = a.fetchAndRenderOverlay('Hello', a.routeGeneration);
    expect(render).toHaveBeenCalledTimes(1);
    a.inlineRenderEpoch += 1;
    a.renderOverlay('Hello', '原生字幕', 'ready');
    if (outcome === 'success') resolve({ segments: [{ translatedText: '舊的 AI 譯文' }] });
    else reject(new Error('timeout'));
    await pending;
    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith('Hello', '原生字幕', 'ready');
  });

  it('keeps a pending AI translation when a requested native track fails to load', async () => {
    const a = adapter as any; a.isActive = true; a.lastProcessedText = 'Hello'; a.syncVideoIdentity();
    const native = { id: 'zh', language: 'zh-Hant', label: '中文', url: 'https://example.test/zh', isCC: false, hasUrl: true };
    a.discoveredTracks = [native]; a.trackManager.setDiscoveredTracks([native]);
    let resolve!: (value: unknown) => void;
    vi.mocked(messageRouter.sendMessage).mockImplementation(() => new Promise(res => { resolve = res; }) as any);
    vi.spyOn(adapter, 'fetchTtmlXml').mockRejectedValue(new Error('offline'));
    const render = vi.spyOn(a, 'renderOverlay').mockImplementation(() => {});
    const pending = a.fetchAndRenderOverlay('Hello', a.routeGeneration);
    await expect(adapter.setSubtitleSource('track', 'zh')).resolves.toBe(false);
    resolve({ segments: [{ translatedText: '保留的翻譯' }] });
    await pending;
    expect(render).toHaveBeenLastCalledWith('Hello', '保留的翻譯', 'ready');
  });

  it.each(['missing', 'failed'])('keeps the current AI request when AI is selected again and prefetch is %s', async mode => {
    const a = adapter as any; a.isActive = true; a.sourceLang = 'ja'; a.lastProcessedText = 'Hello'; a.syncVideoIdentity();
    if (mode === 'failed') {
      a.discoveredTracks = [{ id: 'ja', language: 'ja', url: 'https://example.test/ja' }];
      vi.spyOn(a.aiPrefetch, 'load').mockResolvedValue(false);
    }
    let resolve!: (value: unknown) => void;
    vi.mocked(messageRouter.sendMessage).mockImplementation(() => new Promise(res => { resolve = res; }) as any);
    const render = vi.spyOn(a, 'renderOverlay').mockImplementation(() => {});
    const pending = a.fetchAndRenderOverlay('Hello', a.routeGeneration);
    await adapter.setSubtitleSource('ai');
    resolve({ segments: [{ translatedText: '繼續翻譯' }] });
    await pending;
    expect(render).toHaveBeenLastCalledWith('Hello', '繼續翻譯', 'ready');
  });

  it('refreshes the current subtitle after switching from native to unavailable AI prefetch', async () => {
    const a = adapter as any; a.isActive = true; a.selectedTrackId = 'zh'; a.lastProcessedText = 'Hello';
    vi.spyOn(a, 'startAiPrefetchOrFallback').mockResolvedValue(false);
    const process = vi.spyOn(adapter, 'processCaptions').mockImplementation(() => {});
    await adapter.setSubtitleSource('ai');
    expect(a.lastProcessedText).toBe('');
    expect(process).toHaveBeenCalledOnce();
  });

  it.each(['success', 'failure'])('does not let a stale AI %s overwrite an automatically discovered native subtitle', async outcome => {
    const a = adapter as any; a.isActive = true; a.targetLang = 'zh-Hant'; a.lastProcessedText = 'Hello';
    const native = { id: 'zh', language: 'zh-Hant', label: '中文', url: 'https://example.test/zh', isCC: false, hasUrl: true };
    a.discoveredTracks = [native]; a.trackManager.setDiscoveredTracks([native]);
    a.trackManager.setTargetLanguage('zh-Hant'); a.syncVideoIdentity();
    let resolve!: (value: unknown) => void;
    let reject!: (error: Error) => void;
    vi.mocked(messageRouter.sendMessage).mockImplementation(() => new Promise((res, rej) => { resolve = res; reject = rej; }) as any);
    vi.spyOn(adapter, 'fetchTtmlXml').mockResolvedValue('<tt><body><p begin="1s" end="3s">原生字幕</p></body></tt>');
    const render = vi.spyOn(a, 'renderOverlay').mockImplementation(() => {});
    vi.spyOn(adapter, 'processCaptions').mockImplementation(() => { a.lastProcessedText = 'Hello'; a.renderOverlay('Hello', '原生字幕', 'ready'); });
    const pending = a.fetchAndRenderOverlay('Hello', a.routeGeneration);
    await expect(a.runAutoSelection()).resolves.toBe(true);
    expect(a.selectedTrackId).toBe('zh');
    if (outcome === 'success') resolve({ segments: [{ translatedText: '舊的 AI 譯文' }] });
    else reject(new Error('timeout'));
    await pending;
    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith('Hello', '原生字幕', 'ready');
  });

  it.each(['success', 'failure'])('does not let AI fallback %s overwrite a later native segment of the same original cue', async outcome => {
    const a = adapter as any; a.isActive = true; a.syncVideoIdentity();
    const original = { id: 'ja', language: 'ja', label: '日文', url: 'https://example.test/ja', isCC: false, hasUrl: true };
    const native = { id: 'zh', language: 'zh-Hant', label: '中文', url: 'https://example.test/zh', isCC: false, hasUrl: true };
    let resolve!: (value: unknown) => void;
    let reject!: (error: Error) => void;
    vi.mocked(messageRouter.sendMessage).mockImplementation(() => new Promise((res, rej) => { resolve = res; reject = rej; }) as any);
    vi.spyOn(adapter, 'fetchTtmlXml').mockImplementation(async url => url.endsWith('/ja')
      ? '<tt><body><p begin="1s" end="4s">Hello</p></body></tt>'
      : '<tt><body><p begin="2s" end="4s">原生字幕</p></body></tt>');
    const render = vi.spyOn(a, 'renderOverlay').mockImplementation(() => {});
    await expect(a.dualTrack.load(original, native)).resolves.toBe(true);
    adapter.getSyncEngine().syncOnce(1000);
    adapter.getSyncEngine().syncOnce(2000);
    expect(render).toHaveBeenLastCalledWith('Hello', '原生字幕', 'ready', true);
    if (outcome === 'success') resolve({ segments: [{ translatedText: '舊的 AI 譯文' }] });
    else reject(new Error('timeout'));
    await vi.waitFor(() => expect(a.pendingTranslationFingerprints.size).toBe(0));
    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith('Hello', '原生字幕', 'ready', true);
  });

  it.each(['adjacent', 'gap'])('retries AI fallback for repeated original text across a %s segment', async kind => {
    const a = adapter as any; a.isActive = true; a.syncVideoIdentity();
    const original = { id: 'ja', language: 'ja', label: '日文', url: 'https://example.test/ja', isCC: false, hasUrl: true };
    const native = { id: 'zh', language: 'zh-Hant', label: '中文', url: 'https://example.test/zh', isCC: false, hasUrl: true };
    const responses: Array<(value: unknown) => void> = [];
    vi.mocked(messageRouter.sendMessage).mockImplementation(() => new Promise(resolve => { responses.push(resolve); }) as any);
    vi.spyOn(adapter, 'fetchTtmlXml').mockImplementation(async url => url.endsWith('/ja')
      ? `<tt><body><p begin="1s" end="2s">Hello</p><p begin="${kind === 'gap' ? '2.2s' : '2s'}" end="4s">Hello</p></body></tt>`
      : '<tt><body><p begin="5s" end="6s">原生字幕</p></body></tt>');
    const render = vi.spyOn(a, 'renderOverlay').mockImplementation(() => {});
    await expect(a.dualTrack.load(original, native)).resolves.toBe(true);
    adapter.getSyncEngine().syncOnce(1000);
    if (kind === 'gap') adapter.getSyncEngine().syncOnce(2100);
    adapter.getSyncEngine().syncOnce(kind === 'gap' ? 2200 : 2000);
    expect(responses).toHaveLength(2);
    responses[1]({ segments: [{ translatedText: '最新翻譯' }] });
    responses[0]({ segments: [{ translatedText: '舊翻譯' }] });
    await vi.waitFor(() => expect(a.pendingTranslationFingerprints.size).toBe(0));
    expect(render).toHaveBeenLastCalledWith('Hello', '最新翻譯', 'ready');
  });

  it('hydrates a discovered native track without a URL before switching away from AI', async () => {
    const a = adapter as any;
    a.isActive = true;
    a.targetLang = 'zh-Hant';
    a.selectionMode = 'manual';
    a.selectedTrackId = 'ai-translate';
    const native = {
      id: 'zh-TW-track', language: 'zh-TW', label: '繁體中文',
      url: '', isCC: false, hasUrl: false,
    };
    a.discoveredTracks = [native];
    a.trackManager.setDiscoveredTracks([native]);
    vi.mocked(bridgeRequest).mockResolvedValueOnce({ url: 'https://example.test/zh-TW.ttml' } as any);
    vi.spyOn(adapter, 'fetchTtmlXml').mockResolvedValue(
      '<tt><body><div><p begin="00:00:01.000" end="00:00:03.000">這是中文字幕</p></div></body></tt>',
    );

    await expect(adapter.setSubtitleSource('track', native.id)).resolves.toBe(true);

    expect(bridgeRequest).toHaveBeenCalledWith(
      BRIDGE.messageType.HYDRATE_TRACK,
      { trackId: native.id, expectedLanguage: native.language, performSeek: true, videoId: window.location.pathname },
      4000,
    );
    expect(adapter.getStateInfo()).toMatchObject({
      selectionMode: 'manual',
      selectedTrackId: native.id,
      translationMode: 'native',
      secondaryCuesCount: 1,
    });
  });

  it('keeps the current native subtitle when a replacement track fails to load', async () => {
    const a = adapter as any;
    a.isActive = true;
    const first = {
      id: 'zh-Hant-a', language: 'zh-Hant', label: '繁體中文 A',
      url: 'https://example.test/a.ttml', isCC: false, hasUrl: true,
    };
    const broken = {
      id: 'zh-Hant-b', language: 'zh-Hant', label: '繁體中文 B',
      url: 'https://example.test/b.ttml', isCC: false, hasUrl: true,
    };
    a.discoveredTracks = [first, broken];
    a.trackManager.setDiscoveredTracks([first, broken]);
    vi.spyOn(adapter, 'fetchTtmlXml')
      .mockResolvedValueOnce('<tt><body><div><p begin="00:00:01.000" end="00:00:03.000">保留這一句</p></div></body></tt>')
      .mockRejectedValueOnce(new Error('network failed'));

    await expect(adapter.setSubtitleSource('track', first.id)).resolves.toBe(true);
    const before = adapter.getStateInfo();
    await expect(adapter.setSubtitleSource('track', broken.id)).resolves.toBe(false);

    expect(adapter.getStateInfo()).toMatchObject({
      selectionMode: 'manual',
      selectedTrackId: first.id,
      secondaryCuesCount: before.secondaryCuesCount,
      translationMode: 'native',
    });
    expect(a.secondaryCues[0].text).toBe('保留這一句');
  });

  it('clears the manager, manual track, context and visible sentence when the film changes', () => {
    const a = adapter as any;
    vi.stubGlobal('location', { pathname: '/watch/100', href: 'https://www.netflix.com/watch/100' });
    a.syncVideoIdentity();
    const old = { id: 'zh', language: 'zh-Hant', label: '繁體中文', url: 'https://cdn.test/old' };
    a.discoveredTracks = [old]; a.trackManager.setDiscoveredTracks([old]);
    a.selectionMode = 'manual'; a.selectedTrackId = 'zh';
    a.secondaryCues = [{ text: '上一部字幕', startMs: 0, endMs: 10000 }];
    a.recentAiContext = [{ source: 'old', translation: '上一部' }];
    a.lastRenderedSentence = { original: 'old', translated: '上一部' };
    a.autoSelectionRunning = true;
    vi.stubGlobal('location', { pathname: '/watch/200', href: 'https://www.netflix.com/watch/200' });

    expect(adapter.getStateInfo()).toMatchObject({ tracks: [], selectedTrackId: 'ai-translate', selectionMode: 'auto', secondaryCuesCount: 0 });
    expect(a.trackManager.getDiscoveredTracks()).toEqual([]);
    expect(a.recentAiContext).toEqual([]);
    expect(a.lastRenderedSentence).toBeNull();
    expect(a.autoSelectionRunning).toBe(false);
  });

  it('rejects old subtitle downloads when the next film reuses the track ID', async () => {
    const a = adapter as any;
    vi.stubGlobal('location', { pathname: '/watch/100' }); a.syncVideoIdentity();
    a.isActive = true;
    const old = { id: 'zh', language: 'zh-Hant', label: '繁體中文', url: 'https://cdn.test/old' };
    a.discoveredTracks = [old]; a.trackManager.setDiscoveredTracks([old]);
    let resolveOld!: (xml: string) => void;
    vi.spyOn(adapter, 'fetchTtmlXml').mockImplementation(() => new Promise<string>(resolve => { resolveOld = resolve; }));
    const pending = adapter.setSubtitleSource('track', 'zh');
    await Promise.resolve(); await Promise.resolve();
    vi.stubGlobal('location', { pathname: '/watch/200' }); adapter.getStateInfo();
    const next = { ...old, url: 'https://cdn.test/new' };
    a.discoveredTracks = [next]; a.trackManager.setDiscoveredTracks([next]);
    resolveOld('<tt><body><p begin="1s" end="2s">上一部字幕</p></body></tt>');
    await expect(pending).resolves.toBe(false);
    expect(a.secondaryCues).toEqual([]);
    expect(a.trackManager.getDiscoveredTracks()[0].url).toBe(next.url);
  });

  it('does not hydrate an old URL back into the new film track list', async () => {
    const a = adapter as any;
    vi.stubGlobal('location', { pathname: '/watch/100' }); a.syncVideoIdentity();
    a.isActive = true;
    const old = { id: 'zh', language: 'zh-Hant', label: '繁體中文', url: '' };
    a.discoveredTracks = [old];
    let resolveOld!: (result: any) => void;
    vi.mocked(bridgeRequest).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const pending = adapter.setSubtitleSource('track', 'zh');
    vi.stubGlobal('location', { pathname: '/watch/200' }); adapter.getStateInfo();
    const next = { ...old, url: 'https://cdn.test/new' };
    a.discoveredTracks = [next]; a.trackManager.setDiscoveredTracks([next]);
    resolveOld({ url: 'https://cdn.test/old' });
    await expect(pending).resolves.toBe(false);
    expect(a.discoveredTracks[0].url).toBe(next.url);
    expect(a.secondaryCues).toEqual([]);
  });

  it('ignores a broadcast labelled with the previous film ID', () => {
    const a = adapter as any;
    vi.stubGlobal('location', { pathname: '/watch/200' });
    a.setupMainWorldMessageListener();
    document.dispatchEvent(new CustomEvent(BRIDGE.TRACKS_EVENT, { detail: JSON.stringify({
      source: BRIDGE.MAIN_SOURCE, type: BRIDGE.messageType.TRACKS_UPDATED, revision: 100,
      videoId: '100', scopeEpoch: 1, tracks: [{ trackId: 'zh', language: 'zh-Hant', label: '上一部繁中' }],
    }) }));
    expect(adapter.getStateInfo().tracks).toEqual([]);
  });

  it('does not start a direct-fetch fallback for an expired film request', async () => {
    const a = adapter as any;
    vi.stubGlobal('location', { pathname: '/watch/100' }); a.syncVideoIdentity();
    let rejectOld!: (error: Error) => void;
    vi.mocked(bridgeRequest).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    const fetchResource = vi.fn(); vi.stubGlobal('fetch', fetchResource);
    const pending = adapter.fetchTtmlXml('https://cdn.test/old');
    vi.stubGlobal('location', { pathname: '/watch/200' });
    rejectOld(new Error('MAIN-world bridge timeout'));
    await expect(pending).rejects.toThrow('video-changed');
    expect(fetchResource).not.toHaveBeenCalled();
  });

  it('does not let an older native-track request overwrite the latest selection', async () => {
    const a = adapter as any;
    a.isActive = true;
    const first = { id: 'first', language: 'zh-Hant', label: '第一條', url: 'https://example.test/first.ttml', isCC: false, hasUrl: true };
    const latest = { id: 'latest', language: 'zh-Hant', label: '最新一條', url: 'https://example.test/latest.ttml', isCC: false, hasUrl: true };
    a.discoveredTracks = [first, latest];
    a.trackManager.setDiscoveredTracks([first, latest]);
    let resolveFirst!: (xml: string) => void;
    let resolveLatest!: (xml: string) => void;
    vi.spyOn(adapter, 'fetchTtmlXml').mockImplementation((url: string) => new Promise((resolve) => {
      if (url.includes('first')) resolveFirst = resolve;
      else resolveLatest = resolve;
    }));

    const oldRequest = adapter.setSubtitleSource('track', first.id);
    const newRequest = adapter.setSubtitleSource('track', latest.id);
    await Promise.resolve();
    await Promise.resolve();
    resolveLatest('<tt><body><div><p begin="00:00:01.000" end="00:00:03.000">最新字幕</p></div></body></tt>');
    await expect(newRequest).resolves.toBe(true);
    resolveFirst('<tt><body><div><p begin="00:00:01.000" end="00:00:03.000">舊字幕</p></div></body></tt>');
    await expect(oldRequest).resolves.toBe(false);

    expect(adapter.getStateInfo()).toMatchObject({ selectedTrackId: latest.id, secondaryCuesCount: 1 });
    expect(a.secondaryCues[0].text).toBe('最新字幕');
  });

  it('does not let a stale dual-track fallback overwrite a newer subtitle choice', async () => {
    const a = adapter as any;
    a.isActive = true;
    const stale = { id: 'stale', language: 'zh-Hant', label: '舊 fallback', url: 'https://example.test/stale.ttml', isCC: false, hasUrl: true };
    let resolveStale!: (xml: string) => void;
    vi.spyOn(adapter, 'fetchTtmlXml').mockImplementation(() => new Promise((resolve) => { resolveStale = resolve; }));
    const epoch = a.subtitleSelectionEpoch;
    const fallback = a.dualTrack.host.fallbackToSingle(stale, () => epoch === a.subtitleSelectionEpoch);
    await Promise.resolve();
    await Promise.resolve();

    a.subtitleSelectionEpoch += 1;
    a.selectedTrackId = 'latest';
    a.secondaryCues = [{ startMs: 1000, endMs: 3000, text: '最新字幕' }];
    resolveStale('<tt><body><div><p begin="00:00:01.000" end="00:00:03.000">舊字幕</p></div></body></tt>');
    await fallback;

    expect(adapter.getStateInfo()).toMatchObject({ selectedTrackId: 'latest', secondaryCuesCount: 1 });
    expect(a.secondaryCues[0].text).toBe('最新字幕');
  });

  it('prefetches future subtitles from the actual MAIN-world track payload', async () => {
    const a = adapter as any;
    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', { value: 10.5, configurable: true });
    document.body.appendChild(video);
    a.isActive = true;
    a.sourceLang = 'auto';
    a.selectionMode = 'manual';
    a.selectedTrackId = 'ai-translate';
    a.setupMainWorldMessageListener();
    vi.mocked(bridgeRequest).mockResolvedValueOnce({ trackId: 'ja-track' });
    const fetchTrack = vi.spyOn(adapter, 'fetchTtmlXml').mockResolvedValue(
      '<tt><body><div><p begin="00:00:10.000" end="00:00:12.000">氷の上で</p><p begin="00:00:13.000" end="00:00:15.000">滑る練習をする</p></div></body></tt>',
    );
    vi.spyOn(adapter.getSyncEngine(), 'start').mockImplementation(() => {});
    vi.mocked(messageRouter.sendMessage).mockImplementation(async (request: any) => ({
      segments: request.segments.map((segment: any) => ({ id: segment.id, translatedText: `譯:${segment.text}` })),
    }) as any);

    document.dispatchEvent(new CustomEvent(BRIDGE.TRACKS_EVENT, { detail: JSON.stringify({
      source: BRIDGE.MAIN_SOURCE, type: BRIDGE.messageType.TRACKS_UPDATED, revision: 1,
      tracks: [{ trackId: 'ja-track', bcp47: 'ja', url: 'https://example.test/ja.ttml', isCC: false, candidates: [] }],
    }) }));
    await a.aiLoading;
    await Promise.resolve();
    expect(fetchTrack).toHaveBeenCalledWith('https://example.test/ja.ttml');
    expect(adapter.getStateInfo().tracks?.[0].id).toBe('ja-track');
    expect(messageRouter.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'TRANSLATE_REQUEST', sourceLanguage: 'ja',
      segments: [
        expect.objectContaining({ text: '氷の上で' }),
        expect.objectContaining({ text: '滑る練習をする' }),
      ],
    }));
  });

  it('ignores a pending source lookup after stopping and restarting the engine', async () => {
    const a = adapter as any;
    a.isActive = true;
    a.sourceLang = 'auto';
    a.discoveredTracks = [{ id: 'ja', language: 'ja', label: 'Japanese', url: 'https://example.test/ja.ttml' }];
    let resolveLookup!: (value: any) => void;
    vi.mocked(bridgeRequest).mockImplementationOnce(() => new Promise(resolve => { resolveLookup = resolve; }));
    const load = vi.spyOn(a.aiPrefetch, 'load').mockResolvedValue(true);
    const oldLoad = a.startAiPrefetchOrFallback();

    adapter.stop();
    a.isActive = true;
    a.sourceLang = 'ja';
    await a.startAiPrefetchOrFallback();
    expect(load).toHaveBeenCalledTimes(1);

    resolveLookup({ trackId: 'ja' });
    expect(await oldLoad).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['zh-Hant', '翻譯中'],
    ['en', 'Translating…'],
  ])('keeps the source subtitle visible while AI translation is pending (%s)', async (uiLanguage, pendingText) => {
    // Pin the interface locale: caption target language is independent.
    (adapter as any).onSharedSettingsApplied({ uiLanguage });
    let resolveTranslation!: (value: unknown) => void;
    vi.mocked(messageRouter.sendMessage).mockImplementationOnce(
      () => new Promise((resolve) => { resolveTranslation = resolve; }) as any,
    );

    await adapter.start('zh-Hant');
    (adapter as any).learningMode.setEnabled(true);
    const generation = (adapter as any).routeGeneration;
    // fetchAndRenderOverlay normally runs after onNewSubtitleText records the
    // active cue. Mirror that precondition so the stale-response guard accepts
    // the resolved translation instead of intentionally discarding it.
    (adapter as any).lastProcessedText = 'Hello';
    const translationPromise = (adapter as any).fetchAndRenderOverlay('Hello', generation);
    await Promise.resolve();

    const host = document.getElementById('owt-netflix-overlay-host');
    expect(host?.shadowRoot?.textContent).toContain('Hello');
    expect(host?.shadowRoot?.textContent).toContain(pendingText);
    expect(host?.shadowRoot?.querySelector('.owt-token')?.textContent).toBe('Hello');

    resolveTranslation({
      segments: [{ id: 'nf-overlay', translatedText: '你好' }],
    });
    await translationPromise;

    expect(host?.shadowRoot?.textContent).toContain('Hello');
    expect(host?.shadowRoot?.textContent).toContain('你好');
    expect(host?.shadowRoot?.textContent).not.toContain(pendingText);
  });

  it('restores both subtitle lines when learning mode is disabled', async () => {
    await adapter.start('zh-Hant');
    (adapter as any).renderOverlay('Hello', '你好');

    const renderer = adapter.getOverlayRenderer();
    renderer.setLineVisibility({ original: false, translated: false });
    const host = document.getElementById('owt-netflix-overlay-host');
    expect(host?.shadowRoot?.textContent).not.toContain('Hello');
    expect(host?.shadowRoot?.textContent).not.toContain('你好');

    (adapter as any).learningMode.setEnabled(false);

    expect(renderer.getLineVisibility()).toEqual({ original: true, translated: true });
    expect(host?.shadowRoot?.textContent).toContain('Hello');
    expect(host?.shadowRoot?.textContent).toContain('你好');
  });

  it('injects no player button — the popup is the command center', () => {
    adapter.init();
    expect(document.querySelector('.owt-netflix-toggle-btn')).toBeNull();
  });

  it('setActive toggles the engine and getStateInfo exposes the popup surface', async () => {
    adapter.setActive(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((adapter as any).isActive).toBe(true);

    const state = adapter.getStateInfo();
    expect(Array.isArray(state.tracks)).toBe(true);
    expect(typeof state.learningMode).toBe('boolean');

    adapter.setActive(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((adapter as any).isActive).toBe(false);
  });
});

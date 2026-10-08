import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
const mocks = vi.hoisted(() => ({ send: vi.fn(), saveLegacy: vi.fn() }));
vi.mock('@/infrastructure/messaging/message-router', () => ({ messageRouter: { sendMessage: mocks.send } }));
vi.mock('@/infrastructure/storage/extension-storage/settings-storage', () => ({ SettingsStorage: {
  get: vi.fn().mockResolvedValue({ uiLanguage: 'zh-Hant' }), watch: vi.fn(() => () => {}),
} }));
vi.mock('@/core/session/subtitle-session-store', () => ({ globalSubtitleSessionStore: { saveVocabularyCard: mocks.saveLegacy } }));
import { NetflixLearningMode } from '@/adapters/netflix/netflix-learning-mode';
import { SubtitleOverlayRenderer } from '@/shared/ui/subtitle-overlay-renderer';
import { DictionaryPopover } from '@/shared/ui/dictionary-popover';
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { SentenceController } from '@/adapters/sentence-controller';

let mode: NetflixLearningMode;
let renderer: SubtitleOverlayRenderer;
let video: HTMLVideoElement;
const timeline = () => [{ startMs: 1000, endMs: 3000 }, { startMs: 4000, endMs: 6000 }];
beforeEach(() => {
  vi.mocked(SettingsStorage.get).mockResolvedValue({ uiLanguage: 'zh-Hant' } as any);
  vi.mocked(SettingsStorage.watch).mockReturnValue(() => {});
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
  document.body.innerHTML = '<video></video>';
  video = document.querySelector('video')!;
  video.currentTime = 2;
  vi.spyOn(video, 'play').mockResolvedValue();
  vi.spyOn(video, 'pause').mockImplementation(() => {});
  mocks.send.mockReset().mockImplementation(async msg => msg.type === 'ANALYZE_WORD' ? '你好' : { success: true });
  mocks.saveLegacy.mockReset().mockResolvedValue({});
  mode = new NetflixLearningMode({ isActive: () => true, sourceLang: () => 'en', targetLang: () => 'zh-Hant',
    currentVideoId: () => '42', primaryTrackLang: () => 'en', getTimeline: timeline,
    setLineVisibility: () => {}, currentSentence: () => ({ original: 'Hello world', translated: '你好世界' }) });
  renderer = new SubtitleOverlayRenderer('test-overlay');
  renderer.mount(document.body);
});
afterEach(() => { mode.detach(); renderer.destroy(); vi.restoreAllMocks(); });
function renderToken(pending = false) {
  renderer.render('Hello world', pending ? '等待譯文' : '你好世界', { isPending: pending,
    tokens: [{ id: '1', surface: 'Hello', start: 0, end: 5 }] });
  return document.querySelector('#test-overlay')!.shadowRoot!.querySelector<HTMLElement>('.owt-token')!;
}

describe('Netflix word lookup through the rendered subtitle', () => {
  it('works before translation completes and after disabling then enabling again', async () => {
    mode.setEnabled(true);
    const token = renderToken(true);
    token.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true, cancelable: true }));
    expect((document.querySelector('#test-overlay') as HTMLElement).style.cursor).toBe('grab');
    token.click(); await flushPromises();
    expect(document.querySelector('#owt-dictionary-popover')?.textContent).toContain('你好');
    mode.setEnabled(false);
    mode.setEnabled(true);
    renderToken().click(); await flushPromises();
    expect(mocks.send.mock.calls.filter(([m]) => m.type === 'ANALYZE_WORD')).toHaveLength(2);
    video.currentTime = 5;
    (document.querySelector('.owt-dp-save') as HTMLButtonElement).click(); await flushPromises();
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'SAVE_VOCAB_ITEM',
      word: 'Hello', mediaTimestampMs: 1000, contextSentence: 'Hello world' }));
  });
  it('mounts dictionary inside fullscreen and supports keyboard lookup', async () => {
    const fullscreen = document.createElement('section'); document.body.appendChild(fullscreen);
    vi.spyOn(document, 'fullscreenElement', 'get').mockReturnValue(fullscreen);
    mode.setEnabled(true);
    renderToken().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPromises();
    expect(fullscreen.querySelector('#owt-dictionary-popover')).not.toBeNull();
  });
  it('does not report a failed save as saved', async () => {
    mode.setEnabled(true); renderToken().click(); await flushPromises();
    mocks.send.mockResolvedValueOnce({ success: false });
    const button = document.querySelector<HTMLButtonElement>('.owt-dp-save')!;
    button.click(); await flushPromises();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('失敗');
    expect(mocks.saveLegacy).not.toHaveBeenCalled();
  });
});

describe('Dictionary saves only actual lookup results', () => {
  it('waits for lookup, prevents duplicate saves and allows retry on failure', async () => {
    let resolve!: (value: string) => void;
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const popover = new DictionaryPopover({ onLookup: () => new Promise(r => { resolve = r; }), onSave: save });
    popover.show({ surface: 'hello', sentence: 'hello world', clientX: 0, clientY: 0 });
    const button = document.querySelector<HTMLButtonElement>('.owt-dp-save')!;
    button.click(); expect(save).not.toHaveBeenCalled();
    resolve('你好'); await flushPromises();
    button.click(); button.click(); expect(save).toHaveBeenCalledTimes(1);
    await flushPromises(); expect(button.disabled).toBe(false);
    button.click(); await flushPromises();
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ meaning: '你好' }));
    expect(button.disabled).toBe(true);
    popover.dispose();
  });
});

describe('Sentence controls', () => {
  it('navigates fresh timeline snapshots using visible buttons and replays paused media', () => {
    const controller = new SentenceController({ getTimeline: timeline, setLineVisibility: vi.fn(), isAutoPauseEnabled: () => false });
    controller.attach();
    const root = document.querySelector('#owt-learning-controls')!.shadowRoot!;
    (root.querySelector('[data-key="learning.next"]') as HTMLButtonElement).click();
    expect(video.currentTime).toBe(4);
    controller.previousSentence(); expect(video.currentTime).toBe(1);
    expect(video.play).toHaveBeenCalled();
    controller.detach(); expect(document.querySelector('#owt-learning-controls')).toBeNull();
  });
  it('auto pause is independent of lookup and catches a crossed cue boundary', () => {
    let autoPause = false;
    vi.spyOn(video, 'paused', 'get').mockReturnValue(false);
    const controller = new SentenceController({ getTimeline: timeline, setLineVisibility: vi.fn(), isAutoPauseEnabled: () => autoPause });
    controller.attach();
    video.dispatchEvent(new Event('timeupdate')); video.currentTime = 2.9;
    video.dispatchEvent(new Event('timeupdate')); expect(video.pause).not.toHaveBeenCalled();
    autoPause = true; video.currentTime = 2.6; video.dispatchEvent(new Event('timeupdate'));
    video.currentTime = 3.1; video.dispatchEvent(new Event('timeupdate')); expect(video.pause).toHaveBeenCalledTimes(1);
    controller.detach();
  });
});

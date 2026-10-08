import { afterEach, describe, expect, it, vi } from 'vitest';
import { learningSourceUrl, installLearningSourceNavigation } from '@/shared/subtitles/learning-source';
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; history.replaceState(null, '', '/'); });
describe('Saved video source', () => {
  it('preserves exact timestamps and rejects unsafe imported URLs', () => {
    expect(learningSourceUrl({ sourceUrl: 'https://www.netflix.com/watch/42', mediaTimestampMs: 12500 })).toBe('https://www.netflix.com/watch/42#owt-time=12500');
    expect(learningSourceUrl({ sourceUrl: 'javascript:alert(1)' })).toBeNull();
    expect(learningSourceUrl({ sourceUrl: 'https://example.com/article' })).toBe('https://example.com/article');
  });
  it('waits for media, seeks once and pauses for review', () => {
    vi.useFakeTimers(); history.replaceState(null, '', '/watch/42#owt-time=12500');
    const dispose = installLearningSourceNavigation(); vi.advanceTimersByTime(500);
    const video = document.createElement('video'); document.body.appendChild(video);
    Object.defineProperty(video, 'readyState', { value: 1 });
    Object.defineProperty(video, 'duration', { value: 120 });
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
    vi.advanceTimersByTime(250); expect(video.currentTime).toBe(12.5); expect(pause).toHaveBeenCalledTimes(1);
    expect(location.hash).toBe(''); video.currentTime = 20; vi.advanceTimersByTime(1000); expect(video.currentTime).toBe(20);
    dispose();
  });
});

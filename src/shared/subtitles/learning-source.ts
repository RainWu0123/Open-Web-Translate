import type { LearningCard } from '@/core/domain/learning-types';

/** Only open ordinary web URLs saved with a card. Never trust imported schemes. */
export function learningSourceUrl(card: Pick<LearningCard, 'sourceUrl' | 'mediaTimestampMs'>): string | null {
  if (!card.sourceUrl) return null;
  try {
    const url = new URL(card.sourceUrl);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const ms = card.mediaTimestampMs;
    if (ms !== undefined && Number.isFinite(ms) && ms >= 0 &&
        (/^(www\.)?netflix\.com$/.test(url.hostname) && /^\/watch\/\d+/.test(url.pathname) ||
         /^(www\.|m\.)?youtube\.com$/.test(url.hostname) && url.pathname === '/watch')) {
      url.hash = 'owt-time=' + Math.round(ms);
    }
    return url.href;
  } catch { return null; }
}

/** A review link requests a single seek, after the player has loaded its media. */
export function installLearningSourceNavigation(): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  const start = () => {
    if (timer) clearInterval(timer);
    const match = /^#owt-time=(\d+)$/.exec(location.hash);
    if (!match) return;
    const requestedUrl = location.href;
    const seconds = Number(match[1]) / 1000;
    if (!Number.isFinite(seconds)) return;
    const deadline = Date.now() + 60000;
    timer = setInterval(() => {
      if (location.href !== requestedUrl || Date.now() > deadline) {
        clearInterval(timer); return;
      }
      const video = document.querySelector('video');
      if (!video || video.readyState < 1 || !Number.isFinite(video.duration) || video.duration <= seconds) return;
      try {
        video.currentTime = seconds;
        video.pause();
        const url = new URL(location.href);
        url.hash = '';
        history.replaceState(history.state, '', url.href);
        clearInterval(timer);
      } catch { /* The media element may still be changing its source. */ }
    }, 250);
  };
  window.addEventListener('hashchange', start);
  start();
  return () => { clearInterval(timer); window.removeEventListener('hashchange', start); };
}

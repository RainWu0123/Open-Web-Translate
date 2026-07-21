export default defineContentScript({
  matches: ['*://*.netflix.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    console.log('[OWT-MAIN] Netflix MAIN world script loaded');

    function extractSubtitleTracks() {
      try {
        const netflix = (window as any).netflix;
        const api = netflix?.appContext?.state?.playerApp?.getAPI();
        if (!api) return [];

        const videoPlayer = api.videoPlayer;
        const sessionIds = videoPlayer.getAllPlayerSessionIds();
        if (sessionIds.length === 0) return [];

        const player = videoPlayer.getVideoPlayerBySessionId(sessionIds[0]);
        const tracks = player.getTimedTextTrackList();
        if (!Array.isArray(tracks)) return [];

        const result: Array<{ id: string; label: string; language: string; url: string; isCC: boolean }> = [];
        for (const t of tracks) {
          const urlObj = t.urls?.[0] || t.rawTrack?.urls?.[0];
          const url = t.cdnUri || (typeof urlObj === 'string' ? urlObj : urlObj?.url) || '';
          if (!url) continue;

          const trackId = t.trackId || t.id || url;
          if (!result.some(r => r.id === trackId)) {
            result.push({
              id: trackId,
              label: t.languageDescription || t.label || t.rawTrack?.languageDescription || 'Unknown Track',
              language: t.language || t.languageCode || 'unknown',
              url: url,
              isCC: !!(t.isClosedCaptions || t.isCC || t.rawTrack?.isClosedCaptions),
            });
          }
        }
        return result;
      } catch (err) {
        return [];
      }
    }

    // Broadcast track list to ISOLATED content script via window.postMessage
    let lastTrackCount = -1;
    setInterval(() => {
      const tracks = extractSubtitleTracks();
      if (tracks.length !== lastTrackCount) {
        lastTrackCount = tracks.length;
        window.postMessage({ type: 'OWT_NETFLIX_TRACKS_DISCOVERED', tracks }, '*');
      }
    }, 1500);
  },
});

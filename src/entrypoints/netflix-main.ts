export default defineContentScript({
  matches: ['*://*.netflix.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    console.log('[OWT-MAIN] Netflix MAIN world script loaded');

    function getNetflixRoot() {
      try {
        const netflix = (window as any).netflix;
        if (!netflix) return null;
        return netflix.appContext?.state?.playerApp || null;
      } catch {
        return null;
      }
    }

    function extractSubtitleTracks() {
      const root = getNetflixRoot();
      if (!root) return [];

      const tracks: Array<{ id: string; label: string; language: string; url: string; isCC: boolean }> = [];
      const seen = new WeakSet<object>();
      const stack: { node: any; depth: number }[] = [{ node: root, depth: 0 }];

      while (stack.length > 0) {
        const { node, depth } = stack.pop()!;
        if (!node || typeof node !== 'object' || depth > 25 || seen.has(node)) continue;
        seen.add(node);

        if (node instanceof ArrayBuffer || ArrayBuffer.isView(node)) continue;

        try {
          // Netflix timedtext track definition structure
          if (
            (node.type === 'timedtext' || node.mediaType === 'subtitles' || node.trackType === 'PRIMARY' || node.isTimedText) &&
            Array.isArray(node.urls) &&
            node.urls.length > 0 &&
            typeof node.urls[0]?.url === 'string'
          ) {
            const trackId = node.trackId || node.id || node.urls[0].url;
            if (!tracks.some(t => t.id === trackId)) {
              tracks.push({
                id: trackId,
                label: node.label || node.languageDescription || node.language || 'Unknown Track',
                language: node.language || 'unknown',
                url: node.urls[0].url,
                isCC: !!node.isClosedCaption,
              });
            }
          }
        } catch {
          // Ignore
        }

        for (const key of Object.keys(node)) {
          try {
            const child = node[key];
            if (child && typeof child === 'object') {
              stack.push({ node: child, depth: depth + 1 });
            }
          } catch {
            // Ignore
          }
        }
      }

      return tracks;
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

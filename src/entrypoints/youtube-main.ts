/**
 * youtube-main — MAIN-world entrypoint for YouTube player control.
 *
 * Interacts directly with the YouTube HTML5 video player (#movie_player)
 * in the page context to discover native caption tracks and switch language
 * without relying on UI clicks.
 */
import { YT_BRIDGE, postToContent, type YouTubeTrack } from '@/adapters/youtube/youtube-bridge';

export default defineUnlistedScript({
  main() {
    function getPlayer(): any {
      return (
        document.getElementById('movie_player') ||
        document.querySelector('.html5-video-player') ||
        (window as any).movie_player
      );
    }

    function getTracklist(): YouTubeTrack[] {
      try {
        const player = getPlayer();
        if (!player || typeof player.getOption !== 'function') return [];
        player.loadModule?.('captions');
        const list = player.getOption('captions', 'tracklist') || [];
        return list.map((t: any, idx: number) => ({
          id: t.languageCode || t.vss_id || String(idx),
          languageCode: t.languageCode,
          label: t.languageName || t.displayName || t.name || t.languageCode,
          kind: t.kind,
          isDefault: Boolean(t.is_default),
        }));
      } catch {
        return [];
      }
    }

    function getActiveTrack(): string | null {
      try {
        const player = getPlayer();
        if (!player || typeof player.getOption !== 'function') return null;
        const current = player.getOption('captions', 'track');
        return current?.languageCode || null;
      } catch {
        return null;
      }
    }

    function findOriginalTrack(list: any[], targetLang?: string): any {
      if (!list || list.length === 0) return null;

      const targetPrefix = targetLang?.split('-')[0]?.toLowerCase();

      // 1. YouTube marks the uploader's original default track with is_default: true
      const defaultNonAsr = list.find((t: any) => t.is_default && t.kind !== 'asr');
      if (defaultNonAsr) {
        // If targetLang is specified, and defaultNonAsr matches targetLang, but other author-uploaded non-target tracks exist:
        if (targetPrefix && defaultNonAsr.languageCode?.toLowerCase().startsWith(targetPrefix)) {
          const nonTargetAuthor = list.find(
            (t: any) => t.kind !== 'asr' && !t.languageCode?.toLowerCase().startsWith(targetPrefix),
          );
          if (nonTargetAuthor) return nonTargetAuthor;
        }
        return defaultNonAsr;
      }

      // 2. Author-uploaded tracks (kind !== 'asr'):
      // Prioritize tracks that do NOT match targetLang (because targetLang is the translation destination)
      const authorTracks = list.filter((t: any) => t.kind !== 'asr');
      if (authorTracks.length > 0) {
        if (targetPrefix) {
          const nonTargetAuthor = authorTracks.find(
            (t: any) => !t.languageCode?.toLowerCase().startsWith(targetPrefix),
          );
          if (nonTargetAuthor) return nonTargetAuthor;
        }
        return authorTracks[0];
      }

      // 3. ASR tracks: prioritize non-target language if available
      if (targetPrefix) {
        const nonTargetAsr = list.find((t: any) => !t.languageCode?.toLowerCase().startsWith(targetPrefix));
        if (nonTargetAsr) return nonTargetAsr;
      }

      const anyDefault = list.find((t: any) => t.is_default);
      if (anyDefault) return anyDefault;

      // 4. Fallback to first track in list
      return list[0];
    }

    function setTrack(languageCode: string, targetLanguage?: string): boolean {
      try {
        const player = getPlayer();
        if (!player || typeof player.setOption !== 'function') return false;
        player.loadModule?.('captions');

        // Aggressively turn off YouTube auto-translation so YouTube does not translate captions into user UI language
        try {
          player.setOption('captions', 'translationLanguage', null);
          player.setOption('captions', 'translationLanguage', {});
          player.setOption('captions', 'translationLanguages', []);
        } catch {}

        const list = player.getOption('captions', 'tracklist') || [];

        if (!languageCode || languageCode === 'auto') {
          // Find first native original track
          const preferred = findOriginalTrack(list, targetLanguage);
          if (preferred) {
            player.setOption('captions', 'track', preferred);
            return true;
          }
          return false;
        }

        const match = list.find(
          (t: any) =>
            t.languageCode === languageCode ||
            t.languageCode?.startsWith(languageCode) ||
            t.vss_id?.includes(languageCode),
        );
        if (match) {
          player.setOption('captions', 'track', match);
          return true;
        } else {
          // Fallback to original track if exact requested language is not in tracklist
          const fallback = findOriginalTrack(list, targetLanguage);
          if (fallback) {
            player.setOption('captions', 'track', fallback);
            return true;
          }
          player.setOption('captions', 'track', { languageCode });
          return true;
        }
      } catch {
        return false;
      }
    }

    function broadcastTracks() {
      const tracks = getTracklist();
      const current = getActiveTrack();
      postToContent(YT_BRIDGE.messageType.TRACKS_UPDATED, {
        tracks,
        selectedTrackId: current,
      });
    }

    const handleCommand = (data: any) => {
      if (!data || data.source !== YT_BRIDGE.CONTENT_SOURCE) return;

      if (data.type === YT_BRIDGE.messageType.REQUEST_TRACKS) {
        broadcastTracks();
      } else if (data.type === YT_BRIDGE.messageType.SET_TRACK) {
        const ok = setTrack(data.languageCode, data.targetLanguage);
        broadcastTracks();
        postToContent(YT_BRIDGE.messageType.TRACK_SET_RESULT, {
          ok,
          languageCode: data.languageCode,
        });
      }
    };

    window.addEventListener('message', (event) => {
      handleCommand(event.data);
    });

    window.addEventListener(YT_BRIDGE.MAIN_EVENT, (event: any) => {
      try {
        const data = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
        handleCommand(data);
      } catch {}
    });

    function ensureTracksDiscovered(retries = 6, delay = 500) {
      const tracks = getTracklist();
      if (tracks.length > 0) {
        broadcastTracks();
      } else if (retries > 0) {
        setTimeout(() => ensureTracksDiscovered(retries - 1, delay * 1.3), delay);
      }
    }

    // Handle SPA navigation on YouTube
    window.addEventListener('yt-navigate-finish', () => {
      ensureTracksDiscovered();
    });

    // Initial boot discovery
    ensureTracksDiscovered();
  },
});

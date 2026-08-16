/**
 * Netflix learning mode — the Language Reactor loop's wiring.
 *
 * Owns the SentenceController (hotkeys, auto-pause, line toggles) and the
 * DictionaryPopover (token clicks, gloss, vocabulary saving). The adapter
 * supplies state through the host interface; this module owns lifecycle.
 *
 * Interface: setEnabled · attach · detach · setTimelineChanged hook via host.
 */
import { SentenceController, type SentenceTimelineEntry } from '@/adapters/sentence-controller';
import { DictionaryPopover } from '@/shared/ui/dictionary-popover';
import { messageRouter } from '@/infrastructure/messaging/message-router';
import { globalSubtitleSessionStore } from '@/core/session/subtitle-session-store';

export interface LearningModeHost {
  isActive(): boolean;
  targetLang(): string;
  currentVideoId(): string;
  /** Language of the dual-mode primary track, 'auto' otherwise. */
  primaryTrackLang(): string;
  getTimeline(): SentenceTimelineEntry[];
  setLineVisibility(visible: { original?: boolean; translated?: boolean }): void;
  currentSentence(): { original: string; translated: string } | null;
}

export class NetflixLearningMode {
  private enabled = true;
  private controller: SentenceController | null = null;
  private popover: DictionaryPopover | null = null;

  constructor(private host: LearningModeHost) {}

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.attach();
    } else {
      this.detach();
    }
  }

  public attach(): void {
    if (!this.enabled || !this.host.isActive()) return;

    if (!this.controller) {
      this.controller = new SentenceController({
        getTimeline: () => this.host.getTimeline(),
        setLineVisibility: (visible) => this.host.setLineVisibility(visible),
        isAutoPauseEnabled: () => this.enabled,
      });
    }
    this.controller.attach();

    if (!this.popover) {
      this.popover = new DictionaryPopover({
        onLookup: async (surface) => {
          const response = await messageRouter.sendMessage({
            type: 'TRANSLATE_REQUEST',
            segments: [{ id: 'dict-gloss', text: surface }],
            sourceLanguage: 'auto',
            targetLanguage: this.host.targetLang(),
          });
          return response?.segments?.[0]?.translatedText || '';
        },
        onSave: async (entry) => {
          await globalSubtitleSessionStore.saveVocabularyCard({
            language: this.host.primaryTrackLang(),
            lemma: entry.surface,
            surface: entry.surface,
            example: {
              text: entry.sentence,
              translation: entry.sentenceTranslation,
              episodeId: this.host.currentVideoId() || '',
              cueStartMs: 0,
            },
          });
        },
      });
      document.addEventListener('owt-token-clicked', this.onTokenClicked);
    }
  }

  public detach(): void {
    this.controller?.detach();
    this.popover?.hide();
    document.removeEventListener('owt-token-clicked', this.onTokenClicked);
  }

  public notifyTimelineChanged(): void {
    this.controller?.setTimeline();
  }

  private onTokenClicked = (event: Event): void => {
    const detail = (event as CustomEvent).detail as {
      tokenId: string;
      surface: string;
      clientX: number;
      clientY: number;
    };
    if (!detail?.surface) return;
    const sentence = this.host.currentSentence();
    this.popover?.show({
      surface: detail.surface,
      sentence: sentence?.original ?? '',
      sentenceTranslation: sentence?.translated ?? undefined,
      clientX: detail.clientX,
      clientY: detail.clientY,
    });
  };
}

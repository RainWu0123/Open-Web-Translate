/**
 * Shared base for site caption adapters (Netflix / YouTube).
 *
 * Owns everything the two adapters duplicate: display settings state, the
 * toggle→GET_SETTINGS→start() flow, SettingsStorage sync, mousemove-throttled
 * button re-injection, and SPA navigation guards with generation-based cache
 * invalidation. Site-specific DOM work stays in the subclasses.
 */
import { SettingsStorage } from '@/infrastructure/storage/extension-storage/settings-storage';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import type { ExtensionSettings } from '@/core/contracts/messages';
import { createLogger } from '@/shared/logger';

/** Single source of caption defaults: DEFAULT_SETTINGS (?? satisfies the optional field types). */
export const DEFAULT_CAPTION_SETTINGS = {
  targetLanguage: DEFAULT_SETTINGS.targetLanguage,
  displayMode: DEFAULT_SETTINGS.displayMode ?? 'bilingual',
  subtitleOriginalFontSize: DEFAULT_SETTINGS.subtitleOriginalFontSize ?? 18,
  subtitleTranslatedFontSize: DEFAULT_SETTINGS.subtitleTranslatedFontSize ?? 22,
  subtitleOriginalColor: DEFAULT_SETTINGS.subtitleOriginalColor ?? '#ffffff',
  subtitleTranslatedColor: DEFAULT_SETTINGS.subtitleTranslatedColor ?? '#818cf8',
} as const;

export abstract class CaptionAdapterBase {
  protected logger = createLogger(this.constructor.name);

  protected isActive = false;
  protected debounceTimer: ReturnType<typeof setTimeout> | null = null;
  protected lastMouseMoveTime = 0;

  protected targetLang: string = DEFAULT_CAPTION_SETTINGS.targetLanguage;
  protected displayMode: string = DEFAULT_CAPTION_SETTINGS.displayMode;
  protected subtitleOriginalFontSize: number = DEFAULT_CAPTION_SETTINGS.subtitleOriginalFontSize;
  protected subtitleTranslatedFontSize: number = DEFAULT_CAPTION_SETTINGS.subtitleTranslatedFontSize;
  protected subtitleOriginalColor: string = DEFAULT_CAPTION_SETTINGS.subtitleOriginalColor;
  protected subtitleTranslatedColor: string = DEFAULT_CAPTION_SETTINGS.subtitleTranslatedColor;

  protected routeGeneration = 0;
  protected currentVideoId: string | null = null;
  protected inlineTranslationCache = new Map<string, string>();

  /** Applies shared ExtensionSettings fields onto adapter state. */
  protected applySharedSettings(settings: Partial<ExtensionSettings> | null | undefined): void {
    if (!settings) return;
    if (settings.targetLanguage) this.targetLang = settings.targetLanguage;
    if (settings.displayMode) this.displayMode = settings.displayMode;
    if (settings.subtitleOriginalFontSize) this.subtitleOriginalFontSize = settings.subtitleOriginalFontSize;
    if (settings.subtitleTranslatedFontSize) this.subtitleTranslatedFontSize = settings.subtitleTranslatedFontSize;
    if (settings.subtitleOriginalColor) this.subtitleOriginalColor = settings.subtitleOriginalColor;
    if (settings.subtitleTranslatedColor) this.subtitleTranslatedColor = settings.subtitleTranslatedColor;
  }

  /** Loads settings once at init; subclasses call this from init(). */
  protected loadInitialSettings(): void {
    Promise.resolve(SettingsStorage.get())
      .then((settings) => {
        this.applySharedSettings(settings);
        this.onSharedSettingsApplied(settings);
      })
      .catch(() => {});
  }

  /** Subscribes to settings changes; reprocesses captions while active. */
  protected setupSettingsListener(): void {
    try {
      SettingsStorage.watch((newSettings) => {
        this.applySharedSettings(newSettings);
        if (this.isActive) {
          this.onSharedSettingsApplied(newSettings);
          this.processCaptions();
        }
      });
    } catch {
      // Ignore if storage listener unavailable
    }
  }

  /** Hook fired when settings changed while active. */
  protected onSharedSettingsApplied(_settings: ExtensionSettings): void {}

  /** Shared toggle flow: fetch settings, then start (or stop when active). */
  protected async handleToggleClick(): Promise<void> {
    if (this.isActive) {
      this.stop();
      return;
    }

    try {
      const settings = await Promise.resolve(SettingsStorage.get()).catch(() => null);
      await this.start(
        settings?.targetLanguage || DEFAULT_CAPTION_SETTINGS.targetLanguage,
        settings?.displayMode || DEFAULT_CAPTION_SETTINGS.displayMode,
        settings?.subtitleOriginalFontSize || DEFAULT_CAPTION_SETTINGS.subtitleOriginalFontSize,
        settings?.subtitleTranslatedFontSize || DEFAULT_CAPTION_SETTINGS.subtitleTranslatedFontSize,
        settings?.subtitleOriginalColor || DEFAULT_CAPTION_SETTINGS.subtitleOriginalColor,
        settings?.subtitleTranslatedColor || DEFAULT_CAPTION_SETTINGS.subtitleTranslatedColor,
      );
    } catch {
      await this.start(
        DEFAULT_CAPTION_SETTINGS.targetLanguage,
        DEFAULT_CAPTION_SETTINGS.displayMode,
        DEFAULT_CAPTION_SETTINGS.subtitleOriginalFontSize,
        DEFAULT_CAPTION_SETTINGS.subtitleTranslatedFontSize,
        DEFAULT_CAPTION_SETTINGS.subtitleOriginalColor,
        DEFAULT_CAPTION_SETTINGS.subtitleTranslatedColor,
      );
    }
  }

  /**
   * Registers a throttled mousemove listener (controls visibility toggles on
   * both sites and can remove our injected button).
   */
  protected setupMouseMoveInjectionListener(throttleMs: number, onMove: () => void): void {
    if (typeof window === 'undefined') return;
    window.addEventListener(
      'mousemove',
      () => {
        const now = Date.now();
        if (now - this.lastMouseMoveTime < throttleMs) return;
        this.lastMouseMoveTime = now;
        onMove();
      },
      { passive: true },
    );
  }

  /**
   * Creates a navigation handler that detects URL changes, bumps the route
   * generation when the video changes, and re-injects the controls button.
   */
  protected createNavigationHandler(getVideoId: () => string | null): () => void {
    let lastUrl = window.location.href;
    return () => {
      const currentUrl = window.location.href;
      if (currentUrl === lastUrl) return;
      lastUrl = currentUrl;

      const newVideoId = getVideoId();
      if (newVideoId !== this.currentVideoId) {
        this.currentVideoId = newVideoId;
        this.routeGeneration += 1;
        this.inlineTranslationCache.clear();
        this.onVideoChanged();
      }
      this.injectControlsButton();
    };
  }

  protected clearDebounceTimer(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /** Site-specific reset when the user navigates to a different video. */
  protected abstract onVideoChanged(): void;

  abstract start(
    targetLang?: string,
    displayMode?: string,
    origSize?: number,
    transSize?: number,
    origColor?: string,
    transColor?: string,
  ): Promise<void>;

  abstract stop(): void;

  abstract injectControlsButton(): void;

  abstract processCaptions(): void;
}

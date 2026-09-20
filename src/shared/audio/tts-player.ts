/**
 * Web Speech API TTS Player
 *
 * Provides native text-to-speech audio pronunciation for language learning
 * with zero external API dependencies and zero latency.
 */

export interface TtsOptions {
  rate?: number; // 0.1 to 10, default 1.0 (or 0.85 for language learning)
  pitch?: number; // 0 to 2, default 1.0
  volume?: number; // 0 to 1, default 1.0
}

export class TtsPlayer {
  private static instance: TtsPlayer;

  public static getInstance(): TtsPlayer {
    if (!TtsPlayer.instance) {
      TtsPlayer.instance = new TtsPlayer();
    }
    return TtsPlayer.instance;
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  public normalizeLangCode(lang: string): string {
    const code = lang.toLowerCase();
    if (code.startsWith('ja')) return 'ja-JP';
    if (code.startsWith('en')) return 'en-US';
    if (code.startsWith('zh-tw') || code.startsWith('zh-hant')) return 'zh-TW';
    if (code.startsWith('zh-cn') || code.startsWith('zh-hans') || code === 'zh') return 'zh-CN';
    if (code.startsWith('ko')) return 'ko-KR';
    if (code.startsWith('es')) return 'es-ES';
    if (code.startsWith('fr')) return 'fr-FR';
    if (code.startsWith('de')) return 'de-DE';
    return lang;
  }

  public stop(): void {
    if (this.isSupported()) {
      window.speechSynthesis.cancel();
    }
  }

  public speak(text: string, lang: string = 'en', options: TtsOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isSupported()) {
        resolve();
        return;
      }

      this.stop();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.normalizeLangCode(lang);
      utterance.rate = options.rate ?? 0.9; // slightly slower by default for clear pronunciation
      utterance.pitch = options.pitch ?? 1.0;
      utterance.volume = options.volume ?? 1.0;

      utterance.onend = () => resolve();
      utterance.onerror = (e) => {
        // Canceled is normal when user clicks another word quickly
        if (e.error === 'canceled' || e.error === 'interrupted') {
          resolve();
        } else {
          reject(new Error(`TTS Error: ${e.error}`));
        }
      };

      window.speechSynthesis.speak(utterance);
    });
  }
}

export const ttsPlayer = TtsPlayer.getInstance();

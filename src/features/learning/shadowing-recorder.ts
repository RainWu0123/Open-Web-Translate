/**
 * Shadowing Recorder & Evaluator
 *
 * Employs browser native SpeechRecognition to record user speech during
 * video subtitle pauses or webpage practice, comparing speech to the
 * expected sentence using Levenshtein distance for real-time pronunciation feedback.
 */

export interface ShadowingEvaluation {
  expected: string;
  transcript: string;
  accuracy: number; // 0 to 100%
  rating: 'excellent' | 'good' | 'retry';
  feedback: string;
}

export class ShadowingRecorder {
  private recognition: any = null;

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition,
    );
  }

  /**
   * Normalizes text for fair phonetic/speech comparison:
   * lowercases, removes punctuation, trims spaces.
   */
  public normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'，。！？、“”‘’（）—–「」『』【】〔〕]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculates similarity percentage (0-100) between spoken transcript and expected text.
   */
  public calculateSimilarity(spoken: string, expected: string): number {
    const s1 = this.normalizeText(spoken);
    const s2 = this.normalizeText(expected);

    if (s1 === s2) return 100;
    if (!s1 || !s2) return 0;

    const len1 = s1.length;
    const len2 = s2.length;
    const maxLen = Math.max(len1, len2);

    // Levenshtein matrix
    const matrix: number[][] = Array.from({ length: len1 + 1 }, () =>
      Array(len2 + 1).fill(0),
    );

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost, // substitution
        );
      }
    }

    const distance = matrix[len1][len2];
    const similarity = Math.max(0, Math.round((1 - distance / maxLen) * 100));
    return similarity;
  }

  /**
   * Evaluates spoken text against expected sentence and generates qualitative rating.
   */
  public evaluate(spoken: string, expected: string): ShadowingEvaluation {
    const accuracy = this.calculateSimilarity(spoken, expected);
    let rating: 'excellent' | 'good' | 'retry' = 'retry';
    let feedback = '發音與文本落差較大，建議再試一次！';

    if (accuracy >= 85) {
      rating = 'excellent';
      feedback = '完美跟讀！發音與語調非常精確！';
    } else if (accuracy >= 65) {
      rating = 'good';
      feedback = '表現良好！大部分詞彙發音正確。';
    }

    return {
      expected,
      transcript: spoken,
      accuracy,
      rating,
      feedback,
    };
  }

  /**
   * Listens to the user's microphone using Web Speech API and resolves with the evaluation.
   */
  public recordAndEvaluate(
    expectedSentence: string,
    lang: string = 'en',
    timeoutMs: number = 8000,
  ): Promise<ShadowingEvaluation> {
    return new Promise((resolve, reject) => {
      if (!this.isSupported()) {
        reject(new Error('SpeechRecognition is not supported in this browser.'));
        return;
      }

      const SpeechRec =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SpeechRec();
      this.recognition = rec;

      rec.lang = lang;
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      let recognizedText = '';
      let timer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        try {
          rec.stop();
        } catch {}
      };

      timer = setTimeout(() => {
        cleanup();
        resolve(this.evaluate(recognizedText, expectedSentence));
      }, timeoutMs);

      rec.onresult = (event: any) => {
        if (event.results && event.results[0] && event.results[0][0]) {
          recognizedText = event.results[0][0].transcript;
        }
      };

      rec.onerror = (e: any) => {
        cleanup();
        if (recognizedText) {
          resolve(this.evaluate(recognizedText, expectedSentence));
        } else {
          reject(new Error(`Speech recognition error: ${e.error}`));
        }
      };

      rec.onend = () => {
        cleanup();
        resolve(this.evaluate(recognizedText, expectedSentence));
      };

      try {
        rec.start();
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }
}

export const shadowingRecorder = new ShadowingRecorder();

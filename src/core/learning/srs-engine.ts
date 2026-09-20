/**
 * SuperMemo SM-2 Spaced Repetition System (SRS) Engine
 *
 * Computes review intervals, repetition counts, and ease factors
 * to optimize memory retention for vocabulary cards.
 */
import type { SrsState, SrsGrade } from '@/core/domain/learning-types';

export const DEFAULT_EASE_FACTOR = 2.5;
export const MIN_EASE_FACTOR = 1.3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class SrsEngine {
  /**
   * Generates the initial SRS state for a newly created card.
   */
  public static createInitialState(now: number = Date.now()): SrsState {
    return {
      interval: 0,
      repetition: 0,
      easeFactor: DEFAULT_EASE_FACTOR,
      nextReviewDate: now, // Due immediately for initial learning
      history: [],
    };
  }

  /**
   * Calculates the next SRS state given the user's recall grade.
   *
   * @param currentState Current SRS state of the card
   * @param grade Recall quality: 'again' | 'hard' | 'good' | 'easy'
   * @param now Current timestamp in ms (defaults to Date.now())
   */
  public static calculateNextState(
    currentState: SrsState,
    grade: SrsGrade,
    now: number = Date.now(),
  ): SrsState {
    let { interval, repetition, easeFactor } = currentState;
    const history = [...(currentState.history || [])];

    switch (grade) {
      case 'again': {
        // Forgotten: reset repetition, due tomorrow (1 day)
        repetition = 0;
        interval = 1;
        easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.2);
        break;
      }
      case 'hard': {
        // Struggled to recall: small interval progression, reduce EF slightly
        repetition = Math.max(1, repetition);
        interval = interval <= 1 ? 1 : Math.max(1, Math.round(interval * 1.2));
        easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.15);
        break;
      }
      case 'good': {
        // Successful recall: standard SM-2 intervals (1 -> 6 -> interval * EF)
        if (repetition === 0) {
          interval = 1;
        } else if (repetition === 1) {
          interval = 6;
        } else {
          interval = Math.max(1, Math.round(interval * easeFactor));
        }
        repetition += 1;
        break;
      }
      case 'easy': {
        // Effortless recall: longer interval progression, increase EF
        if (repetition === 0) {
          interval = 4;
        } else if (repetition === 1) {
          interval = 8;
        } else {
          interval = Math.max(1, Math.round(interval * easeFactor * 1.3));
        }
        repetition += 1;
        easeFactor = Math.min(3.5, easeFactor + 0.15);
        break;
      }
    }

    const nextReviewDate = now + interval * MS_PER_DAY;
    history.push({
      date: now,
      grade,
      interval,
    });

    return {
      interval,
      repetition,
      easeFactor: Number(easeFactor.toFixed(2)),
      nextReviewDate,
      lastReviewDate: now,
      history,
    };
  }

  /**
   * Determines whether a card is currently due for review.
   */
  public static isDue(state: SrsState, now: number = Date.now()): boolean {
    return state.nextReviewDate <= now;
  }
}

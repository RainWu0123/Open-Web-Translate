import { describe, it, expect } from 'vitest';
import { SrsEngine, DEFAULT_EASE_FACTOR, MIN_EASE_FACTOR } from '../../src/core/learning/srs-engine';

describe('SrsEngine Unit Tests (SM-2)', () => {
  const baseTime = 1718000000000;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  it('creates initial state correctly', () => {
    const init = SrsEngine.createInitialState(baseTime);
    expect(init.interval).toBe(0);
    expect(init.repetition).toBe(0);
    expect(init.easeFactor).toBe(DEFAULT_EASE_FACTOR);
    expect(init.nextReviewDate).toBe(baseTime);
    expect(SrsEngine.isDue(init, baseTime)).toBe(true);
  });

  it('handles "again" grade: resets repetition to 0 and interval to 1 day', () => {
    const current = {
      interval: 15,
      repetition: 4,
      easeFactor: 2.5,
      nextReviewDate: baseTime,
    };

    const next = SrsEngine.calculateNextState(current, 'again', baseTime);
    expect(next.interval).toBe(1);
    expect(next.repetition).toBe(0);
    expect(next.easeFactor).toBe(2.3);
    expect(next.nextReviewDate).toBe(baseTime + ONE_DAY);
    expect(next.lastReviewDate).toBe(baseTime);
    expect(next.history?.length).toBe(1);
  });

  it('enforces MIN_EASE_FACTOR on repeated "again" grades', () => {
    let state = {
      interval: 5,
      repetition: 2,
      easeFactor: 1.4,
      nextReviewDate: baseTime,
    };

    state = SrsEngine.calculateNextState(state, 'again', baseTime);
    expect(state.easeFactor).toBe(MIN_EASE_FACTOR);

    state = SrsEngine.calculateNextState(state, 'again', baseTime);
    expect(state.easeFactor).toBe(MIN_EASE_FACTOR);
  });

  it('handles "good" grade progression (1 -> 6 -> interval * EF)', () => {
    let state = SrsEngine.createInitialState(baseTime);

    // 1st good review
    state = SrsEngine.calculateNextState(state, 'good', baseTime);
    expect(state.interval).toBe(1);
    expect(state.repetition).toBe(1);
    expect(state.nextReviewDate).toBe(baseTime + ONE_DAY);

    // 2nd good review
    state = SrsEngine.calculateNextState(state, 'good', baseTime + ONE_DAY);
    expect(state.interval).toBe(6);
    expect(state.repetition).toBe(2);

    // 3rd good review: 6 * 2.5 = 15
    state = SrsEngine.calculateNextState(state, 'good', baseTime + ONE_DAY * 7);
    expect(state.interval).toBe(15);
    expect(state.repetition).toBe(3);
  });

  it('handles "easy" grade: boosts interval and increases easeFactor', () => {
    const init = SrsEngine.createInitialState(baseTime);
    const next = SrsEngine.calculateNextState(init, 'easy', baseTime);

    expect(next.interval).toBe(4);
    expect(next.repetition).toBe(1);
    expect(next.easeFactor).toBe(2.65);
    expect(next.nextReviewDate).toBe(baseTime + 4 * ONE_DAY);
  });

  it('correctly reports isDue based on timestamp', () => {
    const state = {
      interval: 2,
      repetition: 1,
      easeFactor: 2.5,
      nextReviewDate: baseTime + 2 * ONE_DAY,
    };

    expect(SrsEngine.isDue(state, baseTime + ONE_DAY)).toBe(false);
    expect(SrsEngine.isDue(state, baseTime + 2 * ONE_DAY)).toBe(true);
    expect(SrsEngine.isDue(state, baseTime + 3 * ONE_DAY)).toBe(true);
  });
});

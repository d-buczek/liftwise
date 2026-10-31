import { describe, expect, it } from 'vite-plus/test';
import { isDoneSet, isWorkingSet, roundWeightKg, weightStepKg } from './conventions';

describe('set conventions', () => {
  it('counts only done sets', () => {
    expect(isDoneSet({ status: 'done' })).toBe(true);
    expect(isDoneSet({ status: 'planned' })).toBe(false);
  });

  it('treats done non-warm-up sets as working sets', () => {
    expect(isWorkingSet({ status: 'done', warmup: false })).toBe(true);
    expect(isWorkingSet({ status: 'done', warmup: true })).toBe(false);
    expect(isWorkingSet({ status: 'planned', warmup: false })).toBe(false);
  });
});

describe('weight conventions', () => {
  it('takes the exercise step over the setting', () => {
    const training = { weight_step_kg: 1.25 };
    expect(weightStepKg({ weight_step_kg: 2.5 }, training)).toBe(2.5);
    expect(weightStepKg({ weight_step_kg: null }, training)).toBe(1.25);
    expect(weightStepKg(undefined, training)).toBe(1.25);
  });

  it('rounds to the weight precision', () => {
    expect(roundWeightKg(21.6)).toBe(21.5);
    expect(roundWeightKg(24 - 2 * 1.25)).toBe(21.5);
    expect(roundWeightKg(0.1 + 0.2)).toBe(0.25);
  });
});

import { RIR_MAX, type Range } from '@liftwise/core';

// Controls of the training settings and of an exercise's card (§5.2, §5.3).

export const REST_STEP_S = 15;
export const WEIGHT_STEPS_KG = [0.5, 1, 1.25, 2, 2.5];

// A rest by ±15 s; 0 means no timer.
export function stepRest(seconds: number, direction: 1 | -1): number {
  return Math.max(0, seconds + direction * REST_STEP_S);
}

// The highest weekly hard sets a balance target can reach (§5.8).
export const BALANCE_SETS_MAX = 40;

// A bound of a range within 0–`limit`; moving one past the other takes it along.
function stepRange(range: Range, bound: 'min' | 'max', direction: 1 | -1, limit: number): Range {
  const value = Math.min(limit, Math.max(0, range[bound] + direction));
  return bound === 'min'
    ? { min: value, max: Math.max(range.max, value) }
    : { min: Math.min(range.min, value), max: value };
}

// A bound of the target RIR within 0–4 (4 = "4+").
export function stepRirRange(range: Range, bound: 'min' | 'max', direction: 1 | -1): Range {
  return stepRange(range, bound, direction, RIR_MAX);
}

// A bound of a muscle group's weekly hard-set target.
export function stepBalanceRange(range: Range, bound: 'min' | 'max', direction: 1 | -1): Range {
  return stepRange(range, bound, direction, BALANCE_SETS_MAX);
}

// The weight steps to choose from: the common ones and the current one.
export function weightStepOptions(current: number | null): number[] {
  const steps = new Set(current === null ? WEIGHT_STEPS_KG : [...WEIGHT_STEPS_KG, current]);
  return [...steps].sort((a, b) => a - b);
}

import { RIR_MAX, type Range } from '@liftwise/core';

// Controls of the training settings and of an exercise's card (§5.2, §5.3).

export const REST_STEP_S = 15;
export const WEIGHT_STEPS_KG = [0.5, 1, 1.25, 2, 2.5];

// A rest by ±15 s; 0 means no timer.
export function stepRest(seconds: number, direction: 1 | -1): number {
  return Math.max(0, seconds + direction * REST_STEP_S);
}

// A bound of the target RIR within 0–4 (4 = "4+"); moving one past the other takes it along.
export function stepRirRange(range: Range, bound: 'min' | 'max', direction: 1 | -1): Range {
  const value = Math.min(RIR_MAX, Math.max(0, range[bound] + direction));
  return bound === 'min'
    ? { min: value, max: Math.max(range.max, value) }
    : { min: Math.min(range.min, value), max: value };
}

// The weight steps to choose from: the common ones and the current one.
export function weightStepOptions(current: number | null): number[] {
  const steps = new Set(current === null ? WEIGHT_STEPS_KG : [...WEIGHT_STEPS_KG, current]);
  return [...steps].sort((a, b) => a - b);
}

import { describe, expect, it } from 'vite-plus/test';
import { stepRest, stepRirRange, weightStepOptions } from './settings';

describe('training controls', () => {
  it('steps the rest by 15 s down to 0', () => {
    expect(stepRest(90, 1)).toBe(105);
    expect(stepRest(10, -1)).toBe(0);
  });

  it('keeps the RIR range within 0–4 and min not above max', () => {
    expect(stepRirRange({ min: 1, max: 2 }, 'min', 1)).toEqual({ min: 2, max: 2 });
    expect(stepRirRange({ min: 2, max: 2 }, 'min', 1)).toEqual({ min: 3, max: 3 });
    expect(stepRirRange({ min: 2, max: 2 }, 'max', -1)).toEqual({ min: 1, max: 1 });
    expect(stepRirRange({ min: 0, max: 4 }, 'max', 1)).toEqual({ min: 0, max: 4 });
    expect(stepRirRange({ min: 0, max: 4 }, 'min', -1)).toEqual({ min: 0, max: 4 });
  });

  it('offers the common weight steps and the current one', () => {
    expect(weightStepOptions(null)).toEqual([0.5, 1, 1.25, 2, 2.5]);
    expect(weightStepOptions(1.5)).toEqual([0.5, 1, 1.25, 1.5, 2, 2.5]);
    expect(weightStepOptions(2)).toEqual([0.5, 1, 1.25, 2, 2.5]);
  });
});

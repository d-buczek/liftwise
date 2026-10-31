import { z } from 'zod';
import { describe, expect, it } from 'vite-plus/test';
import { localDateSchema, rangeOf, rirSchema, timestampSchema, weightKgSchema } from './common';

describe('common schemas', () => {
  it('accepts weights in 0.25 kg steps, 0 = bodyweight', () => {
    for (const kg of [0, 1.25, 24, 22.75]) expect(weightKgSchema.safeParse(kg).success).toBe(true);
    for (const kg of [-1.25, 1.1, 24.3]) expect(weightKgSchema.safeParse(kg).success).toBe(false);
  });

  it('accepts RIR 0–4', () => {
    expect(rirSchema.safeParse(0).success).toBe(true);
    expect(rirSchema.safeParse(4).success).toBe(true);
    expect(rirSchema.safeParse(5).success).toBe(false);
    expect(rirSchema.safeParse(1.5).success).toBe(false);
  });

  it('rejects a range with min above max', () => {
    const range = rangeOf(z.int().positive());
    expect(range.safeParse({ min: 8, max: 12 }).success).toBe(true);
    expect(range.safeParse({ min: 10, max: 10 }).success).toBe(true);
    expect(range.safeParse({ min: 12, max: 8 }).success).toBe(false);
    expect(range.safeParse({ min: 0, max: 8 }).success).toBe(false);
  });

  it('takes local dates and timestamps with an offset', () => {
    expect(localDateSchema.safeParse('2026-10-31').success).toBe(true);
    expect(localDateSchema.safeParse('31.10.2026').success).toBe(false);
    expect(timestampSchema.safeParse('2026-10-31T18:05:00+01:00').success).toBe(true);
    expect(timestampSchema.safeParse('2026-10-31 18:05').success).toBe(false);
  });
});

import { describe, expect, it } from 'vite-plus/test';
import { newId } from '../ids';
import { setMatchesMeasure, workoutSetSchema } from './set';

const planned = {
  id: newId(),
  workout_id: newId(),
  exercise_id: newId(),
  position: 0,
  status: 'planned',
  weight_kg: 24,
  reps: 10,
  source: 'copy',
};
const done = { ...planned, status: 'done', rir: 2, performed_at: '2026-10-31T18:05:00+01:00' };

describe('workoutSetSchema', () => {
  it('parses planned and done sets', () => {
    expect(workoutSetSchema.parse(planned)).toMatchObject({
      duration_s: null,
      rir: null,
      warmup: false,
      note: '',
      performed_at: null,
    });
    expect(workoutSetSchema.parse(done).rir).toBe(2);
  });

  it('parses a timed set with duration and no reps', () => {
    const plank = { ...planned, weight_kg: 0, reps: null, duration_s: 45 };
    expect(workoutSetSchema.safeParse(plank).success).toBe(true);
  });

  it('needs exactly one of reps and duration_s', () => {
    expect(workoutSetSchema.safeParse({ ...planned, duration_s: 45 }).success).toBe(false);
    expect(workoutSetSchema.safeParse({ ...planned, reps: null }).success).toBe(false);
  });

  it('sets performed_at exactly on done sets', () => {
    expect(workoutSetSchema.safeParse({ ...done, performed_at: null }).success).toBe(false);
    expect(
      workoutSetSchema.safeParse({ ...planned, performed_at: done.performed_at }).success,
    ).toBe(false);
  });

  it('rejects invalid values', () => {
    const invalid = [{ weight_kg: 24.1 }, { reps: 0 }, { rir: 5 }, { status: 'skipped' }];
    for (const patch of invalid) {
      expect(workoutSetSchema.safeParse({ ...planned, ...patch }).success).toBe(false);
    }
  });
});

describe('setMatchesMeasure', () => {
  it('checks reps vs duration against the exercise', () => {
    const repsSet = { reps: 10, duration_s: null };
    const timedSet = { reps: null, duration_s: 45 };
    expect(setMatchesMeasure(repsSet, { measure: 'reps' })).toBe(true);
    expect(setMatchesMeasure(timedSet, { measure: 'reps' })).toBe(false);
    expect(setMatchesMeasure(timedSet, { measure: 'time' })).toBe(true);
    expect(setMatchesMeasure(repsSet, { measure: 'time' })).toBe(false);
  });
});

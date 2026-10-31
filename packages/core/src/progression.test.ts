import { describe, expect, it } from 'vite-plus/test';
import { newId } from './ids';
import { progressionHint, type ProgressionHintInput } from './progression';
import type { Exercise } from './schemas/exercise';
import type { WorkoutSet } from './schemas/set';
import { DEFAULT_TRAINING_SETTINGS } from './schemas/settings';
import { makeDatedSet, makeExercise, makeTimedExercise } from './testing';

const press = makeExercise();
const pushups = makeExercise({ name_pl: 'Pompki', rep_range: { min: 8, max: 15 } });
const plank = makeTimedExercise();
const date = '2026-10-10';

// One workout: a working set per value (reps or seconds), at 20 kg unless overridden.
function session(
  exercise: Exercise,
  day: string,
  values: number[],
  fields: Partial<WorkoutSet> = {},
) {
  const workout_id = newId();
  return values.map((value, position) =>
    makeDatedSet(day, {
      workout_id,
      exercise_id: exercise.id,
      position,
      weight_kg: 20,
      ...(exercise.measure === 'time' ? { reps: null, duration_s: value } : { reps: value }),
      ...fields,
    }),
  );
}

function hint(
  exercise: Exercise,
  sets: ProgressionHintInput['sets'],
  extra: Partial<ProgressionHintInput> = {},
) {
  return progressionHint({ exercise, training: DEFAULT_TRAINING_SETTINGS, sets, date, ...extra });
}

describe('progressionHint', () => {
  it('needs done working sets before the day', () => {
    const sets = [
      ...session(press, '2026-10-06', [10], { status: 'planned' }),
      ...session(press, '2026-10-06', [10], { warmup: true }),
      ...session(press, date, [10]),
      ...session(press, '2026-10-11', [10]),
    ];
    expect(hint(press, sets)).toBeNull();
  });

  it('adds a rep per set up to rep_max at the same weight', () => {
    expect(hint(press, session(press, '2026-10-06', [12, 11, 9]))).toEqual({
      weight: 20,
      sets: 3,
      reps: [12, 12, 10],
      duration_s: null,
      targetRir: { min: 1, max: 2 },
      reason: 'reps_up',
      stall: false,
    });
  });

  it('follows the last session only, with its top weight', () => {
    const sets = [
      ...session(press, '2026-10-03', [12, 12, 12]),
      ...session(press, '2026-10-06', [10], { weight_kg: 22 }),
      ...session(press, '2026-10-06', [9], { performed_at: '2026-10-06T19:30:00+01:00' }),
    ];
    // Two workouts on one day: the later one is the last session.
    expect(hint(press, sets)).toMatchObject({ weight: 20, sets: 1, reps: [10] });
    expect(hint(press, sets.slice(0, 4))).toMatchObject({ weight: 22, reps: [11] });
  });

  it('adds a weight step when every set reached rep_max with RIR ≥ 1 or not recorded', () => {
    const rir = [2, null, 1];
    const sets = session(press, '2026-10-06', [12, 12, 13]).map((set, i) => ({
      ...set,
      rir: rir[i] ?? null,
    }));
    expect(hint(press, sets)).toMatchObject({
      weight: 21.25,
      reps: [8, 8, 8],
      reason: 'weight_up',
    });
    const heavyStep = makeExercise({ id: press.id, weight_step_kg: 2 });
    expect(hint(heavyStep, sets)).toMatchObject({ weight: 22, reason: 'weight_up' });
  });

  it('holds when a set at rep_max had RIR 0', () => {
    const sets = session(press, '2026-10-06', [12, 12]).map((set, i) => ({
      ...set,
      rir: i === 1 ? 0 : 2,
    }));
    expect(hint(press, sets)).toMatchObject({ weight: 20, reps: [12, 12], reason: 'hold' });
  });

  it('never adds weight at 0 kg and keeps reps above rep_max', () => {
    const bodyweight = { weight_kg: 0 };
    expect(hint(pushups, session(pushups, '2026-10-06', [15, 15], bodyweight))).toMatchObject({
      weight: 0,
      reps: [15, 15],
      reason: 'hold',
    });
    expect(hint(pushups, session(pushups, '2026-10-06', [20, 14], bodyweight))).toMatchObject({
      reps: [20, 15],
      reason: 'reps_up',
    });
  });

  it('holds at the heaviest dumbbell', () => {
    const sets = session(press, '2026-10-06', [12, 12], { weight_kg: 24 });
    expect(hint(press, sets, { maxWeightKg: 25 })).toMatchObject({ weight: 24, reason: 'hold' });
    expect(hint(press, sets, { maxWeightKg: 25.25 })).toMatchObject({ reason: 'weight_up' });
    expect(hint(press, sets, { maxWeightKg: null })).toMatchObject({ reason: 'weight_up' });
  });

  it('holds the last session after a break over 14 days', () => {
    expect(hint(press, session(press, '2026-09-25', [12, 12, 10]))).toMatchObject({
      weight: 20,
      reps: [12, 12, 10],
      reason: 'reentry',
    });
    expect(hint(press, session(press, '2026-09-26', [12, 12]))).toMatchObject({
      reason: 'weight_up',
    });
  });

  it('adds 5 s per set for timed exercises and stops at the max time at 0 kg', () => {
    const bodyweight = { weight_kg: 0 };
    expect(hint(plank, session(plank, '2026-10-06', [30, 58], bodyweight))).toEqual({
      weight: 0,
      sets: 2,
      reps: null,
      duration_s: [35, 60],
      targetRir: { min: 1, max: 2 },
      reason: 'time_up',
      stall: false,
    });
    expect(hint(plank, session(plank, '2026-10-06', [60, 60], bodyweight))).toMatchObject({
      duration_s: [60, 60],
      reason: 'hold',
    });
    expect(hint(plank, session(plank, '2026-10-06', [60, 60], { weight_kg: 5 }))).toMatchObject({
      weight: 6.25,
      duration_s: [30, 30],
      reason: 'weight_up',
    });
  });

  describe('stall', () => {
    const sessions = (...values: number[][]) =>
      values.flatMap((v, i) => session(press, `2026-10-0${i + 1}`, v));

    it('flags three sessions at the same weight with fewer reps each time', () => {
      const sets = sessions([10, 10, 10], [10, 10, 9], [10, 9, 9]);
      expect(hint(press, sets)).toMatchObject({ reason: 'reps_up', stall: true });
      // Independent of the reason.
      expect(hint(press, sets, { date: '2026-11-01' })).toMatchObject({
        reason: 'reentry',
        stall: true,
      });
    });

    it('needs two drops in a row', () => {
      expect(hint(press, sessions([10, 10, 10], [10, 10, 9], [10, 10, 9]))?.stall).toBe(false);
      expect(hint(press, sessions([10, 10, 9], [10, 10, 9]))?.stall).toBe(false);
    });

    it('needs the same top weight', () => {
      const sets = sessions([10, 10, 10], [10, 10, 9], [10, 9, 9]).map((set) =>
        set.date === '2026-10-03' ? { ...set, weight_kg: 21.25 } : set,
      );
      expect(hint(press, sets)?.stall).toBe(false);
    });

    it('compares only the sets all three sessions have', () => {
      // Sums of the first three sets: 28, 29, 28.
      expect(hint(press, sessions([10, 10, 8, 5], [10, 10, 9], [10, 9, 9]))?.stall).toBe(false);
    });
  });
});

import { describe, expect, it } from 'vite-plus/test';
import { copyWorkout, defaultCopySource, lightWeightKg } from './copy';
import { idSchema, newId } from './ids';
import { DEFAULT_TRAINING_SETTINGS } from './schemas/settings';
import { makeExercise, makeSet, makeTimedExercise } from './testing';

const press = makeExercise();
const plank = makeTimedExercise();
const source = newId();
const target = { workoutId: newId(), sets: [] };

function sourceSet(fields: Parameters<typeof makeSet>[0]) {
  return makeSet({ workout_id: source, exercise_id: press.id, ...fields });
}

describe('copyWorkout', () => {
  it('copies done sets 1:1 as planned sets and skips the undone ones', () => {
    const sets = [
      sourceSet({ position: 0, weight_kg: 10, reps: 12, warmup: true }),
      sourceSet({ position: 1, weight_kg: 24, reps: 10, rir: 2, note: 'ciężko' }),
      sourceSet({ position: 2, status: 'planned' }),
    ];
    const copy = copyWorkout({ source: sets, target });
    expect(copy).toHaveLength(2);
    expect(copy[0]).toMatchObject({ weight_kg: 10, reps: 12, warmup: true });
    expect(copy[1]).toMatchObject({
      workout_id: target.workoutId,
      exercise_id: press.id,
      position: 1,
      status: 'planned',
      weight_kg: 24,
      reps: 10,
      duration_s: null,
      rir: null,
      warmup: false,
      note: '',
      performed_at: null,
      source: 'copy',
    });
    for (const set of copy) {
      expect(idSchema.safeParse(set.id).success).toBe(true);
      expect(sets.map((s) => s.id)).not.toContain(set.id);
    }
  });

  it('copies the planned sets of a source with no done sets', () => {
    const sets = [sourceSet({ status: 'planned' }), sourceSet({ status: 'planned', position: 1 })];
    expect(copyWorkout({ source: sets, target })).toHaveLength(2);
  });

  it('keeps the source order and appends after the sets the target day has', () => {
    const sets = [
      sourceSet({ position: 2, reps: 8 }),
      sourceSet({ position: 0, reps: 12 }),
      sourceSet({ position: 1, reps: 10 }),
    ];
    const copy = copyWorkout({
      source: sets,
      target: { workoutId: target.workoutId, sets: [{ position: 0 }, { position: 4 }] },
    });
    expect(copy.map((set) => [set.position, set.reps])).toEqual([
      [5, 12],
      [6, 10],
      [7, 8],
    ]);
  });

  it('copies durations of timed sets', () => {
    const set = makeSet({ exercise_id: plank.id, weight_kg: 0, duration_s: 45 });
    expect(copyWorkout({ source: [set], target })[0]).toMatchObject({ reps: null, duration_s: 45 });
  });

  it('returns nothing for an empty source', () => {
    expect(copyWorkout({ source: [], target })).toEqual([]);
  });
});

describe('copyWorkout light', () => {
  const light = { exercises: [press, plank], training: DEFAULT_TRAINING_SETTINGS };

  it('drops the last working set per exercise and lowers working weights', () => {
    const sets = [
      sourceSet({ position: 0, weight_kg: 10, warmup: true }),
      sourceSet({ position: 1, weight_kg: 24, reps: 10 }),
      sourceSet({ position: 2, weight_kg: 24, reps: 9 }),
      sourceSet({ position: 3, weight_kg: 24, reps: 8 }),
      makeSet({ position: 4, exercise_id: plank.id, weight_kg: 0, duration_s: 45 }),
      makeSet({ position: 5, exercise_id: plank.id, weight_kg: 0, duration_s: 40 }),
    ];
    const copy = copyWorkout({ source: sets, target, light });
    expect(copy.map((set) => [set.weight_kg, set.reps ?? set.duration_s, set.warmup])).toEqual([
      [10, 10, true],
      [21.5, 10, false],
      [21.5, 9, false],
      [0, 45, false],
    ]);
  });

  it('keeps a single working set and never goes below 0', () => {
    const sets = [
      sourceSet({ position: 0, weight_kg: 1 }),
      makeSet({ position: 1, exercise_id: plank.id, weight_kg: 0, duration_s: 45 }),
    ];
    const copy = copyWorkout({ source: sets, target, light });
    expect(copy.map((set) => set.weight_kg)).toEqual([0, 0]);
  });

  it('uses the exercise weight step, else the default', () => {
    const heavy = makeExercise({ weight_step_kg: 2.5 });
    const sets = [
      makeSet({ exercise_id: heavy.id, weight_kg: 40 }),
      makeSet({ exercise_id: newId(), weight_kg: 40, position: 1 }),
    ];
    const copy = copyWorkout({ source: sets, target, light: { ...light, exercises: [heavy] } });
    expect(copy.map((set) => set.weight_kg)).toEqual([35, 36.25]);
  });
});

describe('lightWeightKg', () => {
  it('takes the whole steps closest to 10%, at least one', () => {
    expect(lightWeightKg(24, 1.25)).toBe(21.5);
    expect(lightWeightKg(10, 1.25)).toBe(8.75);
    expect(lightWeightKg(40, 2.5)).toBe(35);
  });

  it('takes the extra step on a tie', () => {
    expect(lightWeightKg(18.75, 1.25)).toBe(16.25);
  });

  it('stays at 0', () => {
    expect(lightWeightKg(0, 1.25)).toBe(0);
    expect(lightWeightKg(1, 1.25)).toBe(0);
  });
});

describe('defaultCopySource', () => {
  const workouts = [
    { id: newId(), date: '2026-10-27' },
    { id: newId(), date: '2026-10-29' },
    { id: newId(), date: '2026-10-29' },
    { id: newId(), date: '2026-10-30' },
    { id: newId(), date: '2026-10-31' },
    { id: newId(), date: '2026-11-02' },
  ];
  // 2026-10-30 has no sets.
  const [oldest, earlier, later, , today, future] = workouts;
  const sets = [oldest, earlier, later, today, future].map((w) => ({ workout_id: w?.id ?? '' }));

  it('picks the most recent workout with sets before the target day', () => {
    expect(defaultCopySource(workouts, sets, '2026-10-31')).toBe(later);
    expect(defaultCopySource(workouts, sets, '2026-11-05')).toBe(future);
    expect(defaultCopySource(workouts, sets, '2026-10-28')).toBe(oldest);
  });

  it('returns null without an earlier workout', () => {
    expect(defaultCopySource(workouts, sets, '2026-10-27')).toBeNull();
    expect(defaultCopySource([], [], '2026-10-31')).toBeNull();
  });
});

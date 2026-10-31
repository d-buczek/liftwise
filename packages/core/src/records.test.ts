import { describe, expect, it } from 'vite-plus/test';
import { newId } from './ids';
import { bestE1rm, e1rm, recordSets, recordTable } from './records';
import type { Exercise } from './schemas/exercise';
import type { WorkoutSet } from './schemas/set';
import { makeDatedSet, makeExercise, makeTimedExercise } from './testing';

const press = makeExercise();
const pushups = makeExercise({ name_pl: 'Pompki' });
const plank = makeTimedExercise();

// A log with one workout per day; sets get the next position of their day.
function log() {
  const workouts = new Map<string, { id: string; positions: number }>();
  return (
    day: string,
    exercise: Exercise,
    weight_kg: number,
    value: number,
    fields: Partial<WorkoutSet> = {},
  ) => {
    const workout = workouts.get(day) ?? { id: newId(), positions: 0 };
    workouts.set(day, workout);
    return makeDatedSet(day, {
      workout_id: workout.id,
      exercise_id: exercise.id,
      position: workout.positions++,
      weight_kg,
      ...(exercise.measure === 'time' ? { reps: null, duration_s: value } : { reps: value }),
      ...fields,
    });
  };
}

describe('e1rm', () => {
  it('is Epley per dumbbell', () => {
    expect(e1rm(24, 10)).toBeCloseTo(32);
    expect(e1rm(20, 0)).toBe(20);
  });
});

describe('recordSets', () => {
  it('takes the first workout as the baseline and records beaten sets in order', () => {
    const set = log();
    const sets = [
      set('2026-10-01', press, 20, 10),
      set('2026-10-01', press, 22, 6),
      set('2026-10-03', press, 30, 20, { warmup: true }),
      set('2026-10-03', press, 40, 20, { status: 'planned' }),
      set('2026-10-03', press, 20, 11),
      set('2026-10-03', press, 20, 10),
      set('2026-10-03', press, 18, 12),
      set('2026-10-03', press, 21, 10),
    ];
    const records = recordSets(sets, [press]);
    expect(records.map((r) => [r.set_id, r.kind, r.weight_kg, r.value])).toEqual([
      [sets[4]?.id, 'reps', 20, 11],
      [sets[4]?.id, 'e1rm', 20, e1rm(20, 11)],
      [sets[6]?.id, 'reps', 18, 12],
      [sets[7]?.id, 'reps', 21, 10],
      [sets[7]?.id, 'e1rm', 21, e1rm(21, 10)],
    ]);
    expect(records[0]).toMatchObject({ exercise_id: press.id, date: '2026-10-03' });
  });

  it('records time per weight, no e1RM for timed or bodyweight sets, all exercises in order', () => {
    const set = log();
    const sets = [
      set('2026-10-01', plank, 0, 45),
      set('2026-10-01', pushups, 0, 15),
      set('2026-10-03', pushups, 0, 16),
      set('2026-10-03', plank, 0, 40),
      set('2026-10-03', plank, 0, 50),
      set('2026-10-03', press, 20, 10),
    ];
    const records = recordSets(sets, [press, plank, pushups]);
    expect(records.map((r) => [r.set_id, r.kind, r.value])).toEqual([
      [sets[2]?.id, 'reps', 16],
      [sets[4]?.id, 'time', 50],
    ]);
  });

  it('skips sets of exercises not passed in', () => {
    const set = log();
    expect(
      recordSets([set('2026-10-01', press, 20, 10), set('2026-10-03', press, 20, 12)], []),
    ).toEqual([]);
  });
});

describe('recordTable', () => {
  it('keeps the sets no other set beats, by weight, the earlier one on a tie', () => {
    const set = log();
    const sets = [
      set('2026-10-01', press, 20, 10),
      set('2026-10-01', press, 22, 6),
      set('2026-10-03', press, 18, 12),
      set('2026-10-03', press, 20, 8),
      set('2026-10-03', press, 16, 12),
      set('2026-10-05', press, 22, 6),
    ];
    expect(recordTable(sets, press)).toEqual([
      { weight_kg: 18, value: 12, set_id: sets[2]?.id, date: '2026-10-03' },
      { weight_kg: 20, value: 10, set_id: sets[0]?.id, date: '2026-10-01' },
      { weight_kg: 22, value: 6, set_id: sets[1]?.id, date: '2026-10-01' },
    ]);
  });

  it('drops a record beaten later', () => {
    const set = log();
    const sets = [set('2026-10-01', plank, 0, 45), set('2026-10-03', plank, 0, 50)];
    expect(recordTable(sets, plank).map((r) => r.set_id)).toEqual([sets[1]?.id]);
  });
});

describe('bestE1rm', () => {
  it('returns the best e1RM with its set', () => {
    const set = log();
    const sets = [set('2026-10-01', press, 22, 6), set('2026-10-03', press, 20, 10)];
    expect(bestE1rm(sets, press)).toEqual({
      weight_kg: 20,
      value: e1rm(20, 10),
      set_id: sets[1]?.id,
      date: '2026-10-03',
    });
  });

  it('is null for timed exercises, bodyweight only or no history', () => {
    const set = log();
    expect(bestE1rm([set('2026-10-01', plank, 5, 45)], plank)).toBeNull();
    expect(bestE1rm([set('2026-10-01', pushups, 0, 15)], pushups)).toBeNull();
    expect(bestE1rm([], press)).toBeNull();
  });
});

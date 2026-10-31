import { describe, expect, it } from 'vite-plus/test';
import { BALANCE_PATTERNS } from './balance';
import type { DatedSet } from './history';
import { newId } from './ids';
import { muscleGroupSchema, type Exercise } from './schemas/exercise';
import type { WorkoutSet } from './schemas/set';
import { DEFAULT_BALANCE_SETTINGS, DEFAULT_TRAINING_SETTINGS } from './schemas/settings';
import { makeDatedSet, makeExercise } from './testing';
import { weeklySummary } from './weekly';

const press = makeExercise();
const row = makeExercise({
  name_pl: 'Wiosłowanie hantlą',
  primary_muscles: ['lats', 'upper_back'],
  secondary_muscles: ['biceps'],
  patterns: ['horizontal_pull'],
});
const curl = makeExercise({
  name_pl: 'Uginanie',
  primary_muscles: ['biceps'],
  patterns: ['isolation'],
});
const exercises = [press, row, curl];

// One workout: a set per rep count, at 20 kg unless overridden.
function session(
  exercise: Exercise,
  day: string,
  reps: number[],
  fields: Partial<WorkoutSet> = {},
) {
  const workout_id = fields.workout_id ?? newId();
  return reps.map((count, position) =>
    makeDatedSet(day, { workout_id, exercise_id: exercise.id, position, reps: count, ...fields }),
  );
}

function summary(date: string, sets: DatedSet[]) {
  return weeklySummary({
    date,
    sets,
    exercises,
    training: DEFAULT_TRAINING_SETTINGS,
    balance: DEFAULT_BALANCE_SETTINGS,
  });
}

describe('weeklySummary', () => {
  const pressWorkout = newId();
  const rowRecord = session(row, '2026-10-28', [10], { weight_kg: 22 });
  const sets = [
    // Stalled at 20 kg: 20, 18, 16 reps.
    ...session(press, '2026-10-12', [10, 10]),
    ...session(press, '2026-10-19', [9, 9]),
    ...session(press, '2026-10-27', [8, 8], { workout_id: pressWorkout }),
    ...session(press, '2026-10-27', [12], { workout_id: pressWorkout, position: 2, warmup: true }),
    ...session(press, '2026-11-02', [12]),
    // A record last week and one this week.
    ...session(row, '2026-10-12', [10]),
    ...session(row, '2026-10-21', [11]),
    ...rowRecord,
    ...session(row, '2026-10-31', [10], { status: 'planned' }),
    // Stalled, but not trained this week.
    ...session(curl, '2026-10-05', [12, 12]),
    ...session(curl, '2026-10-12', [11, 11]),
    ...session(curl, '2026-10-19', [10, 10]),
  ];
  const week = summary('2026-10-28', sets);

  it('counts the done working sets of the Monday–Sunday week', () => {
    expect(week).toMatchObject({ start: '2026-10-26', end: '2026-11-01', workouts: 2, sets: 3 });
    expect(week.muscles.map((m) => m.group)).toEqual(muscleGroupSchema.options);
    expect(week.muscles.find((m) => m.group === 'chest')).toEqual({
      group: 'chest',
      hardSets: 2,
      target: { min: 10, max: 20 },
      status: 'under',
    });
    expect(week.muscles.find((m) => m.group === 'biceps')?.hardSets).toBe(0.5);
  });

  it("lists the week's records from the whole history", () => {
    expect(week.records.map((r) => [r.set_id, r.kind])).toEqual([
      [rowRecord[0]?.id, 'reps'],
      [rowRecord[0]?.id, 'e1rm'],
    ]);
  });

  it("flags stalls of the week's exercises after the week", () => {
    expect(week.stalled).toEqual([press.id]);
  });

  it('lists groups without direct work and patterns without sets, isolation aside', () => {
    expect(week.neglected.muscles).toEqual(
      muscleGroupSchema.options.filter((g) => !['chest', 'lats', 'upper_back'].includes(g)),
    );
    expect(week.neglected.muscles).toContain('biceps');
    expect(week.neglected.patterns).toEqual(
      BALANCE_PATTERNS.filter((p) => p !== 'horizontal_push' && p !== 'horizontal_pull'),
    );
  });

  it('is empty without sets in the week', () => {
    const empty = summary('2026-11-08', sets.slice(0, 6));
    expect(empty).toMatchObject({
      start: '2026-11-02',
      end: '2026-11-08',
      workouts: 0,
      sets: 0,
      records: [],
      stalled: [],
    });
    expect(empty.neglected.muscles).toEqual(muscleGroupSchema.options);
    expect(empty.neglected.patterns).toEqual(BALANCE_PATTERNS);
  });
});

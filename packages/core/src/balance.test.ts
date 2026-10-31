import { describe, expect, it } from 'vite-plus/test';
import { BALANCE_PATTERNS, balanceSnapshot, hardSetsByGroup, muscleTargets } from './balance';
import { newId } from './ids';
import { muscleGroupSchema, type Exercise } from './schemas/exercise';
import type { WorkoutSet } from './schemas/set';
import { DEFAULT_BALANCE_SETTINGS } from './schemas/settings';
import { makeDatedSet, makeExercise } from './testing';

const press = makeExercise({ secondary_muscles: ['triceps', 'front_delts'] });
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
const today = '2026-10-31';

function set(date: string, exercise: Exercise, fields: Partial<WorkoutSet> = {}) {
  return makeDatedSet(date, { exercise_id: exercise.id, ...fields });
}

describe('hardSetsByGroup', () => {
  it('counts working sets: 1 for a primary muscle, 0.5 for a secondary one', () => {
    const hardSets = hardSetsByGroup(
      [
        set(today, press),
        set(today, press),
        set(today, press, { warmup: true }),
        set(today, press, { status: 'planned' }),
        set(today, row),
        makeDatedSet(today, { exercise_id: newId() }),
      ],
      exercises,
    );
    expect(Object.keys(hardSets)).toEqual(muscleGroupSchema.options);
    expect(hardSets).toMatchObject({
      chest: 2,
      triceps: 1,
      front_delts: 1,
      lats: 1,
      upper_back: 1,
      biceps: 0.5,
      quads: 0,
    });
  });
});

describe('muscleTargets', () => {
  it('compares hard sets with the target range', () => {
    const balance = {
      weekly_sets: { ...DEFAULT_BALANCE_SETTINGS.weekly_sets, chest: { min: 2, max: 3 } },
    };
    const status = (chest: number) =>
      muscleTargets({ ...hardSetsByGroup([], []), chest }, balance)[0];
    expect(status(1.5)).toEqual({
      group: 'chest',
      hardSets: 1.5,
      target: { min: 2, max: 3 },
      status: 'under',
    });
    expect(status(2)?.status).toBe('in_range');
    expect(status(3)?.status).toBe('in_range');
    expect(status(3.5)?.status).toBe('over');
  });
});

describe('balanceSnapshot', () => {
  const balance = {
    weekly_sets: {
      ...DEFAULT_BALANCE_SETTINGS.weekly_sets,
      chest: { min: 2, max: 3 },
      front_delts: { min: 0, max: 1 },
    },
  };
  const sets = [
    set('2026-10-01', row),
    set('2026-10-24', press),
    set('2026-10-25', press),
    set('2026-10-29', curl, { warmup: true }),
    set('2026-10-30', press),
    set('2026-10-30', press),
    set('2026-11-01', press),
  ];
  const snapshot = balanceSnapshot({ sets, exercises, balance, today });
  const muscle = (group: string) => snapshot.muscles.find((m) => m.group === group);
  const pattern = (name: string) => snapshot.patterns.find((p) => p.pattern === name);

  it('counts hard sets over the last 7 days up to today', () => {
    expect(muscle('chest')).toEqual({
      group: 'chest',
      hardSets: 3,
      target: { min: 2, max: 3 },
      status: 'in_range',
      daysSince: 1,
    });
    expect(muscle('triceps')).toMatchObject({ hardSets: 1.5, status: 'under' });
    expect(muscle('front_delts')).toMatchObject({ hardSets: 1.5, status: 'over' });
  });

  it('counts days since direct work; never is null', () => {
    expect(muscle('lats')).toMatchObject({ hardSets: 0, status: 'under', daysSince: 30 });
    expect(muscle('triceps')?.daysSince).toBeNull();
    expect(muscle('biceps')?.daysSince).toBeNull();
  });

  it('counts days since each pattern, without isolation', () => {
    expect(snapshot.muscles.map((m) => m.group)).toEqual(muscleGroupSchema.options);
    expect(snapshot.patterns.map((p) => p.pattern)).toEqual(BALANCE_PATTERNS);
    expect(BALANCE_PATTERNS).not.toContain('isolation');
    expect(pattern('horizontal_push')?.daysSince).toBe(1);
    expect(pattern('horizontal_pull')?.daysSince).toBe(30);
    expect(pattern('vertical_pull')?.daysSince).toBeNull();
  });
});

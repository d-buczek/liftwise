import { describe, expect, it } from 'vite-plus/test';
import { newId } from './ids';
import { exerciseProgress, weeklyHardSets } from './progress';
import { e1rm } from './records';
import type { Exercise } from './schemas/exercise';
import type { WorkoutSet } from './schemas/set';
import { makeDatedSet, makeExercise, makeTimedExercise } from './testing';

const press = makeExercise({ primary_muscles: ['chest'], secondary_muscles: ['triceps'] });
const row = makeExercise({ name_pl: 'Wiosłowanie', primary_muscles: ['upper_back', 'lats'] });
const plank = makeTimedExercise();

function set(
  date: string,
  exercise: Exercise,
  weight_kg: number,
  value: number,
  fields: Partial<WorkoutSet> = {},
) {
  return makeDatedSet(date, {
    exercise_id: exercise.id,
    weight_kg,
    ...(exercise.measure === 'time' ? { reps: null, duration_s: value } : { reps: value }),
    ...fields,
  });
}

describe('exerciseProgress', () => {
  it('gives each day its top set, best e1RM and volume from working sets', () => {
    const sets = [
      set('2026-10-03', press, 22, 8),
      set('2026-10-01', press, 20, 10),
      set('2026-10-01', press, 22, 6),
      set('2026-10-01', press, 22, 5),
      set('2026-10-01', press, 30, 3, { warmup: true }),
      set('2026-10-01', press, 40, 3, { status: 'planned', performed_at: null }),
      set('2026-10-01', row, 50, 10),
    ];
    expect(exerciseProgress(sets, press)).toEqual([
      {
        date: '2026-10-01',
        weight_kg: 22,
        value: 6,
        e1rm: e1rm(20, 10),
        volume_kg: (20 * 10 + 22 * 6 + 22 * 5) * 2,
      },
      { date: '2026-10-03', weight_kg: 22, value: 8, e1rm: e1rm(22, 8), volume_kg: 22 * 8 * 2 },
    ]);
  });

  it('joins the workouts of one day', () => {
    const sets = [
      set('2026-10-01', press, 20, 10, { workout_id: newId() }),
      set('2026-10-01', press, 20, 12, { workout_id: newId() }),
    ];
    expect(exerciseProgress(sets, press)).toMatchObject([{ value: 12, volume_kg: 880 }]);
  });

  it('has no e1RM at 0 kg and no e1RM or volume for timed exercises', () => {
    const pushups = makeExercise({ implements: 1 });
    expect(exerciseProgress([set('2026-10-01', pushups, 0, 15)], pushups)).toEqual([
      { date: '2026-10-01', weight_kg: 0, value: 15, e1rm: null, volume_kg: 0 },
    ]);
    expect(
      exerciseProgress([set('2026-10-01', plank, 0, 45), set('2026-10-01', plank, 0, 60)], plank),
    ).toEqual([{ date: '2026-10-01', weight_kg: 0, value: 60, e1rm: null, volume_kg: null }]);
  });
});

describe('weeklyHardSets', () => {
  it('sums primary and secondary hard sets per Monday–Sunday week, empty weeks as 0', () => {
    const sets = [
      set('2026-10-05', press, 20, 10),
      set('2026-10-11', press, 20, 10),
      set('2026-10-11', press, 20, 10, { warmup: true }),
      set('2026-10-12', row, 30, 10),
      set('2026-10-26', press, 20, 10),
      set('2026-11-02', press, 20, 10),
    ];
    const exercises = [press, row];
    expect(weeklyHardSets(sets, exercises, 'chest', '2026-10-07', '2026-10-28')).toEqual([
      { start: '2026-10-05', hardSets: 2 },
      { start: '2026-10-12', hardSets: 0 },
      { start: '2026-10-19', hardSets: 0 },
      { start: '2026-10-26', hardSets: 1 },
    ]);
    expect(
      weeklyHardSets(sets, exercises, 'triceps', '2026-10-05', '2026-10-11').map((w) => w.hardSets),
    ).toEqual([1]);
  });
});

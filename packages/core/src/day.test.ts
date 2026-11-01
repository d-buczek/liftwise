import { describe, expect, it } from 'vite-plus/test';
import { dayWorkout, logSets, nextPosition, plannedSetsFor } from './day';
import { newId } from './ids';
import { workoutSchema, type Workout } from './schemas/workout';
import { makeDatedSet, makeExercise, makeSet, makeTimedExercise } from './testing';

const press = makeExercise();
const plank = makeTimedExercise();
const NOW = '2026-10-09T18:00:00+02:00';

describe('day helpers', () => {
  it('sends new sets to the oldest workout of the day', () => {
    expect(dayWorkout([{ id: '019a2' }, { id: '019a1' }])?.id).toBe('019a1');
    expect(dayWorkout([])).toBeNull();
    expect(nextPosition([])).toBe(0);
    expect(nextPosition([{ position: 4 }, { position: 2 }])).toBe(5);
  });

  it('plans an added exercise from its last session before the day', () => {
    const workout = newId();
    const history = [
      makeDatedSet('2026-10-01', { exercise_id: press.id, weight_kg: 18 }),
      makeDatedSet('2026-10-05', {
        exercise_id: press.id,
        workout_id: workout,
        weight_kg: 20,
        reps: 9,
        position: 1,
      }),
      makeDatedSet('2026-10-05', {
        exercise_id: press.id,
        workout_id: workout,
        weight_kg: 10,
        warmup: true,
        position: 0,
      }),
      makeDatedSet('2026-10-09', { exercise_id: press.id, weight_kg: 22 }),
    ];
    const sets = plannedSetsFor(press, history, '2026-10-09', { workoutId: 'w', start: 3 });
    expect(sets).toMatchObject([
      { workout_id: 'w', position: 3, status: 'planned', weight_kg: 20, reps: 9, warmup: false },
    ]);
  });

  it('plans one set at the range min and 0 kg without history', () => {
    const target = { workoutId: 'w', start: 0, source: 'agent' as const };
    expect(plannedSetsFor(press, [], '2026-10-09', target)).toMatchObject([
      { weight_kg: 0, reps: 8, source: 'agent' },
    ]);
    expect(plannedSetsFor(plank, [], '2026-10-09', target)).toMatchObject([
      { reps: null, duration_s: 30 },
    ]);
  });
});

describe('logSets', () => {
  const workout = (fields: Partial<Workout> = {}) =>
    workoutSchema.parse({ id: newId(), date: '2026-10-09', ...fields });
  const planned = (w: Workout, position: number, fields: Parameters<typeof makeSet>[0] = {}) =>
    makeSet({
      workout_id: w.id,
      exercise_id: press.id,
      position,
      status: 'planned',
      performed_at: null,
      source: 'copy',
      ...fields,
    });
  const logged = (weight_kg: number, reps = 10) => ({ weight_kg, reps, duration_s: null });

  it('completes the planned sets first and starts the workout', () => {
    const w = workout();
    const warmup = planned(w, 0, { weight_kg: 10, warmup: true });
    const first = planned(w, 1);
    const second = planned(w, 2);
    const other = makeSet({ workout_id: w.id, position: 3, status: 'planned', performed_at: null });
    const result = logSets({
      date: '2026-10-09',
      exerciseId: press.id,
      workouts: [w],
      sets: [second, warmup, first, other],
      logged: [logged(24), { ...logged(24, 8), rir: 0 }, logged(24, 6)],
      performedAt: NOW,
    });
    expect(result.workouts).toEqual([{ ...w, started_at: NOW }]);
    expect(result.sets).toMatchObject([
      { id: first.id, position: 1, status: 'done', weight_kg: 24, reps: 10, source: 'copy' },
      { id: second.id, position: 2, reps: 8, rir: 0, performed_at: NOW },
      { workout_id: w.id, position: 4, reps: 6, source: 'agent', warmup: false },
    ]);
  });

  it('creates the workout on a day without one', () => {
    const result = logSets({
      date: '2026-10-09',
      exerciseId: plank.id,
      workouts: [],
      sets: [],
      logged: [{ weight_kg: 0, reps: null, duration_s: 45 }],
      performedAt: NOW,
      source: 'manual',
    });
    const [created] = result.workouts;
    expect(created).toMatchObject({ date: '2026-10-09', started_at: NOW });
    expect(result.sets).toMatchObject([
      { workout_id: created?.id, position: 0, duration_s: 45, source: 'manual' },
    ]);
  });

  it('leaves a started workout as it is and uses the oldest one for new sets', () => {
    const older = workout({ started_at: '2026-10-09T17:00:00+02:00' });
    const newer = workout();
    const result = logSets({
      date: '2026-10-09',
      exerciseId: press.id,
      workouts: [newer, older],
      sets: [planned(newer, 0, { status: 'done', performed_at: NOW })],
      logged: [logged(20)],
      performedAt: NOW,
    });
    expect(result.workouts).toEqual([]);
    expect(result.sets).toMatchObject([{ workout_id: older.id, position: 1 }]);
  });
});

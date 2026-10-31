import { describe, expect, it } from 'vite-plus/test';
import { compareHistory, datedSets, exerciseHistory, exerciseSessions } from './history';
import { newId } from './ids';
import { makeDatedSet, makeExercise, makeSet } from './testing';

describe('datedSets', () => {
  it('attaches the workout date and skips sets without a workout', () => {
    const workout = { id: newId(), date: '2026-10-31' };
    const set = makeSet({ workout_id: workout.id });
    expect(datedSets([workout], [set, makeSet()])).toEqual([{ ...set, date: '2026-10-31' }]);
  });
});

describe('compareHistory', () => {
  it('orders by date, then performed_at, then position', () => {
    const later = makeDatedSet('2026-10-02', { position: 0 });
    const evening = makeDatedSet('2026-10-01', { performed_at: '2026-10-01T20:00:00+01:00' });
    const second = makeDatedSet('2026-10-01', { position: 1 });
    const first = makeDatedSet('2026-10-01', { position: 0 });
    expect([later, evening, second, first].sort(compareHistory)).toEqual([
      first,
      second,
      evening,
      later,
    ]);
  });
});

describe('exerciseHistory', () => {
  const press = makeExercise();

  it('keeps working sets of the exercise in its measure, before the date', () => {
    const kept = makeDatedSet('2026-10-01', { exercise_id: press.id });
    const sets = [
      makeDatedSet('2026-10-02', { exercise_id: press.id }),
      makeDatedSet('2026-10-01', { exercise_id: press.id, status: 'planned' }),
      makeDatedSet('2026-10-01', { exercise_id: press.id, warmup: true }),
      makeDatedSet('2026-10-01', { exercise_id: press.id, reps: null, duration_s: 30 }),
      makeDatedSet('2026-10-01'),
      kept,
    ];
    expect(exerciseHistory(sets, press, '2026-10-02')).toEqual([kept]);
    expect(exerciseHistory(sets, press)).toHaveLength(2);
  });
});

describe('exerciseSessions', () => {
  it('groups by workout, oldest first', () => {
    const press = makeExercise();
    const [early, late] = [newId(), newId()];
    const sets = [
      makeDatedSet('2026-10-05', { exercise_id: press.id, workout_id: late }),
      makeDatedSet('2026-10-01', { exercise_id: press.id, workout_id: early, position: 1 }),
      makeDatedSet('2026-10-01', { exercise_id: press.id, workout_id: early, position: 0 }),
    ];
    const sessions = exerciseSessions(sets, press);
    expect(sessions.map((s) => [s.workout_id, s.date, s.sets.length])).toEqual([
      [early, '2026-10-01', 2],
      [late, '2026-10-05', 1],
    ]);
    expect(sessions[0]?.sets.map((set) => set.position)).toEqual([0, 1]);
  });
});

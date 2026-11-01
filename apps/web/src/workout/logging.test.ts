import { newId, type DatedSet } from '@liftwise/core';
import { describe, expect, it } from 'vite-plus/test';
import { makeExercise, makeSet } from '../testing';
import { exerciseBlocks } from './day';
import { draftSource, loadGroups, repeatsPrevious, setRecords, startExercise } from './logging';

const press = makeExercise();
const plank = makeExercise({ measure: 'time', time_range_s: { min: 30, max: 60 } });
const dated = (date: string, fields: Parameters<typeof makeSet>[0]): DatedSet => ({
  ...makeSet({ exercise_id: press.id, ...fields }),
  date,
});

describe('startExercise', () => {
  it('opens on the first exercise with a planned set left, else the first', () => {
    const [a, b] = [newId(), newId()];
    const done = makeSet({ exercise_id: a, position: 0 });
    const planned = makeSet({ exercise_id: b, position: 1, status: 'planned' });
    expect(startExercise(exerciseBlocks([done, planned]))).toBe(b);
    expect(startExercise(exerciseBlocks([done]))).toBe(a);
    expect(startExercise([])).toBeNull();
  });
});

describe('draftSource', () => {
  const workout_id = newId();
  const history = [
    dated('2026-10-27', { workout_id, weight_kg: 22.5, reps: 10, position: 0 }),
    dated('2026-10-27', { workout_id, weight_kg: 22.5, reps: 9, position: 1 }),
  ];

  it('drafts the next planned set without its RIR', () => {
    const done = makeSet({ exercise_id: press.id, position: 0, rir: 2 });
    const planned = makeSet({ exercise_id: press.id, position: 1, status: 'planned', reps: 11 });
    const source = draftSource({
      exercise: press,
      sets: [done, planned],
      history,
      date: '2026-11-01',
    });
    expect(source.planned).toBe(planned);
    expect(source.draft).toEqual({
      weight_kg: 20,
      reps: 11,
      duration_s: null,
      warmup: false,
      rir: null,
    });
  });

  it('repeats the last done set of the day when nothing is planned', () => {
    const done = makeSet({ exercise_id: press.id, weight_kg: 24, reps: 8, warmup: true });
    const source = draftSource({ exercise: press, sets: [done], history, date: '2026-11-01' });
    expect(source.planned).toBeNull();
    expect(source.previous).toEqual({ weight_kg: 24, reps: 8, duration_s: null, warmup: true });
    expect(repeatsPrevious(source, source.draft)).toBe(true);
    expect(repeatsPrevious(source, { ...source.draft, reps: 9 })).toBe(false);
  });

  it('starts from the first working set of the last session, else the bottom of the range', () => {
    const fromHistory = draftSource({ exercise: press, sets: [], history, date: '2026-11-01' });
    expect(fromHistory.draft).toMatchObject({ weight_kg: 22.5, reps: 10 });
    expect(repeatsPrevious(fromHistory, fromHistory.draft)).toBe(true);

    const fresh = draftSource({ exercise: plank, sets: [], history: [], date: '2026-11-01' });
    expect([fresh.previous, fresh.draft.duration_s, fresh.draft.reps]).toEqual([null, 30, null]);
    expect(repeatsPrevious(fresh, fresh.draft)).toBe(false);
  });

  it('never repeats while a planned set is left', () => {
    const planned = makeSet({ exercise_id: press.id, status: 'planned' });
    const source = draftSource({ exercise: press, sets: [planned], history, date: '2026-11-01' });
    expect(repeatsPrevious(source, source.draft)).toBe(false);
  });
});

describe('loadGroups', () => {
  it('groups consecutive sets of one weight', () => {
    const sets = [
      makeSet({ weight_kg: 22.5, reps: 10 }),
      makeSet({ weight_kg: 22.5, reps: 9 }),
      makeSet({ weight_kg: 20, reps: 12 }),
      makeSet({ weight_kg: 20, reps: null, duration_s: 45 }),
    ];
    expect(loadGroups(sets)).toEqual([
      { weight_kg: 22.5, values: [10, 9], timed: false },
      { weight_kg: 20, values: [12], timed: false },
      { weight_kg: 20, values: [45], timed: true },
    ]);
  });
});

describe('setRecords', () => {
  it('lists the records of one set, none in the first session', () => {
    const first = dated('2026-10-27', { weight_kg: 20, reps: 10 });
    const better = dated('2026-11-01', { weight_kg: 20, reps: 12 });
    expect(setRecords([first], press, first.id)).toEqual([]);
    expect(setRecords([first, better], press, better.id).map((event) => event.kind)).toEqual([
      'reps',
      'e1rm',
    ]);
  });
});

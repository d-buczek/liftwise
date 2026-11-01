import { newId, type DatedSet } from '@liftwise/core';
import { describe, expect, it } from 'vite-plus/test';
import { makeExercise, makeSet } from '../testing';
import { byMonth, exerciseLog, historyDays, historyExercises } from './history';

const press = makeExercise({ name_pl: 'Wyciskanie hantli', aliases: ['DB press'] });
const row = makeExercise({ name_pl: 'Wiosłowanie hantlem' });
const dated = (date: string, fields: Parameters<typeof makeSet>[0]): DatedSet => ({
  ...makeSet(fields),
  date,
});

describe('historyDays', () => {
  it('lists days with done sets newest first, exercises in the day order', () => {
    const sets = [
      dated('2026-10-27', { exercise_id: row.id, position: 2 }),
      dated('2026-10-27', { exercise_id: press.id, position: 0, warmup: true }),
      dated('2026-10-27', { exercise_id: press.id, position: 1 }),
      dated('2026-10-30', { exercise_id: row.id, position: 0 }),
      dated('2026-10-30', { exercise_id: press.id, position: 1, status: 'planned' }),
      dated('2026-11-02', { exercise_id: press.id, position: 0, status: 'planned' }),
    ];
    expect(historyDays(sets)).toEqual([
      { date: '2026-10-30', exerciseIds: [row.id], sets: 1 },
      { date: '2026-10-27', exerciseIds: [press.id, row.id], sets: 3 },
    ]);
  });

  it('merges two workouts of one date', () => {
    const sets = [
      dated('2026-10-27', { workout_id: newId(), exercise_id: press.id, position: 0 }),
      dated('2026-10-27', { workout_id: newId(), exercise_id: row.id, position: 0 }),
    ];
    expect(historyDays(sets)).toEqual([
      { date: '2026-10-27', exerciseIds: [press.id, row.id], sets: 2 },
    ]);
  });
});

describe('byMonth', () => {
  it('splits dated items by month in their order', () => {
    const items = [{ date: '2026-11-02' }, { date: '2026-10-30' }, { date: '2026-10-27' }];
    expect(byMonth(items)).toEqual([
      { month: '2026-11', items: [{ date: '2026-11-02' }] },
      { month: '2026-10', items: [{ date: '2026-10-30' }, { date: '2026-10-27' }] },
    ]);
  });
});

describe('historyExercises', () => {
  const sets = [
    dated('2026-10-27', { exercise_id: press.id, weight_kg: 20, reps: 10 }),
    dated('2026-10-30', { exercise_id: press.id, weight_kg: 10, warmup: true, position: 0 }),
    dated('2026-10-30', {
      exercise_id: press.id,
      weight_kg: 22.5,
      reps: 9,
      position: 2,
      performed_at: '2026-10-30T18:10:00+01:00',
    }),
    dated('2026-10-30', {
      exercise_id: press.id,
      weight_kg: 22.5,
      reps: 10,
      position: 1,
      performed_at: '2026-10-30T18:05:00+01:00',
    }),
    dated('2026-10-28', { exercise_id: row.id }),
    dated('2026-11-02', { exercise_id: row.id, status: 'planned' }),
    dated('2026-10-29', { exercise_id: newId() }),
  ];
  const catalog = [press, row, makeExercise({ name_pl: 'Przysiad' })];

  it('lists catalog exercises with done sets, the last done first, with its working sets', () => {
    const result = historyExercises(sets, catalog, '');
    expect(result.map((item) => [item.exercise.id, item.date])).toEqual([
      [press.id, '2026-10-30'],
      [row.id, '2026-10-28'],
    ]);
    expect(result[0]?.sets.map((set) => set.reps)).toEqual([10, 9]);
  });

  it('filters by name and aliases', () => {
    expect(historyExercises(sets, catalog, 'db').map((item) => item.exercise.id)).toEqual([
      press.id,
    ]);
    expect(historyExercises(sets, catalog, 'wioslowanie').map((item) => item.exercise.id)).toEqual([
      row.id,
    ]);
    expect(historyExercises(sets, catalog, 'przysiad')).toEqual([]);
  });
});

describe('exerciseLog', () => {
  it('groups the done sets by day, newest first, warm-ups included', () => {
    const sets = [
      dated('2026-10-27', { exercise_id: press.id, reps: 10, position: 1 }),
      dated('2026-10-27', { exercise_id: press.id, reps: 12, position: 0, warmup: true }),
      dated('2026-10-27', { exercise_id: row.id }),
      dated('2026-10-30', { exercise_id: press.id, reps: 11 }),
      dated('2026-11-02', { exercise_id: press.id, status: 'planned' }),
    ];
    expect(
      exerciseLog(sets, press.id).map((session) => [
        session.date,
        session.sets.map((set) => set.reps),
      ]),
    ).toEqual([
      ['2026-10-30', [11]],
      ['2026-10-27', [12, 10]],
    ]);
  });
});

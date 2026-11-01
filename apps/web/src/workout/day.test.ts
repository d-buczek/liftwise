import { newId, seedCatalog, type DatedSet, type Exercise } from '@liftwise/core';
import { describe, expect, it } from 'vite-plus/test';
import { makeSet } from '../testing';
import {
  dayWorkout,
  exerciseBlocks,
  extraSet,
  nextPosition,
  plannedSetsFor,
  reorderBlocks,
  stepValue,
  stepWeight,
} from './day';

const catalog = seedCatalog();
const press = catalog.find((exercise) => exercise.measure === 'reps') as Exercise;
const plank = catalog.find((exercise) => exercise.measure === 'time') as Exercise;
const [a, b, c] = [newId(), newId(), newId()];

describe('exerciseBlocks', () => {
  it('groups sets per exercise in the order of their first set', () => {
    const sets = [
      makeSet({ exercise_id: b, position: 1 }),
      makeSet({ exercise_id: a, position: 0 }),
      makeSet({ exercise_id: a, position: 2 }),
    ];
    const blocks = exerciseBlocks(sets);
    expect(blocks.map((block) => block.exerciseId)).toEqual([a, b]);
    expect(blocks[0]?.sets.map((set) => set.position)).toEqual([0, 2]);
  });

  it('renumbers the day after moving a block and returns the changed sets', () => {
    const sets = [
      makeSet({ exercise_id: a, position: 0 }),
      makeSet({ exercise_id: a, position: 1 }),
      makeSet({ exercise_id: b, position: 2 }),
      makeSet({ exercise_id: c, position: 5 }),
    ];
    const changed = reorderBlocks(exerciseBlocks(sets), 2, 0);
    expect(changed.map((set) => [set.exercise_id, set.position])).toEqual([
      [c, 0],
      [a, 1],
      [a, 2],
      [b, 3],
    ]);
    expect(reorderBlocks(exerciseBlocks(sets.slice(0, 3)), 0, 0)).toEqual([]);
  });
});

describe('day helpers', () => {
  it('sends new sets to the oldest workout of the day', () => {
    expect(dayWorkout([{ id: '019a2' }, { id: '019a1' }])?.id).toBe('019a1');
    expect(dayWorkout([])).toBeNull();
    expect(nextPosition([])).toBe(0);
    expect(nextPosition([{ position: 4 }, { position: 2 }])).toBe(5);
  });

  it('plans an added exercise from its last session before the day', () => {
    const at = (date: string, fields: Parameters<typeof makeSet>[0]): DatedSet => ({
      ...makeSet({ exercise_id: press.id, ...fields }),
      date,
    });
    const workout = newId();
    const history = [
      at('2026-10-01', { weight_kg: 18 }),
      at('2026-10-05', { workout_id: workout, weight_kg: 20, reps: 9, position: 1 }),
      at('2026-10-05', { workout_id: workout, weight_kg: 10, warmup: true, position: 0 }),
      at('2026-10-09', { weight_kg: 22 }),
    ];
    const sets = plannedSetsFor(press, history, '2026-10-09', { workoutId: 'w', start: 3 });
    expect(sets).toMatchObject([
      { workout_id: 'w', position: 3, status: 'planned', weight_kg: 20, reps: 9, warmup: false },
    ]);
  });

  it('plans one set at the range min and 0 kg without history', () => {
    const target = { workoutId: 'w', start: 0 };
    expect(plannedSetsFor(press, [], '2026-10-09', target)).toMatchObject([
      { weight_kg: 0, reps: press.measure === 'reps' ? press.rep_range.min : null },
    ]);
    expect(plannedSetsFor(plank, [], '2026-10-09', target)).toMatchObject([
      { reps: null, duration_s: plank.measure === 'time' ? plank.time_range_s.min : null },
    ]);
  });

  it('adds a planned copy of the last set', () => {
    const last = makeSet({ position: 3, rir: 1, note: 'x', weight_kg: 22.5 });
    const extra = extraSet({ exerciseId: last.exercise_id, sets: [makeSet(), last] }, 7);
    expect(extra).toMatchObject({ position: 7, status: 'planned', weight_kg: 22.5, rir: null });
    expect(extra.id).not.toBe(last.id);
    expect(extra.performed_at).toBeNull();
  });

  it('steps the weight by the exercise step and values by one step, with floors', () => {
    expect(stepWeight(20, 1.25, 1)).toBe(21.25);
    expect(stepWeight(1, 1.25, -1)).toBe(0);
    expect(stepValue('reps', 1, -1)).toBe(1);
    expect(stepValue('reps', 9, 1)).toBe(10);
    expect(stepValue('time', 45, 1)).toBe(50);
    expect(stepValue('time', 7, -1)).toBe(5);
  });
});

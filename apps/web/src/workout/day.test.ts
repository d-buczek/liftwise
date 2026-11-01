import { newId } from '@liftwise/core';
import { describe, expect, it } from 'vite-plus/test';
import { makeSet } from '../testing';
import { exerciseBlocks, extraSet, reorderBlocks, stepValue, stepWeight } from './day';

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
    const { changed } = reorderBlocks(exerciseBlocks(sets), 2, 0);
    expect(changed.map((set) => [set.exercise_id, set.position])).toEqual([
      [c, 0],
      [a, 1],
      [a, 2],
      [b, 3],
    ]);
    expect(reorderBlocks(exerciseBlocks(sets.slice(0, 3)), 0, 0).changed).toEqual([]);
  });

  it('bases the next move on the positions of the previous one', () => {
    const sets = [a, b, c].map((exercise_id, position) => makeSet({ exercise_id, position }));
    const first = reorderBlocks(exerciseBlocks(sets), 2, 0);
    // c, a, b → a, c, b: a was at 1 after the first move, so it changes again.
    const { blocks, changed } = reorderBlocks(first.blocks, 1, 0);
    expect(changed.map((set) => [set.exercise_id, set.position])).toEqual([
      [a, 0],
      [c, 1],
    ]);
    expect(blocks.flatMap((block) => block.sets.map((set) => set.position))).toEqual([0, 1, 2]);
  });
});

describe('day helpers', () => {
  it('adds a planned copy of the last set', () => {
    const last = makeSet({ position: 3, rir: 1, note: 'x', weight_kg: 22.5 });
    const block = { exerciseId: last.exercise_id, sets: [makeSet(), last] };
    const extra = extraSet(block, { workoutId: 'oldest', start: 7 });
    expect(extra).toMatchObject({
      workout_id: 'oldest',
      position: 7,
      status: 'planned',
      weight_kg: 22.5,
      rir: null,
    });
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

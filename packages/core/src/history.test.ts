import { describe, expect, it } from 'vite-plus/test';
import { datedSets } from './history';
import { newId } from './ids';
import { makeSet } from './testing';

describe('datedSets', () => {
  it('attaches the workout date and skips sets without a workout', () => {
    const workout = { id: newId(), date: '2026-10-31' };
    const set = makeSet({ workout_id: workout.id });
    expect(datedSets([workout], [set, makeSet()])).toEqual([{ ...set, date: '2026-10-31' }]);
  });
});

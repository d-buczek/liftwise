import { describe, expect, it } from 'vite-plus/test';
import { newId } from '../ids';
import { exerciseSchema } from './exercise';

const base = {
  name_pl: 'Wyciskanie hantli na ławce płaskiej',
  primary_muscles: ['chest'],
  patterns: ['horizontal_push'],
  requires: ['dumbbells', 'bench'],
  implements: 2,
  unilateral: false,
  rest_seconds: 120,
};

describe('exerciseSchema', () => {
  it('parses a reps exercise and fills defaults', () => {
    const ex = exerciseSchema.parse({
      ...base,
      id: newId(),
      measure: 'reps',
      rep_range: { min: 6, max: 12 },
    });
    expect(ex).toMatchObject({
      aliases: [],
      secondary_muscles: [],
      weight_step_kg: null,
      note: null,
      archived: false,
    });
  });

  it('parses a timed exercise with a time range', () => {
    const ex = exerciseSchema.parse({
      ...base,
      id: newId(),
      measure: 'time',
      time_range_s: { min: 30, max: 90 },
    });
    expect(ex.measure === 'time' && ex.time_range_s).toEqual({ min: 30, max: 90 });
  });

  it('requires the range that matches the measure', () => {
    const timedWithReps = { ...base, id: newId(), measure: 'time', rep_range: { min: 6, max: 12 } };
    expect(exerciseSchema.safeParse(timedWithReps).success).toBe(false);
  });

  const valid = { ...base, id: newId(), measure: 'reps', rep_range: { min: 6, max: 12 } };

  it.each([
    { implements: 3 },
    { primary_muscles: [] },
    { primary_muscles: ['traps'] },
    { requires: ['kettlebell'] },
    { weight_step_kg: 0 },
    { secondary_muscles: ['chest'] },
    { id: 'bench-press' },
  ])('rejects %o', (patch) => {
    expect(exerciseSchema.safeParse(valid).success).toBe(true);
    expect(exerciseSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

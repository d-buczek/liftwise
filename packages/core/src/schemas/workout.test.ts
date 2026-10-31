import { describe, expect, it } from 'vite-plus/test';
import { newId } from '../ids';
import { workoutSchema } from './workout';

describe('workoutSchema', () => {
  it('parses a planned workout on a local date', () => {
    expect(workoutSchema.parse({ id: newId(), date: '2026-11-02' })).toMatchObject({
      started_at: null,
      ended_at: null,
      checkin: null,
      rationale: null,
      note: '',
    });
  });

  it('validates the check-in', () => {
    const workout = { id: newId(), date: '2026-11-02' };
    const checkin = { time_min: 40, wellbeing: 4, pain: 'kolano' };
    expect(workoutSchema.safeParse({ ...workout, checkin }).success).toBe(true);
    const badCheckin = { ...checkin, wellbeing: 6 };
    expect(workoutSchema.safeParse({ ...workout, checkin: badCheckin }).success).toBe(false);
  });
});

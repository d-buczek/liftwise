import { describe, expect, it } from 'vite-plus/test';
import { addMonths, dateValue, dayMarks, monthGrid, today } from './calendar';

describe('calendar', () => {
  it('formats the local date and parses it back at local midnight', () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dateValue('2026-01-05')).toEqual(new Date(2026, 0, 5));
  });

  it('adds months across years', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  it('covers the month with Monday-to-Sunday weeks', () => {
    // 1 Nov 2026 is a Sunday, 30 Nov a Monday.
    const weeks = monthGrid('2026-11');
    expect(weeks).toHaveLength(6);
    expect(weeks[0]?.[0]).toBe('2026-10-26');
    expect(weeks[0]?.[6]).toBe('2026-11-01');
    expect(weeks.at(-1)).toEqual([
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
    ]);
    // February 2021 starts on a Monday and fills exactly four weeks.
    expect(monthGrid('2021-02')).toHaveLength(4);
  });

  it('marks a day done when any set is done, else planned', () => {
    const workouts = [
      { id: 'a', date: '2026-11-02' },
      { id: 'b', date: '2026-11-02' },
      { id: 'c', date: '2026-11-04' },
    ];
    const marks = dayMarks(workouts, [
      { workout_id: 'a', status: 'planned' },
      { workout_id: 'b', status: 'done' },
      { workout_id: 'c', status: 'planned' },
      { workout_id: 'gone', status: 'done' },
    ]);
    expect([...marks]).toEqual([
      ['2026-11-02', 'done'],
      ['2026-11-04', 'planned'],
    ]);
  });
});

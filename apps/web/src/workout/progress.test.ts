import { describe, expect, it } from 'vite-plus/test';
import type { DayMark } from './calendar';
import { setsShare, steelStage, weekDone, weekShare } from './progress';

const MONDAY = '2026-11-02';
const marks = new Map<string, DayMark>([
  ['2026-11-01', 'done'], // the Sunday before
  ['2026-11-03', 'done'],
  ['2026-11-04', 'planned'],
  ['2026-11-06', 'planned'],
  ['2026-11-07', 'done'],
  ['2026-11-09', 'done'], // the Monday after
]);

describe('setsShare', () => {
  it('counts done working sets and leaves warm-ups out', () => {
    expect(
      setsShare([
        { status: 'done', warmup: true },
        { status: 'done', warmup: false },
        { status: 'planned', warmup: false },
        { status: 'planned', warmup: true },
      ]),
    ).toBe(0.5);
  });

  it('is 0 for a day without working sets', () => {
    expect(setsShare([])).toBe(0);
    expect(setsShare([{ status: 'done', warmup: true }])).toBe(0);
  });
});

describe('the week', () => {
  it('lights the days with a done workout, Monday first', () => {
    expect(weekDone(marks, MONDAY)).toEqual([false, true, false, false, false, true, false]);
  });

  it('takes the share of the week only', () => {
    expect(weekShare(marks, MONDAY)).toBe(0.5);
  });

  it('is 0 for a week without workouts', () => {
    expect(weekShare(new Map(), MONDAY)).toBe(0);
  });
});

describe('steelStage', () => {
  it('splits the share into four stages and ends in the last', () => {
    expect([0, 0.24, 0.25, 0.5, 0.74, 0.75, 1].map(steelStage)).toEqual([0, 0, 1, 2, 2, 3, 3]);
  });
});

import { describe, expect, it } from 'vite-plus/test';
import { addDays, daysBetween, weekOf } from './dates';

describe('local dates', () => {
  it('counts calendar days, also across DST and year ends', () => {
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2026-10-31', '2026-10-17')).toBe(-14);
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  });

  it('finds the Monday–Sunday week', () => {
    expect(weekOf('2026-10-31')).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(weekOf('2026-10-26')).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(weekOf('2026-11-01')).toEqual({ start: '2026-10-26', end: '2026-11-01' });
  });
});

import type { ProgressPoint } from '@liftwise/core';
import { describe, expect, it } from 'vite-plus/test';
import { makeExercise } from '../testing';
import { chartMetrics, metricSeries, nearestIndex, niceTicks } from './charts';

const point = (date: string, fields: Partial<ProgressPoint> = {}): ProgressPoint => ({
  date,
  weight_kg: 20,
  value: 10,
  e1rm: 26.7,
  volume_kg: 800,
  ...fields,
});

describe('chartMetrics', () => {
  it('offers weight, e1RM and volume, top-set reps at bodyweight, duration for timed', () => {
    const press = makeExercise();
    expect(chartMetrics(press, [point('2026-10-01')])).toEqual(['weight', 'e1rm', 'volume']);
    expect(chartMetrics(press, [])).toEqual(['weight', 'e1rm', 'volume']);
    expect(chartMetrics(press, [point('2026-10-01', { weight_kg: 0, e1rm: null })])).toEqual([
      'reps',
    ]);
    expect(
      chartMetrics(makeExercise({ measure: 'time', time_range_s: { min: 30, max: 60 } }), []),
    ).toEqual(['duration']);
  });
});

describe('metricSeries', () => {
  const points = [
    point('2025-10-01', { weight_kg: 18 }),
    point('2026-08-01', { e1rm: null, volume_kg: 0, weight_kg: 0, value: 15 }),
    point('2026-10-01', { weight_kg: 22, value: 8 }),
  ];

  it('picks the metric and skips days without a value', () => {
    expect(metricSeries(points, 'weight', 'all', '2026-11-01')).toEqual([
      { date: '2025-10-01', value: 18 },
      { date: '2026-08-01', value: 0 },
      { date: '2026-10-01', value: 22 },
    ]);
    expect(metricSeries(points, 'e1rm', 'all', '2026-11-01').map((p) => p.date)).toEqual([
      '2025-10-01',
      '2026-10-01',
    ]);
    expect(metricSeries(points, 'reps', 'all', '2026-11-01').map((p) => p.value)).toEqual([
      10, 15, 8,
    ]);
  });

  it('keeps the range ending today', () => {
    expect(metricSeries(points, 'weight', '3m', '2026-11-01').map((p) => p.date)).toEqual([
      '2026-10-01',
    ]);
    expect(metricSeries(points, 'weight', '1y', '2026-10-01').map((p) => p.date)).toEqual([
      '2026-08-01',
      '2026-10-01',
    ]);
    expect(metricSeries(points, 'weight', '1y', '2026-09-30')).toHaveLength(3);
  });
});

describe('niceTicks', () => {
  it('covers the values with clean steps', () => {
    expect(niceTicks(18, 24)).toEqual([18, 20, 22, 24]);
    expect(niceTicks(17.5, 24.5)).toEqual([16, 18, 20, 22, 24, 26]);
    expect(niceTicks(0, 3200)).toEqual([0, 1000, 2000, 3000, 4000]);
    expect(niceTicks(0.5, 1.25)).toEqual([0.4, 0.6, 0.8, 1, 1.2, 1.4]);
  });

  it('pads a single value without going below 0', () => {
    expect(niceTicks(20, 20)).toEqual([18, 19, 20, 21, 22]);
    expect(niceTicks(0, 0)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('keeps whole steps for whole values', () => {
    expect(niceTicks(10, 12, 4, 1)).toEqual([10, 11, 12]);
    expect(niceTicks(0, 0, 4, 1)).toEqual([0, 1]);
    expect(niceTicks(45, 45, 4, 1)).toEqual([40, 45, 50]);
  });
});

describe('nearestIndex', () => {
  it('finds the closest value, the first on a tie', () => {
    expect(nearestIndex([0, 10, 20], 14)).toBe(1);
    expect(nearestIndex([0, 10, 20], 15)).toBe(1);
    expect(nearestIndex([0, 10, 20], 99)).toBe(2);
  });
});

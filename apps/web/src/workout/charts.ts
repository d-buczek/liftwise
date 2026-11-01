import { addDays, type Exercise, type ProgressPoint } from '@liftwise/core';

// What an exercise's chart shows (§5.4): the top set's weight, the e1RM and the volume per day;
// at bodyweight only the top set's reps, for a timed exercise the top set's duration.
export type ChartMetric = 'weight' | 'e1rm' | 'volume' | 'reps' | 'duration';

export type ChartRange = '3m' | '1y' | 'all';
export const CHART_RANGES: ChartRange[] = ['3m', '1y', 'all'];
const RANGE_DAYS = { '3m': 91, '1y': 365 };

export type ChartPoint = { date: string; value: number };

export function chartMetrics(
  exercise: Pick<Exercise, 'measure'>,
  points: ProgressPoint[],
): ChartMetric[] {
  if (exercise.measure === 'time') return ['duration'];
  return points.length > 0 && points.every((point) => point.weight_kg === 0)
    ? ['reps']
    : ['weight', 'e1rm', 'volume'];
}

// The metric's points from the range's first day on (the range ends today); days without a
// value (an e1RM at 0 kg) are left out.
export function metricSeries(
  points: ProgressPoint[],
  metric: ChartMetric,
  range: ChartRange,
  today: string,
): ChartPoint[] {
  const from = range === 'all' ? '' : addDays(today, 1 - RANGE_DAYS[range]);
  return points.flatMap((point) => {
    const value = {
      weight: point.weight_kg,
      e1rm: point.e1rm,
      volume: point.volume_kg,
      reps: point.value,
      duration: point.value,
    }[metric];
    return point.date >= from && value !== null ? [{ date: point.date, value }] : [];
  });
}

// Clean axis ticks covering the values: about `count` steps of 1, 2, 2.5 or 5 × 10ⁿ (at least
// `minStep`, 1 for whole reps), never below 0 for values that aren't.
export function niceTicks(min: number, max: number, count = 4, minStep = 0): number[] {
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 1);
    min = min >= 0 ? Math.max(0, min - pad) : min - pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 2.5, 5, 10]
    .map((factor) => factor * power)
    .find((s) => s >= raw && (minStep < 1 || Number.isInteger(s)));
  const step = Math.max(nice ?? raw, minStep);
  const ticks: number[] = [];
  const last = Math.ceil(max / step - 1e-9);
  for (let i = Math.floor(min / step + 1e-9); i <= last; i++) {
    ticks.push(Number((i * step).toFixed(10)));
  }
  return ticks;
}

// The index of the value closest to `x`; values are ascending.
export function nearestIndex(values: number[], x: number): number {
  let best = 0;
  values.forEach((value, i) => {
    if (Math.abs(value - x) < Math.abs((values[best] ?? 0) - x)) best = i;
  });
  return best;
}

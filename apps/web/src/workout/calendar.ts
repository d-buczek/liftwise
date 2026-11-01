import {
  addDays,
  dayLabelId,
  weekOf,
  type Workout,
  type WorkoutLabel,
  type WorkoutSet,
} from '@liftwise/core';

// The device's local date (§5.1): the day a workout belongs to.
export function today(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// A local date at local midnight, for formatting with the i18n date formats.
export function dateValue(date: string): Date {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// `YYYY-MM` of a local date.
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(month: string, months: number): string {
  const [year = 0, index = 1] = month.split('-').map(Number);
  const total = year * 12 + index - 1 + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// The month view: Monday-to-Sunday weeks covering the month, days of the neighbouring months
// filling the first and the last week.
export function monthGrid(month: string): string[][] {
  const next = `${addMonths(month, 1)}-01`;
  const weeks: string[][] = [];
  for (let start = weekOf(`${month}-01`).start; start < next; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

// The Monday of the week the summary card starts at (§5.11): this week in the current month,
// the last week of any other month.
export function summaryWeek(month: string, date: string): string {
  return monthOf(date) === month
    ? weekOf(date).start
    : weekOf(addDays(`${addMonths(month, 1)}-01`, -1)).start;
}

// Done: the day has a done set; planned: it only has planned sets (D30).
export type DayMark = 'done' | 'planned';

export function dayMarks(
  workouts: Pick<Workout, 'id' | 'date'>[],
  sets: Pick<WorkoutSet, 'workout_id' | 'status'>[],
): Map<string, DayMark> {
  const dates = new Map(workouts.map((workout) => [workout.id, workout.date]));
  const marks = new Map<string, DayMark>();
  for (const set of sets) {
    const date = dates.get(set.workout_id);
    if (date === undefined) continue;
    if (set.status === 'done') marks.set(date, 'done');
    else if (!marks.has(date)) marks.set(date, 'planned');
  }
  return marks;
}

// The label of each date whose workouts have one (D48); a label missing from `labels` is skipped.
export function dayLabels<L extends Pick<WorkoutLabel, 'id'>>(
  workouts: Pick<Workout, 'id' | 'date' | 'label_id'>[],
  labels: L[],
): Map<string, L> {
  const byId = new Map(labels.map((label) => [label.id, label]));
  const byDate = new Map<string, Pick<Workout, 'id' | 'label_id'>[]>();
  for (const workout of workouts) {
    byDate.set(workout.date, [...(byDate.get(workout.date) ?? []), workout]);
  }
  const result = new Map<string, L>();
  for (const [date, dayWorkouts] of byDate) {
    const label = byId.get(dayLabelId(dayWorkouts) ?? '');
    if (label) result.set(date, label);
  }
  return result;
}

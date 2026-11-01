import { compareHistory, isWorkingSet, type DatedSet, type Exercise } from '@liftwise/core';
import { monthOf } from './calendar';
import { exerciseBlocks } from './day';
import { matchesQuery } from './search';

// The history screens (§5.4): done workouts, exercises with history and one exercise's sessions.
// Planned sets never count.

export type HistoryDay = { date: string; exerciseIds: string[]; sets: number };

// Days with a done set, newest first: the exercises done in the day's order and the number of
// done sets (warm-ups included).
export function historyDays(sets: DatedSet[]): HistoryDay[] {
  return [...doneByDate(sets)]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, daySets]) => ({
      date,
      exerciseIds: exerciseBlocks(daySets).map((block) => block.exerciseId),
      sets: daySets.length,
    }));
}

// Items in date order split by `YYYY-MM`, keeping the order.
export function byMonth<T extends { date: string }>(items: T[]): { month: string; items: T[] }[] {
  const months: { month: string; items: T[] }[] = [];
  for (const item of items) {
    const month = monthOf(item.date);
    const last = months.at(-1);
    if (last?.month === month) last.items.push(item);
    else months.push({ month, items: [item] });
  }
  return months;
}

// An exercise with history: the date it was last done and that day's working sets.
export type HistoryExercise = { exercise: Exercise; date: string; sets: DatedSet[] };

// Catalog exercises with a done set that match the search, the most recently done first.
export function historyExercises(
  sets: DatedSet[],
  catalog: Exercise[],
  query: string,
): HistoryExercise[] {
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const last = new Map<string, DatedSet[]>();
  for (const set of sets) {
    if (set.status !== 'done' || !byId.has(set.exercise_id)) continue;
    const day = last.get(set.exercise_id);
    const date = day?.[0]?.date;
    if (!day || date === undefined || set.date > date) last.set(set.exercise_id, [set]);
    else if (set.date === date) day.push(set);
  }
  return [...last]
    .flatMap(([id, day]) => {
      const exercise = byId.get(id);
      const date = day[0]?.date;
      if (!exercise || date === undefined || !matchesQuery(exercise, query)) return [];
      return [{ exercise, date, sets: day.filter(isWorkingSet).sort(compareHistory) }];
    })
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || a.exercise.name_pl.localeCompare(b.exercise.name_pl, 'pl'),
    );
}

export type HistorySession = { date: string; sets: DatedSet[] };

// One exercise's done sets per day, newest day first, the sets in the order done (warm-ups
// included). Two workouts of one date make one session: a tap opens that day.
export function exerciseLog(sets: DatedSet[], exerciseId: string): HistorySession[] {
  return [...doneByDate(sets.filter((set) => set.exercise_id === exerciseId))]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, daySets]) => ({ date, sets: daySets.sort(compareHistory) }));
}

function doneByDate(sets: DatedSet[]): Map<string, DatedSet[]> {
  const days = new Map<string, DatedSet[]>();
  for (const set of sets) {
    if (set.status !== 'done') continue;
    const day = days.get(set.date);
    if (day) day.push(set);
    else days.set(set.date, [set]);
  }
  return days;
}

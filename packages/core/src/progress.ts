import { hardSetsByGroup } from './balance';
import { addDays, weekOf } from './dates';
import { exerciseHistory, type DatedSet } from './history';
import { e1rm } from './records';
import type { Exercise, MuscleGroup } from './schemas/exercise';
import { setValue } from './schemas/set';

// One point per training day of an exercise, the input of its charts (§5.4).
export type ProgressPoint = {
  date: string;
  // The top set: the heaviest working set, the most reps (seconds) on a tie.
  weight_kg: number;
  // Reps or seconds of the top set, by the exercise's measure.
  value: number;
  // The day's best e1RM; null for timed exercises and days at 0 kg only.
  e1rm: number | null;
  // Weight × reps × implements over the day's working sets; null for timed exercises.
  volume_kg: number | null;
};

// The exercise's working sets per day, oldest first; workouts of one day count as one session.
export function exerciseProgress(
  sets: DatedSet[],
  exercise: Pick<Exercise, 'id' | 'measure' | 'implements'>,
): ProgressPoint[] {
  const days = new Map<string, DatedSet[]>();
  for (const set of exerciseHistory(sets, exercise)) {
    days.set(set.date, [...(days.get(set.date) ?? []), set]);
  }
  const reps = exercise.measure === 'reps';
  return [...days].map(([date, day]) => {
    const top = day.reduce((best, set) =>
      set.weight_kg > best.weight_kg ||
      (set.weight_kg === best.weight_kg && setValue(set) > setValue(best))
        ? set
        : best,
    );
    const estimates = day
      .filter((set) => set.weight_kg > 0)
      .map((set) => e1rm(set.weight_kg, setValue(set)));
    return {
      date,
      weight_kg: top.weight_kg,
      value: setValue(top),
      e1rm: reps && estimates.length > 0 ? Math.max(...estimates) : null,
      volume_kg: reps
        ? day.reduce((sum, set) => sum + set.weight_kg * setValue(set) * exercise.implements, 0)
        : null,
    };
  });
}

export type WeekHardSets = { start: string; hardSets: number };

// A muscle group's hard sets per Monday–Sunday week (§5.8 weighting), from the week of `from`
// through the week of `to`, oldest first; weeks without a set are 0.
export function weeklyHardSets(
  sets: DatedSet[],
  exercises: Exercise[],
  group: MuscleGroup,
  from: string,
  to: string,
): WeekHardSets[] {
  const first = weekOf(from).start;
  const last = weekOf(to).start;
  const byWeek = new Map<string, DatedSet[]>();
  for (const set of sets) {
    const { start } = weekOf(set.date);
    if (start < first || start > last) continue;
    byWeek.set(start, [...(byWeek.get(start) ?? []), set]);
  }
  const weeks: WeekHardSets[] = [];
  for (let start = first; start <= last; start = addDays(start, 7)) {
    weeks.push({ start, hardSets: hardSetsByGroup(byWeek.get(start) ?? [], exercises)[group] });
  }
  return weeks;
}

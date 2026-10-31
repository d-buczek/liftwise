import type { WorkoutSet } from './schemas/set';
import type { Workout } from './schemas/workout';

// A set with the local date of its workout: the input of every history calculation.
export type DatedSet = WorkoutSet & { date: string };

// Sets whose workout is missing are skipped.
export function datedSets(
  workouts: Pick<Workout, 'id' | 'date'>[],
  sets: WorkoutSet[],
): DatedSet[] {
  const dates = new Map(workouts.map((workout) => [workout.id, workout.date]));
  return sets.flatMap((set) => {
    const date = dates.get(set.workout_id);
    return date === undefined ? [] : [{ ...set, date }];
  });
}

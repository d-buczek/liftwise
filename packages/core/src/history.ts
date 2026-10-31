import { isWorkingSet } from './conventions';
import type { Exercise } from './schemas/exercise';
import { setMatchesMeasure, type WorkoutSet } from './schemas/set';
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

// Chronological order: date, then performed_at, then position.
export function compareHistory(a: DatedSet, b: DatedSet): number {
  return a.date.localeCompare(b.date) || performedMs(a) - performedMs(b) || a.position - b.position;
}

function performedMs(set: DatedSet): number {
  return set.performed_at === null ? 0 : Date.parse(set.performed_at);
}

// The exercise's working sets in chronological order, only those before `before` when given.
// Sets in the other measure (the exercise was edited) are skipped.
export function exerciseHistory(
  sets: DatedSet[],
  exercise: Pick<Exercise, 'id' | 'measure'>,
  before?: string,
): DatedSet[] {
  return sets
    .filter(
      (set) =>
        set.exercise_id === exercise.id &&
        isWorkingSet(set) &&
        setMatchesMeasure(set, exercise) &&
        (before === undefined || set.date < before),
    )
    .sort(compareHistory);
}

export type ExerciseSession = { workout_id: string; date: string; sets: DatedSet[] };

// The exercise's history grouped by workout, oldest first.
export function exerciseSessions(
  sets: DatedSet[],
  exercise: Pick<Exercise, 'id' | 'measure'>,
  before?: string,
): ExerciseSession[] {
  const sessions = new Map<string, ExerciseSession>();
  for (const set of exerciseHistory(sets, exercise, before)) {
    const session = sessions.get(set.workout_id);
    if (session) session.sets.push(set);
    else sessions.set(set.workout_id, { workout_id: set.workout_id, date: set.date, sets: [set] });
  }
  return [...sessions.values()];
}

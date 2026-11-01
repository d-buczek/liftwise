import { isDoneSet, roundWeightKg, weightStepKg } from './conventions';
import { newId as defaultNewId } from './ids';
import type { Exercise } from './schemas/exercise';
import type { WorkoutSet } from './schemas/set';
import type { TrainingSettings } from './schemas/settings';
import type { Workout } from './schemas/workout';

export type CopyWorkoutInput = {
  // Sets of the source workout.
  source: WorkoutSet[];
  // The target day's workout and the sets it already has.
  target: { workoutId: string; sets: Pick<WorkoutSet, 'position'>[] };
  // "Kopiuj jako lżejszy" (D33); exercises and settings give the weight step.
  light?: { exercises: Exercise[]; training: Pick<TrainingSettings, 'weight_step_kg'> };
  newId?: () => string;
};

// Copies a workout 1:1 as planned sets appended after the target's sets (§5.2). Done sets of the
// source are copied; a source with no done sets copies its planned sets. Returns the new sets only.
export function copyWorkout({
  source,
  target,
  light,
  newId = defaultNewId,
}: CopyWorkoutInput): WorkoutSet[] {
  const hasDone = source.some(isDoneSet);
  let sets = source
    .filter((set) => !hasDone || isDoneSet(set))
    .sort((a, b) => a.position - b.position);
  if (light) sets = lighten(sets, light.exercises, light.training);
  const start = Math.max(-1, ...target.sets.map((set) => set.position)) + 1;
  return sets.map((set, i) => ({
    id: newId(),
    workout_id: target.workoutId,
    exercise_id: set.exercise_id,
    position: start + i,
    status: 'planned',
    weight_kg: set.weight_kg,
    reps: set.reps,
    duration_s: set.duration_s,
    rir: null,
    warmup: set.warmup,
    note: '',
    performed_at: null,
    source: 'copy',
  }));
}

// Per exercise: the last working set is dropped (one stays) and working weights go down;
// warm-ups, reps and durations stay. Expects sets in position order.
function lighten(
  sets: WorkoutSet[],
  exercises: Exercise[],
  training: Pick<TrainingSettings, 'weight_step_kg'>,
): WorkoutSet[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const working = Map.groupBy(
    sets.filter((set) => !set.warmup),
    (set) => set.exercise_id,
  );
  const dropped = new Set<WorkoutSet>();
  for (const group of working.values()) {
    const last = group[group.length - 1];
    if (group.length > 1 && last) dropped.add(last);
  }
  return sets
    .filter((set) => !dropped.has(set))
    .map((set) =>
      set.warmup
        ? set
        : {
            ...set,
            weight_kg: lightWeightKg(
              set.weight_kg,
              weightStepKg(byId.get(set.exercise_id), training),
            ),
          },
    );
}

// Lowered by the whole steps closest to 10% (a tie takes the extra step): at least one step,
// never below 0 (D33).
export function lightWeightKg(weightKg: number, stepKg: number): number {
  const steps = Math.max(1, Math.round(weightKg / (10 * stepKg)));
  return Math.max(0, roundWeightKg(weightKg - steps * stepKg));
}

// The default copy source: the most recent workout with sets before the target day (§5.2);
// on the same date the later id (UUIDv7) wins. With `labelId`, the most recent one with that
// label ("Ostatni A", D48).
export function defaultCopySource<
  W extends Pick<Workout, 'id' | 'date'> & Partial<Pick<Workout, 'label_id'>>,
>(
  workouts: W[],
  sets: Pick<WorkoutSet, 'workout_id'>[],
  targetDate: string,
  labelId?: string,
): W | null {
  const withSets = new Set(sets.map((set) => set.workout_id));
  let best: W | null = null;
  for (const workout of workouts) {
    if (workout.date >= targetDate || !withSets.has(workout.id)) continue;
    if (labelId !== undefined && workout.label_id !== labelId) continue;
    if (!best || workout.date > best.date || (workout.date === best.date && workout.id > best.id)) {
      best = workout;
    }
  }
  return best;
}

import { exerciseSessions, type DatedSet } from './history';
import { newId as defaultNewId } from './ids';
import type { Exercise } from './schemas/exercise';
import type { WorkoutSet } from './schemas/set';
import { workoutSchema, type Workout } from './schemas/workout';

// The workout new sets of a day go to. Two devices offline can each create one for the same
// date; the day shows both and the oldest (smallest UUIDv7) takes new sets (D44).
export function dayWorkout<W extends Pick<Workout, 'id'>>(workouts: W[]): W | null {
  return workouts.reduce<W | null>((oldest, w) => (!oldest || w.id < oldest.id ? w : oldest), null);
}

export function nextPosition(sets: Pick<WorkoutSet, 'position'>[]): number {
  return Math.max(-1, ...sets.map((set) => set.position)) + 1;
}

// Planned sets for an exercise added to a day: the working sets of its last session before the
// day, else one set at the bottom of its range and 0 kg.
export function plannedSetsFor(
  exercise: Exercise,
  history: DatedSet[],
  date: string,
  target: { workoutId: string; start: number; source?: WorkoutSet['source'] },
  newId = defaultNewId,
): WorkoutSet[] {
  const last = exerciseSessions(history, exercise, date).at(-1)?.sets;
  const base: Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_s'>[] = last ?? [
    exercise.measure === 'time'
      ? { weight_kg: 0, reps: null, duration_s: exercise.time_range_s.min }
      : { weight_kg: 0, reps: exercise.rep_range.min, duration_s: null },
  ];
  return base.map((set, i) => ({
    id: newId(),
    workout_id: target.workoutId,
    exercise_id: exercise.id,
    position: target.start + i,
    status: 'planned',
    weight_kg: set.weight_kg,
    reps: set.reps,
    duration_s: set.duration_s,
    rir: null,
    warmup: false,
    note: '',
    performed_at: null,
    source: target.source ?? 'manual',
  }));
}

// A set reported as done, in the exercise's measure.
export type LoggedSet = Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_s'> &
  Partial<Pick<WorkoutSet, 'rir' | 'warmup' | 'note'>>;

export type LogSetsInput = {
  date: string;
  exerciseId: string;
  // The day's live workouts and sets.
  workouts: Workout[];
  sets: WorkoutSet[];
  logged: LoggedSet[];
  performedAt: string;
  source?: WorkoutSet['source'];
  newId?: () => string;
};

// Done sets of an exercise on a day (`log_sets`, §6.6): each completes the exercise's next
// planned set of the same kind (warm-up or working); the rest go to the end of the day in the
// workout new sets go to, created when the day has none. A workout whose first set gets done
// starts then. Returns the rows to write: the workouts created or started, and the sets.
export function logSets({
  date,
  exerciseId,
  workouts,
  sets,
  logged,
  performedAt,
  source = 'agent',
  newId = defaultNewId,
}: LogSetsInput): { workouts: Workout[]; sets: WorkoutSet[] } {
  const planned = sets
    .filter((set) => set.exercise_id === exerciseId && set.status === 'planned')
    .sort((a, b) => a.position - b.position);
  const used = new Set<string>();
  let target = dayWorkout(workouts);
  const created: Workout[] = [];
  const targetId = () => {
    if (!target) {
      target = workoutSchema.parse({ id: newId(), date });
      created.push(target);
    }
    return target.id;
  };
  let position = nextPosition(sets);

  const done = logged.map((entry): WorkoutSet => {
    const warmup = entry.warmup ?? false;
    const match = planned.find((set) => !used.has(set.id) && set.warmup === warmup);
    if (match) used.add(match.id);
    const base = match ?? {
      id: newId(),
      workout_id: targetId(),
      exercise_id: exerciseId,
      position: position++,
      note: '',
      source,
    };
    return {
      ...base,
      status: 'done',
      weight_kg: entry.weight_kg,
      reps: entry.reps,
      duration_s: entry.duration_s,
      rir: entry.rir ?? null,
      warmup,
      note: entry.note ?? base.note,
      performed_at: performedAt,
    };
  });

  const touched = new Set(done.map((set) => set.workout_id));
  const changed = [...workouts, ...created].flatMap((workout) => {
    const start = touched.has(workout.id) && workout.started_at === null;
    if (start) return [{ ...workout, started_at: performedAt }];
    return created.includes(workout) ? [workout] : [];
  });
  return { workouts: changed, sets: done };
}

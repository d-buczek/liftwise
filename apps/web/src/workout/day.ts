import {
  applyProgressionHint,
  exerciseSessions,
  newId as defaultNewId,
  progressionHint,
  roundWeightKg,
  TIME_STEP_S,
  type DatedSet,
  type Exercise,
  type Measure,
  type ProgressionHint,
  type ProgressionHintInput,
  type Workout,
  type WorkoutSet,
} from '@liftwise/core';

// The sets of one exercise on a day, in position order.
export type ExerciseBlock<S extends WorkoutSet = WorkoutSet> = { exerciseId: string; sets: S[] };

// The day's sets per exercise, in the order of each exercise's first set.
export function exerciseBlocks<S extends WorkoutSet>(sets: S[]): ExerciseBlock<S>[] {
  const blocks = new Map<string, S[]>();
  for (const set of [...sets].sort((a, b) => a.position - b.position)) {
    const block = blocks.get(set.exercise_id);
    if (block) block.push(set);
    else blocks.set(set.exercise_id, [set]);
  }
  return [...blocks].map(([exerciseId, blockSets]) => ({ exerciseId, sets: blockSets }));
}

// Moves a block and numbers every set of the day from 0 in the new order; returns the sets
// whose position changed.
export function reorderBlocks<S extends WorkoutSet>(
  blocks: ExerciseBlock<S>[],
  from: number,
  to: number,
): S[] {
  const order = [...blocks];
  const [moved] = order.splice(from, 1);
  if (moved) order.splice(to, 0, moved);
  return order
    .flatMap((block) => block.sets)
    .flatMap((set, position) => (set.position === position ? [] : [{ ...set, position }]));
}

// The workout new sets of a day go to. Two devices offline can each create one for the same
// date; the day shows both and the oldest (smallest UUIDv7) takes new sets.
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
  target: { workoutId: string; start: number },
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
    source: 'manual',
  }));
}

// One more planned set like the exercise's last one, at the end of the day.
export function extraSet(block: ExerciseBlock, start: number, newId = defaultNewId): WorkoutSet {
  const last = block.sets.at(-1);
  if (!last) throw new Error('an exercise block has sets');
  return {
    ...last,
    id: newId(),
    position: start,
    status: 'planned',
    rir: null,
    note: '',
    performed_at: null,
    source: 'manual',
  };
}

// The chip of an exercise of a day (§5.2): its hint and the planned sets applying it changes;
// null when it changes nothing. `block` are the exercise's sets of the day.
export function plannedHint(
  input: ProgressionHintInput & { block: WorkoutSet[] },
): { hint: ProgressionHint; sets: WorkoutSet[] } | null {
  const hint = progressionHint(input);
  const sets = hint ? applyProgressionHint(input.block, hint) : [];
  return hint && sets.length > 0 ? { hint, sets } : null;
}

// The ± controls (§5.2): the weight by the exercise's step, never below 0; reps by 1 and
// seconds by 5, never below one step.
export function stepWeight(weightKg: number, stepKg: number, direction: 1 | -1): number {
  return Math.max(0, roundWeightKg(weightKg + direction * stepKg));
}

export function stepValue(measure: Measure, value: number, direction: 1 | -1): number {
  const step = measure === 'time' ? TIME_STEP_S : 1;
  return Math.max(step, value + direction * step);
}

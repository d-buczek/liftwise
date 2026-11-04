import {
  applyProgressionHint,
  newId as defaultNewId,
  progressionHint,
  roundWeightKg,
  TIME_STEP_S,
  weightKgSchema,
  type Measure,
  type ProgressionHint,
  type ProgressionHintInput,
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

// Moves a block and numbers every set of the day from 0 in the new order: the blocks with the
// new positions (the base of the next move) and the sets whose position changed.
export function reorderBlocks<S extends WorkoutSet>(
  blocks: ExerciseBlock<S>[],
  from: number,
  to: number,
): { blocks: ExerciseBlock<S>[]; changed: S[] } {
  const order = [...blocks];
  const [moved] = order.splice(from, 1);
  if (moved) order.splice(to, 0, moved);
  let position = 0;
  const changed: S[] = [];
  const renumbered = order.map((block) => ({
    ...block,
    sets: block.sets.map((set) => {
      const next = position++;
      if (set.position === next) return set;
      const update = { ...set, position: next };
      changed.push(update);
      return update;
    }),
  }));
  return { blocks: renumbered, changed };
}

// One more planned set like the exercise's last one, at the end of the day in the workout new
// sets go to (D44).
export function extraSet(
  block: ExerciseBlock,
  target: { workoutId: string; start: number },
  newId = defaultNewId,
): WorkoutSet {
  const last = block.sets.at(-1);
  if (!last) throw new Error('an exercise block has sets');
  return {
    ...last,
    id: newId(),
    workout_id: target.workoutId,
    position: target.start,
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

// A weight typed by hand (§5.2): a plain decimal with a comma or a dot, null unless the schema
// takes it. The pattern comes first because Number() also reads '', '1e2' and '0x10'.
export function parseWeightKg(text: string): number | null {
  const typed = text.trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(typed)) return null;
  const parsed = weightKgSchema.safeParse(Number(typed));
  return parsed.success ? parsed.data : null;
}

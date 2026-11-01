import { weightStepKg } from './conventions';
import { daysBetween } from './dates';
import { exerciseSessions, type DatedSet, type ExerciseSession } from './history';
import type { Range } from './schemas/common';
import type { Exercise } from './schemas/exercise';
import { setValue, type WorkoutSet } from './schemas/set';
import type { TrainingSettings } from './schemas/settings';

// A break longer than this holds the last session (`reentry`).
export const REENTRY_DAYS = 14;
// The per-set increment of timed exercises.
export const TIME_STEP_S = 5;

export type ProgressionReason = 'reentry' | 'weight_up' | 'reps_up' | 'time_up' | 'hold';

export type ProgressionHint = {
  weight: number;
  sets: number;
  // Per set, in the exercise's measure; the other one is null.
  reps: number[] | null;
  duration_s: number[] | null;
  targetRir: Range;
  reason: ProgressionReason;
  // Independent of `reason`: the agent may suggest a deload or a swap.
  stall: boolean;
};

export type ProgressionHintInput = {
  exercise: Exercise;
  training: Pick<TrainingSettings, 'weight_step_kg' | 'target_rir'>;
  sets: DatedSet[];
  // The day of the hint; only sessions before it count.
  date: string;
  // The heaviest dumbbell of the equipment profile; no weight_up beyond it.
  maxWeightKg?: number | null;
};

// Double progression from the last session (§5.7); null without history. Rules in order:
// a break over REENTRY_DAYS holds the session; every set at the range max with RIR ≥ 1 or
// not recorded adds one weight step (not at 0 kg or beyond maxWeightKg) and drops to the
// range min; otherwise each set gets +1 rep (+5 s) up to the max.
export function progressionHint({
  exercise,
  training,
  sets,
  date,
  maxWeightKg = null,
}: ProgressionHintInput): ProgressionHint | null {
  const sessions = exerciseSessions(sets, exercise, date);
  const last = sessions.at(-1);
  if (!last) return null;
  const timed = exercise.measure === 'time';
  const range = timed ? exercise.time_range_s : exercise.rep_range;
  const weight = topWeightKg(last);
  const values = last.sets.map(setValue);
  const step = weightStepKg(exercise, training);

  const hint = (weightKg: number, next: number[], reason: ProgressionReason): ProgressionHint => ({
    weight: weightKg,
    sets: next.length,
    reps: timed ? null : next,
    duration_s: timed ? next : null,
    targetRir: { ...training.target_rir },
    reason,
    stall: isStalled(sessions),
  });

  if (daysBetween(last.date, date) > REENTRY_DAYS) return hint(weight, values, 'reentry');
  if (
    values.every((value) => value >= range.max) &&
    last.sets.every((set) => set.rir === null || set.rir >= 1) &&
    weight > 0 &&
    (maxWeightKg === null || weight + step <= maxWeightKg)
  ) {
    return hint(
      weight + step,
      values.map(() => range.min),
      'weight_up',
    );
  }
  // Values already at or above the max stay.
  const next = values.map((value) =>
    value >= range.max ? value : Math.min(value + (timed ? TIME_STEP_S : 1), range.max),
  );
  const same = next.every((value, i) => value === values[i]);
  return hint(weight, next, same ? 'hold' : timed ? 'time_up' : 'reps_up');
}

function topWeightKg(session: ExerciseSession): number {
  return Math.max(...session.sets.map((set) => set.weight_kg));
}

// The last three sessions at the same top weight, with the summed values of their common
// sets dropping twice in a row.
function isStalled(sessions: ExerciseSession[]): boolean {
  const recent = sessions.slice(-3);
  if (recent.length < 3 || new Set(recent.map(topWeightKg)).size > 1) return false;
  const common = Math.min(...recent.map((session) => session.sets.length));
  const [first = 0, second = 0, third = 0] = recent.map((session) =>
    session.sets.slice(0, common).reduce((sum, set) => sum + setValue(set), 0),
  );
  return first > second && second > third;
}

// One tap on a hint (§5.2): the exercise's working sets of the day in position order meet the
// hint's per-set reps (seconds), sets beyond the hint its last value; the planned ones get them
// with the hint's weight, the done ones keep their place in the order. The number of sets stays
// (adding sets is the user's call). Returns the changed sets only, so an empty result means the
// plan already matches the hint.
export function applyProgressionHint(sets: WorkoutSet[], hint: ProgressionHint): WorkoutSet[] {
  const values = hint.reps ?? hint.duration_s ?? [];
  return sets
    .filter((set) => !set.warmup)
    .sort((a, b) => a.position - b.position)
    .flatMap((set, i) => {
      const value = values[Math.min(i, values.length - 1)];
      if (set.status !== 'planned' || value === undefined) return [];
      const next: WorkoutSet = {
        ...set,
        weight_kg: hint.weight,
        reps: hint.reps ? value : null,
        duration_s: hint.duration_s ? value : null,
      };
      return next.weight_kg === set.weight_kg &&
        next.reps === set.reps &&
        next.duration_s === set.duration_s
        ? []
        : [next];
    });
}

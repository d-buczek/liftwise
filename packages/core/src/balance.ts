import { isWorkingSet } from './conventions';
import { addDays, daysBetween } from './dates';
import type { DatedSet } from './history';
import type { Range } from './schemas/common';
import {
  movementPatternSchema,
  muscleGroupSchema,
  type Exercise,
  type MovementPattern,
  type MuscleGroup,
} from './schemas/exercise';
import type { BalanceSettings } from './schemas/settings';

// The rolling window of hard sets, today included (§5.8).
export const BALANCE_WINDOW_DAYS = 7;
// Hard sets per working set by the muscle's role.
export const PRIMARY_SET_WEIGHT = 1;
export const SECONDARY_SET_WEIGHT = 0.5;
// `isolation` marks single-joint exercises, not a pattern to balance.
export const BALANCE_PATTERNS: MovementPattern[] = movementPatternSchema.options.filter(
  (pattern) => pattern !== 'isolation',
);

export type BalanceStatus = 'under' | 'in_range' | 'over';

export type MuscleTarget = {
  group: MuscleGroup;
  hardSets: number;
  target: Range;
  status: BalanceStatus;
};

export type MuscleBalance = MuscleTarget & {
  // Days since the last set with the group as a primary muscle; null if never (a visible gap).
  daysSince: number | null;
};

export type PatternBalance = { pattern: MovementPattern; daysSince: number | null };

export type BalanceSnapshot = { muscles: MuscleBalance[]; patterns: PatternBalance[] };

export type BalanceSnapshotInput = {
  sets: DatedSet[];
  exercises: Exercise[];
  balance: BalanceSettings;
  today: string;
};

function balanceStatus(hardSets: number, target: Range): BalanceStatus {
  if (hardSets < target.min) return 'under';
  return hardSets > target.max ? 'over' : 'in_range';
}

// Each muscle group's hard sets against its target range.
export function muscleTargets(
  hardSets: Record<MuscleGroup, number>,
  balance: BalanceSettings,
): MuscleTarget[] {
  return muscleGroupSchema.options.map((group) => {
    const target = balance.weekly_sets[group];
    return {
      group,
      hardSets: hardSets[group],
      target: { ...target },
      status: balanceStatus(hardSets[group], target),
    };
  });
}

// Hard sets of the given working sets per muscle group: 1 as a primary muscle, 0.5 as a secondary.
export function hardSetsByGroup(
  sets: DatedSet[],
  exercises: Exercise[],
): Record<MuscleGroup, number> {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const hardSets = Object.fromEntries(
    muscleGroupSchema.options.map((group) => [group, 0]),
  ) as Record<MuscleGroup, number>;
  for (const set of sets) {
    const exercise = byId.get(set.exercise_id);
    if (!exercise || !isWorkingSet(set)) continue;
    for (const group of exercise.primary_muscles) hardSets[group] += PRIMARY_SET_WEIGHT;
    for (const group of exercise.secondary_muscles) hardSets[group] += SECONDARY_SET_WEIGHT;
  }
  return hardSets;
}

// The balance guard on `today` (§5.8): working sets up to today, hard sets over the last 7 days.
export function balanceSnapshot({
  sets,
  exercises,
  balance,
  today,
}: BalanceSnapshotInput): BalanceSnapshot {
  const done = sets.filter((set) => isWorkingSet(set) && set.date <= today);
  const windowStart = addDays(today, 1 - BALANCE_WINDOW_DAYS);
  const hardSets = hardSetsByGroup(
    done.filter((set) => set.date >= windowStart),
    exercises,
  );
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const lastGroup = new Map<MuscleGroup, string>();
  const lastPattern = new Map<MovementPattern, string>();
  const later = (last: string | undefined, date: string) =>
    last === undefined || date > last ? date : last;
  for (const set of done) {
    const exercise = byId.get(set.exercise_id);
    if (!exercise) continue;
    for (const group of exercise.primary_muscles) {
      lastGroup.set(group, later(lastGroup.get(group), set.date));
    }
    for (const pattern of exercise.patterns) {
      lastPattern.set(pattern, later(lastPattern.get(pattern), set.date));
    }
  }
  const daysSince = (last: string | undefined) =>
    last === undefined ? null : daysBetween(last, today);

  return {
    muscles: muscleTargets(hardSets, balance).map((muscle) => ({
      ...muscle,
      daysSince: daysSince(lastGroup.get(muscle.group)),
    })),
    patterns: BALANCE_PATTERNS.map((pattern) => ({
      pattern,
      daysSince: daysSince(lastPattern.get(pattern)),
    })),
  };
}

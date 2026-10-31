import { BALANCE_PATTERNS, hardSetsByGroup, muscleTargets, type MuscleTarget } from './balance';
import { isWorkingSet } from './conventions';
import { addDays, weekOf } from './dates';
import { compareHistory, type DatedSet } from './history';
import { progressionHint } from './progression';
import { recordSets, type RecordEvent } from './records';
import {
  muscleGroupSchema,
  type Exercise,
  type MovementPattern,
  type MuscleGroup,
} from './schemas/exercise';
import type { BalanceSettings, TrainingSettings } from './schemas/settings';

export type WeeklySummary = {
  start: string;
  end: string;
  workouts: number;
  // Working sets.
  sets: number;
  muscles: MuscleTarget[];
  records: RecordEvent[];
  // Ids of the week's exercises flagged `stall` after the week (§5.7).
  stalled: string[];
  // No set as a primary muscle / with the pattern in the week.
  neglected: { muscles: MuscleGroup[]; patterns: MovementPattern[] };
};

export type WeeklySummaryInput = {
  // Any day of the week.
  date: string;
  // The whole history: records and stalls need the sets before the week.
  sets: DatedSet[];
  exercises: Exercise[];
  training: Pick<TrainingSettings, 'weight_step_kg' | 'target_rir'>;
  balance: BalanceSettings;
};

// The Monday–Sunday summary card from done working sets (§5.11, D34).
export function weeklySummary({
  date,
  sets,
  exercises,
  training,
  balance,
}: WeeklySummaryInput): WeeklySummary {
  const { start, end } = weekOf(date);
  const inWeek = (day: string) => day >= start && day <= end;
  const week = sets.filter((set) => isWorkingSet(set) && inWeek(set.date)).sort(compareHistory);
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const trained = [...new Set(week.map((set) => set.exercise_id))].flatMap(
    (id) => byId.get(id) ?? [],
  );
  const after = addDays(end, 1);

  return {
    start,
    end,
    workouts: new Set(week.map((set) => set.workout_id)).size,
    sets: week.length,
    muscles: muscleTargets(hardSetsByGroup(week, exercises), balance),
    records: recordSets(sets, exercises).filter((record) => inWeek(record.date)),
    stalled: trained
      .filter(
        (exercise) => progressionHint({ exercise, training, sets, date: after })?.stall ?? false,
      )
      .map((exercise) => exercise.id),
    neglected: {
      muscles: muscleGroupSchema.options.filter((group) =>
        trained.every((exercise) => !exercise.primary_muscles.includes(group)),
      ),
      patterns: BALANCE_PATTERNS.filter((pattern) =>
        trained.every((exercise) => !exercise.patterns.includes(pattern)),
      ),
    },
  };
}

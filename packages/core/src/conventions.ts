import type { WorkoutSet } from './schemas/set';

// Weights are kg per dumbbell (§5.1).
export const WEIGHT_PRECISION_KG = 0.25;
export const BODYWEIGHT_KG = 0;
export const DEFAULT_WEIGHT_STEP_KG = 1.25;
// RIR 4 means "4+".
export const RIR_MAX = 4;

// Only done sets count for progression, records, charts and balance (D30).
export function isDoneSet(set: Pick<WorkoutSet, 'status'>): boolean {
  return set.status === 'done';
}

// Done and not a warm-up: the sets progression, records and balance use.
export function isWorkingSet(set: Pick<WorkoutSet, 'status' | 'warmup'>): boolean {
  return isDoneSet(set) && !set.warmup;
}

import { addDays, type WorkoutSet } from '@liftwise/core';
import type { DayMark } from './calendar';

// What the line under a toolbar and the steel of the temper theme measure (SPEC §5.13).

const STEEL_STAGES = 4;

// The share of the day's working sets that are done; warm-ups don't count.
export function setsShare(sets: Pick<WorkoutSet, 'status' | 'warmup'>[]): number {
  const working = sets.filter((set) => !set.warmup);
  if (working.length === 0) return 0;
  return working.filter((set) => set.status === 'done').length / working.length;
}

// The week from its Monday: whether each day has a done workout.
export function weekDone(marks: Map<string, DayMark>, weekStart: string): boolean[] {
  return Array.from({ length: 7 }, (_, day) => marks.get(addDays(weekStart, day)) === 'done');
}

// The share of the week's workouts that are done.
export function weekShare(marks: Map<string, DayMark>, weekStart: string): number {
  const days = Array.from({ length: 7 }, (_, day) => marks.get(addDays(weekStart, day)));
  const workouts = days.filter((mark) => mark !== undefined);
  if (workouts.length === 0) return 0;
  return workouts.filter((mark) => mark === 'done').length / workouts.length;
}

// The stage of the steel for a share: bare, then violet, indigo and blue.
export function steelStage(share: number): number {
  return Math.min(STEEL_STAGES - 1, Math.floor(share * STEEL_STAGES));
}

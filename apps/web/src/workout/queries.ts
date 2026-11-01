import {
  datedSets,
  DEFAULT_TRAINING_SETTINGS,
  SETTING_IDS,
  type DatedSet,
  type EquipmentItem,
  type SyncRow,
  type TrainingSettings,
} from '@liftwise/core';
import { db } from '../db/database';

// Reads of the local mirror for the training screens; tombstones are filtered out. Called inside
// `useLiveQuery`, so a screen follows every write and pull.

const alive = <R extends { deleted_at: string | null }>(row: R | undefined): row is R =>
  row !== undefined && row.deleted_at === null;

export type DayData = { workouts: SyncRow<'workouts'>[]; sets: SyncRow<'sets'>[] };

export async function dayData(date: string): Promise<DayData> {
  const workouts = (await db.workouts.where('date').equals(date).toArray()).filter(alive);
  const sets = (
    await db.sets
      .where('workout_id')
      .anyOf(workouts.map((workout) => workout.id))
      .toArray()
  ).filter(alive);
  return { workouts, sets };
}

// Workouts and their sets between two dates (inclusive).
export async function rangeData(from: string, to: string): Promise<DayData> {
  const workouts = (await db.workouts.where('date').between(from, to, true, true).toArray()).filter(
    alive,
  );
  const sets = (
    await db.sets
      .where('workout_id')
      .anyOf(workouts.map((workout) => workout.id))
      .toArray()
  ).filter(alive);
  return { workouts, sets };
}

// Every set with its date, optionally only of some exercises: the history input of core.
export async function historySets(exerciseIds?: string[]): Promise<DatedSet[]> {
  const sets = (
    exerciseIds
      ? await db.sets.where('exercise_id').anyOf(exerciseIds).toArray()
      : await db.sets.toArray()
  ).filter(alive);
  const ids = [...new Set(sets.map((set) => set.workout_id))];
  const workouts = (await db.workouts.bulkGet(ids)).filter(alive);
  return datedSets(workouts, sets);
}

export async function catalog(): Promise<SyncRow<'exercises'>[]> {
  return (await db.exercises.toArray()).filter(alive);
}

export async function exercise(id: string): Promise<SyncRow<'exercises'> | undefined> {
  const row = await db.exercises.get(id);
  return alive(row) ? row : undefined;
}

export async function equipment(): Promise<EquipmentItem[]> {
  return (await db.equipment_items.toArray()).filter(alive);
}

export async function trainingSettings(): Promise<TrainingSettings> {
  const row = await db.settings.get(SETTING_IDS.training);
  return alive(row) && row.key === 'training' ? row.value : DEFAULT_TRAINING_SETTINGS;
}

// The heaviest dumbbell of the profile, for the progression hint (D37); null without a limit.
export function maxDumbbellKg(items: EquipmentItem[]): number | null {
  const limits = items.flatMap((item) => (item.type === 'dumbbells' ? [item.props.max_kg] : []));
  if (limits.length === 0 || limits.includes(null)) return null;
  return Math.max(...(limits as number[]));
}

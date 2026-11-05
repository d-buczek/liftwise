import {
  addDays,
  ATHLETE_PROFILE_ID,
  BALANCE_WINDOW_DAYS,
  DEFAULT_BALANCE_SETTINGS,
  DEFAULT_TRAINING_SETTINGS,
  isShortId,
  matchesId,
  SETTING_IDS,
  type BalanceSettings,
  type DatedSet,
  type EquipmentItem,
  type Exercise,
  type TrainingSettings,
  type Workout,
  type WorkoutLabel,
  type WorkoutSet,
} from '@liftwise/core';
import { and, asc, eq, gte, inArray, isNull, like, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db';
import {
  athleteProfile,
  equipmentItems,
  exercises,
  sets,
  settings,
  workoutLabels,
  workouts,
} from '../db/schema';
import { ToolError } from './registry';

// Live rows (no tombstones) for the agent's tools, in their core shape. Sets come joined with
// their workout's date: D1 binds at most 100 parameters, so no lists of workout ids.

export async function catalog(db: Db): Promise<Exercise[]> {
  const rows = await db.select().from(exercises).where(isNull(exercises.deleted_at));
  return rows as Exercise[];
}

export async function equipment(db: Db): Promise<EquipmentItem[]> {
  const rows = await db.select().from(equipmentItems).where(isNull(equipmentItems.deleted_at));
  return rows as EquipmentItem[];
}

export async function labels(db: Db): Promise<WorkoutLabel[]> {
  return db.select().from(workoutLabels).where(isNull(workoutLabels.deleted_at));
}

export async function profile(db: Db): Promise<string> {
  const [row] = await db
    .select({ content: athleteProfile.content })
    .from(athleteProfile)
    .where(and(eq(athleteProfile.id, ATHLETE_PROFILE_ID), isNull(athleteProfile.deleted_at)));
  return row?.content ?? '';
}

async function setting(db: Db, id: string) {
  const [row] = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(and(eq(settings.id, id), isNull(settings.deleted_at)));
  return row;
}

export async function trainingSettings(db: Db): Promise<TrainingSettings> {
  const row = await setting(db, SETTING_IDS.training);
  return row?.key === 'training' ? (row.value as TrainingSettings) : DEFAULT_TRAINING_SETTINGS;
}

export async function balanceSettings(db: Db): Promise<BalanceSettings> {
  const row = await setting(db, SETTING_IDS.balance);
  return row?.key === 'balance' ? (row.value as BalanceSettings) : DEFAULT_BALANCE_SETTINGS;
}

export type Days = { workouts: Workout[]; sets: DatedSet[] };

// Workouts dated `from`–`to` and their sets in position order.
export async function days(db: Db, from: string, to: string): Promise<Days> {
  const range = and(gte(workouts.date, from), lte(workouts.date, to));
  const [workoutRows, setRows] = await db.batch([
    db
      .select()
      .from(workouts)
      .where(and(range, isNull(workouts.deleted_at)))
      .orderBy(asc(workouts.date), asc(workouts.id)),
    datedSetsQuery(db, range),
  ]);
  return { workouts: workoutRows, sets: setRows.map(toDatedSet) };
}

// Every live set with its date (planned too), only of the given exercises when listed.
export async function history(db: Db, exerciseIds?: string[]): Promise<DatedSet[]> {
  const rows = await datedSetsQuery(
    db,
    exerciseIds ? inArray(sets.exercise_id, exerciseIds) : undefined,
  );
  return rows.map(toDatedSet);
}

function datedSetsQuery(db: Db, where: SQL | undefined) {
  return db
    .select({ set: sets, date: workouts.date })
    .from(sets)
    .innerJoin(workouts, eq(sets.workout_id, workouts.id))
    .where(and(where, isNull(sets.deleted_at), isNull(workouts.deleted_at)))
    .orderBy(asc(workouts.date), asc(sets.position));
}

function toDatedSet({ set, date }: { set: WorkoutSet; date: string }): DatedSet {
  return { ...set, date };
}

// What `balanceSnapshot` needs up to `today`, without loading the whole history: every set of
// the window, plus per exercise its latest working set before the window (for "days since").
// SQLite takes the other columns of a `max()` group from the row with the maximum.
export async function balanceSets(db: Db, today: string): Promise<DatedSet[]> {
  const windowStart = addDays(today, 1 - BALANCE_WINDOW_DAYS);
  const [inWindow, before] = await db.batch([
    datedSetsQuery(db, and(gte(workouts.date, windowStart), lte(workouts.date, today))),
    db
      .select({ set: sets, date: sql<string>`max(${workouts.date})` })
      .from(sets)
      .innerJoin(workouts, eq(sets.workout_id, workouts.id))
      .where(
        and(
          lt(workouts.date, windowStart),
          eq(sets.status, 'done'),
          eq(sets.warmup, false),
          isNull(sets.deleted_at),
          isNull(workouts.deleted_at),
        ),
      )
      .groupBy(sets.exercise_id),
  ]);
  return [...before, ...inWindow].map(toDatedSet);
}

// Live sets by id with their date; missing ones are left out.
// By full or short id (D55). Two sets ending alike are for the model to resolve, never to guess.
export async function setsById(db: Db, ids: string[]): Promise<DatedSet[]> {
  if (ids.length === 0) return [];
  const rows = await datedSetsQuery(
    db,
    or(
      inArray(
        sets.id,
        ids.filter((id) => !isShortId(id)),
      ),
      ...ids.filter(isShortId).map((id) => like(sets.id, `%${id.toLowerCase()}`)),
    ),
  );
  const found = rows.map(toDatedSet);
  const ambiguous = ids.find((id) => found.filter((set) => matchesId(set.id, id)).length > 1);
  if (ambiguous) throw new ToolError('ambiguous_id', { id: ambiguous });
  return found;
}

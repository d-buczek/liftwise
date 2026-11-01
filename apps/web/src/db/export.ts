import { csvExport, jsonExport, type ExportTables } from '@liftwise/core';
import { db } from './database';

// Data export (§5.12, D35): files built on the device from the local mirror, so they work
// offline and hold the state of the last pull plus this device's own changes.

export type ExportFile = { name: string; type: string; content: string };

const alive = <R extends { deleted_at: string | null }>(rows: R[]) =>
  rows.filter((row) => row.deleted_at === null);

// The synced tables as stored, sync fields included; tombstones are left out.
async function exportTables(): Promise<ExportTables> {
  return {
    exercises: alive(await db.exercises.toArray()),
    equipment_items: alive(await db.equipment_items.toArray()),
    workout_labels: alive(await db.workout_labels.toArray()),
    workouts: alive(await db.workouts.toArray()),
    sets: alive(await db.sets.toArray()),
    athlete_profile: alive(await db.athlete_profile.toArray()),
    settings: alive(await db.settings.toArray()),
  };
}

// The full backup, named by the local date: liftwise-2026-11-01.json.
export async function exportJson(date: string, now = new Date()): Promise<ExportFile> {
  return {
    name: `liftwise-${date}.json`,
    type: 'application/json',
    content: jsonExport(await exportTables(), now.toISOString()),
  };
}

// Done sets for a spreadsheet; the UTF-8 BOM makes Excel read the Polish names right.
export async function exportCsv(date: string): Promise<ExportFile> {
  return {
    name: `liftwise-${date}.csv`,
    type: 'text/csv',
    content: `﻿${csvExport(await exportTables())}`,
  };
}

import { isDoneSet } from './conventions';
import { datedSets } from './history';
import type { EquipmentItem } from './schemas/equipment';
import type { Exercise } from './schemas/exercise';
import type { WorkoutLabel } from './schemas/label';
import type { AthleteProfile } from './schemas/profile';
import type { WorkoutSet } from './schemas/set';
import type { Setting } from './schemas/settings';
import type { Workout } from './schemas/workout';

// Bumped when the JSON layout changes.
export const EXPORT_VERSION = 1;

// The synced tables as stored, one array of rows each; `threads` / `messages` join with LW-09.
export type ExportTables = {
  exercises: Exercise[];
  equipment_items: EquipmentItem[];
  workout_labels: WorkoutLabel[];
  workouts: Workout[];
  sets: WorkoutSet[];
  athlete_profile: AthleteProfile[];
  settings: Setting[];
};

export const CSV_COLUMNS = [
  'date',
  'exercise',
  'set',
  'weight_kg',
  'reps',
  'duration_s',
  'rir',
  'warmup',
] as const;

// The full JSON backup (§5.12). Rows go out as given, sync fields included.
export function jsonExport(tables: ExportTables, exportedAt: string): string {
  return JSON.stringify(
    {
      app: 'liftwise',
      version: EXPORT_VERSION,
      exported_at: exportedAt,
      tables: {
        exercises: tables.exercises,
        equipment_items: tables.equipment_items,
        workout_labels: tables.workout_labels,
        workouts: tables.workouts,
        sets: tables.sets,
        athlete_profile: tables.athlete_profile,
        settings: tables.settings,
      },
    },
    null,
    2,
  );
}

export type CsvExportInput = {
  workouts: Pick<Workout, 'id' | 'date'>[];
  sets: WorkoutSet[];
  exercises: Pick<Exercise, 'id' | 'name_pl'>[];
};

// Done sets, warm-ups included, as RFC 4180 CSV (§5.12): by date, workout and position; `set`
// numbers the exercise's sets within the workout from 1. The BOM and the file belong to the UI.
export function csvExport({ workouts, sets, exercises }: CsvExportInput): string {
  const names = new Map(exercises.map((exercise) => [exercise.id, exercise.name_pl]));
  // Workouts of one day in creation order (UUIDv7).
  const done = datedSets(workouts, sets.filter(isDoneSet)).sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.workout_id.localeCompare(b.workout_id) ||
      a.position - b.position,
  );
  const numbers = new Map<string, number>();
  const rows = done.map((set) => {
    const key = `${set.workout_id}/${set.exercise_id}`;
    const number = (numbers.get(key) ?? 0) + 1;
    numbers.set(key, number);
    return [
      set.date,
      names.get(set.exercise_id) ?? '',
      number,
      set.weight_kg,
      set.reps,
      set.duration_s,
      set.rir,
      set.warmup,
    ];
  });
  return [CSV_COLUMNS, ...rows].map((row) => `${row.map(csvField).join(',')}\r\n`).join('');
}

function csvField(value: string | number | boolean | null): string {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

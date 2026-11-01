import { LABEL_COLORS, type LabelColor, type WorkoutLabel } from './schemas/label';
import type { Workout } from './schemas/workout';

// Workout labels (D48): training sets such as "A" or "Push" shown on the calendar, the day and
// in history, kept by a copy.

// A day's label: that of its oldest workout with one (two offline devices can each create a
// workout for the day, D44). UUIDv7 ids sort by creation.
export function dayLabelId(workouts: Pick<Workout, 'id' | 'label_id'>[]): string | null {
  let oldest: Pick<Workout, 'id' | 'label_id'> | null = null;
  for (const workout of workouts) {
    if (workout.label_id !== null && (!oldest || workout.id < oldest.id)) oldest = workout;
  }
  return oldest?.label_id ?? null;
}

// The label a copy gives the target day: the source day's, unless the target day has its own or
// the source's is archived. `labels` are the existing labels; a deleted one counts as none.
export function copiedLabelId(
  source: Pick<Workout, 'id' | 'label_id'>[],
  target: Pick<Workout, 'id' | 'label_id'>[],
  labels: Pick<WorkoutLabel, 'id' | 'archived'>[],
): string | null {
  const byId = new Map(labels.map((label) => [label.id, label]));
  if (byId.has(dayLabelId(target) ?? '')) return null;
  const label = byId.get(dayLabelId(source) ?? '');
  return label && !label.archived ? label.id : null;
}

// The color a new label starts with: the first one no active label uses.
export function nextLabelColor(labels: Pick<WorkoutLabel, 'color' | 'archived'>[]): LabelColor {
  const used = new Set(labels.filter((label) => !label.archived).map((label) => label.color));
  return LABEL_COLORS.find((color) => !used.has(color)) ?? LABEL_COLORS[0];
}

// Active labels have unique names regardless of case; `exceptId` is the label being edited.
export function labelNameTaken(
  labels: Pick<WorkoutLabel, 'id' | 'name' | 'archived'>[],
  name: string,
  exceptId?: string,
): boolean {
  const key = name.trim().toLocaleLowerCase('pl');
  return labels.some(
    (label) =>
      !label.archived && label.id !== exceptId && label.name.toLocaleLowerCase('pl') === key,
  );
}

// Active labels first, each part by name ("A" before "B", "2" before "10").
export function compareLabels(
  a: Pick<WorkoutLabel, 'name' | 'archived'>,
  b: Pick<WorkoutLabel, 'name' | 'archived'>,
): number {
  return (
    Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'pl', { numeric: true })
  );
}

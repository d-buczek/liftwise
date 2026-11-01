import {
  copyWorkout,
  newId,
  SETTING_IDS,
  workoutSchema,
  type Exercise,
  type TrainingSettings,
  type WorkoutSet,
} from '@liftwise/core';
import { applyLocal, type LocalChange } from '../db/mutate';
import { dayWorkout, nextPosition, plannedSetsFor } from './day';
import type { Draft } from './logging';
import { catalog, dayData, historySets, trainingSettings } from './queries';

// User actions on a day; each is one `applyLocal` call, so one change group (D41).

// The workout new sets of the date go to, and the change creating it when the day has none.
async function targetOf(date: string) {
  const day = await dayData(date);
  const existing = dayWorkout(day.workouts);
  const workout = existing ?? workoutSchema.parse({ id: newId(), date });
  const changes: LocalChange[] = existing ? [] : [upsert('workouts', workout)];
  return { day, workout, workoutId: workout.id, changes };
}

function upsert<E extends 'workouts' | 'sets' | 'exercises' | 'settings'>(
  entity: E,
  row: Extract<LocalChange, { op: 'upsert'; entity: E }>['row'],
): LocalChange {
  return { op: 'upsert', entity, row } as LocalChange;
}

// "Kopiuj trening" / "Kopiuj jako lżejszy" (§5.2, D33): the source day's sets appended to the
// target day as planned sets. Returns the new sets (for "Cofnij").
export async function copyDay(sourceDate: string, targetDate: string, light: boolean) {
  const source = await dayData(sourceDate);
  const target = await targetOf(targetDate);
  const sets = copyWorkout({
    source: source.sets,
    target: { workoutId: target.workoutId, sets: target.day.sets },
    light: light ? { exercises: await catalog(), training: await trainingSettings() } : undefined,
  });
  if (sets.length > 0)
    await applyLocal([...target.changes, ...sets.map((set) => upsert('sets', set))]);
  return sets;
}

export async function addExercise(date: string, exercise: Exercise) {
  const target = await targetOf(date);
  const sets = plannedSetsFor(exercise, await historySets([exercise.id]), date, {
    workoutId: target.workoutId,
    start: nextPosition(target.day.sets),
  });
  await applyLocal([...target.changes, ...sets.map((set) => upsert('sets', set))]);
  return sets;
}

export function saveSets(sets: WorkoutSet[]) {
  return applyLocal(sets.map((set) => upsert('sets', set)));
}

export function deleteSets(sets: Pick<WorkoutSet, 'id'>[]) {
  return applyLocal(sets.map((set) => ({ op: 'delete', entity: 'sets', row: { id: set.id } })));
}

// "Cofnij" after a manual delete: the rows are written back, which revives the tombstones
// (§6.4) and works offline.
export function restoreSets(sets: WorkoutSet[]) {
  return saveSets(sets);
}

export function swapExercise(sets: WorkoutSet[], exercise: Pick<Exercise, 'id'>) {
  return saveSets(sets.map((set) => ({ ...set, exercise_id: exercise.id })));
}

export function saveExercise(exercise: Exercise) {
  return applyLocal([upsert('exercises', exercise)]);
}

// "Zrobione" (§5.2): the planned set, or a new one at the end of the day, saved as done with the
// draft; the first done set of a workout starts it. Returns the saved set.
export async function logSet(
  date: string,
  exerciseId: string,
  planned: WorkoutSet | null,
  draft: Draft,
  now = new Date(),
): Promise<WorkoutSet> {
  const performedAt = now.toISOString();
  const target = await targetOf(date);
  const base: WorkoutSet = planned ?? {
    id: newId(),
    workout_id: target.workoutId,
    exercise_id: exerciseId,
    position: nextPosition(target.day.sets),
    status: 'planned',
    weight_kg: 0,
    reps: null,
    duration_s: null,
    rir: null,
    warmup: false,
    note: '',
    performed_at: null,
    source: 'manual',
  };
  const set: WorkoutSet = { ...base, ...draft, status: 'done', performed_at: performedAt };
  const workout =
    target.day.workouts.find((row) => row.id === set.workout_id) ??
    (target.workoutId === set.workout_id ? target.workout : null);
  const start =
    workout && workout.started_at === null
      ? [upsert('workouts', { ...workout, started_at: performedAt })]
      : [];
  await applyLocal([...start, upsert('sets', set)]);
  return set;
}

export function saveTrainingSettings(value: TrainingSettings) {
  return applyLocal([upsert('settings', { id: SETTING_IDS.training, key: 'training', value })]);
}

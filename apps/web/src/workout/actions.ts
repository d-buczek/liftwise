import {
  ATHLETE_PROFILE_ID,
  copiedLabelId,
  copyWorkout,
  dayWorkout,
  newId,
  nextPosition,
  plannedSetsFor,
  SETTING_IDS,
  workoutSchema,
  type BalanceSettings,
  type Exercise,
  type ModelSettings,
  type TrainingSettings,
  type Workout,
  type WorkoutLabel,
  type WorkoutSet,
} from '@liftwise/core';
import { applyLocal, type LocalChange } from '../db/mutate';
import type { Draft } from './logging';
import { catalog, dayData, historySets, trainingSettings, workoutLabels } from './queries';

// User actions on a day; each is one `applyLocal` call, so one change group (D41).

// The workout new sets of the date go to, and the change creating it when the day has none.
async function targetOf(date: string) {
  const day = await dayData(date);
  const existing = dayWorkout(day.workouts);
  const workout = existing ?? workoutSchema.parse({ id: newId(), date });
  const changes: LocalChange[] = existing ? [] : [upsert('workouts', workout)];
  return { day, workout, workoutId: workout.id, changes, created: existing ? null : workout };
}

function upsert<
  E extends 'workouts' | 'sets' | 'exercises' | 'settings' | 'workout_labels' | 'athlete_profile',
>(entity: E, row: Extract<LocalChange, { op: 'upsert'; entity: E }>['row']): LocalChange {
  return { op: 'upsert', entity, row } as LocalChange;
}

function remove(entity: 'workouts' | 'sets', id: string): LocalChange {
  return { op: 'delete', entity, row: { id } };
}

// What a copy wrote: its sets, the workout it created for a day without one, and the existing
// workout it gave the source's label (as it was before) with that label.
export type CopyResult = {
  sets: WorkoutSet[];
  created: Workout | null;
  labelled: { before: Workout; labelId: string } | null;
};

// "Kopiuj trening" / "Kopiuj jako lżejszy" (§5.2, D33): the source day's sets appended to the
// target day as planned sets; the target gets the source's label unless it has its own (D48).
// Returns what it wrote (for "Cofnij").
export async function copyDay(
  sourceDate: string,
  targetDate: string,
  light: boolean,
): Promise<CopyResult> {
  const source = await dayData(sourceDate);
  const target = await targetOf(targetDate);
  const sets = copyWorkout({
    source: source.sets,
    target: { workoutId: target.workoutId, sets: target.day.sets },
    light: light ? { exercises: await catalog(), training: await trainingSettings() } : undefined,
  });
  if (sets.length === 0) return { sets, created: null, labelled: null };
  const labelId = copiedLabelId(source.workouts, target.day.workouts, await workoutLabels());
  const workout = labelId ? { ...target.workout, label_id: labelId } : target.workout;
  await applyLocal([
    ...(target.created || labelId ? [upsert('workouts', workout)] : []),
    ...sets.map((set) => upsert('sets', set)),
  ]);
  return {
    sets,
    created: target.created && workout,
    labelled: !target.created && labelId ? { before: target.workout, labelId } : null,
  };
}

// "Cofnij" after a copy (D44): the copied sets, the workout the copy created unless it has got
// other sets since, and the label it gave an existing workout unless that has changed since.
export async function undoCopy(copy: CopyResult) {
  const copied = new Set(copy.sets.map((set) => set.id));
  const { created, labelled } = copy;
  const date = (created ?? labelled?.before)?.date;
  const day = date ? await dayData(date) : { workouts: [], sets: [] };
  const kept =
    created !== null &&
    day.sets.some((set) => set.workout_id === created.id && !copied.has(set.id));
  const relabelled =
    labelled &&
    day.workouts.find(
      (workout) => workout.id === labelled.before.id && workout.label_id === labelled.labelId,
    );
  return applyLocal([
    ...copy.sets.map((set) => remove('sets', set.id)),
    ...(created && !kept ? [remove('workouts', created.id)] : []),
    ...(relabelled
      ? [upsert('workouts', { ...relabelled, label_id: labelled.before.label_id })]
      : []),
  ]);
}

// The label of every workout of a day (normally one), so the day shows it whichever is oldest.
async function dayLabelChanges(date: string, labelId: string | null): Promise<LocalChange[]> {
  const { workouts } = await dayData(date);
  return workouts
    .filter((workout) => workout.label_id !== labelId)
    .map((workout) => upsert('workouts', { ...workout, label_id: labelId }));
}

// The day's label chip (D48); a day without a workout has none.
export async function setDayLabel(date: string, labelId: string | null) {
  const changes = await dayLabelChanges(date, labelId);
  if (changes.length > 0) await applyLocal(changes);
}

// A new or edited label; `assignTo` also gives it to that day, in the same change group.
export async function saveLabel(label: WorkoutLabel, assignTo?: string) {
  await applyLocal([
    upsert('workout_labels', label),
    ...(assignTo ? await dayLabelChanges(assignTo, label.id) : []),
  ]);
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
  return applyLocal(sets.map((set) => remove('sets', set.id)));
}

// "Cofnij" after a manual delete: the rows are written back, which revives the tombstones
// (§6.4) and works offline.
export function restoreSets(sets: WorkoutSet[]) {
  return saveSets(sets);
}

// What "Usuń trening" deleted, for "Cofnij".
export type DeletedDay = { workouts: Workout[]; sets: WorkoutSet[] };

// "Usuń trening" (§5.2): every workout of the day (normally one) with its sets, in one change
// group. A deleted workout keeps its sets on the server, so they are deleted explicitly.
export async function deleteDay(date: string): Promise<DeletedDay> {
  const { workouts, sets } = await dayData(date);
  if (workouts.length > 0) {
    await applyLocal([
      ...sets.map((set) => remove('sets', set.id)),
      ...workouts.map((workout) => remove('workouts', workout.id)),
    ]);
  }
  return { workouts, sets };
}

// "Cofnij" after "Usuń trening": the workouts, then their sets, written back (D44).
export function restoreDay({ workouts, sets }: DeletedDay) {
  return applyLocal([
    ...workouts.map((workout) => upsert('workouts', workout)),
    ...sets.map((set) => upsert('sets', set)),
  ]);
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

export function saveBalanceSettings(value: BalanceSettings) {
  return applyLocal([upsert('settings', { id: SETTING_IDS.balance, key: 'balance', value })]);
}

export function saveModelSettings(value: ModelSettings) {
  return applyLocal([upsert('settings', { id: SETTING_IDS.models, key: 'models', value })]);
}

export function saveAthleteProfile(content: string) {
  return applyLocal([upsert('athlete_profile', { id: ATHLETE_PROFILE_ID, content })]);
}

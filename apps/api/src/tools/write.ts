import {
  copiedLabelId,
  copyWorkout,
  dayWorkout,
  logSets,
  newId,
  nextPosition,
  plannedSetsFor,
  workoutSchema,
  type Workout,
  type WorkoutSet,
} from '@liftwise/core';
import { z } from 'zod';
import { undoGroup } from '../changes';
import { dateInput, dateOf, exerciseIdInput, exerciseOf, measured, setValuesInput } from './common';
import { catalog, days, history, labels, setsById, trainingSettings } from './data';
import { changeView, commit, defineTool, ToolError, type PlannedWrite } from './registry';

// Write tools (§5.9.3) run immediately; each call is one change group the user can undo.

const upsert = (entity: 'workouts' | 'sets', row: Workout | WorkoutSet): PlannedWrite => ({
  entity,
  op: 'upsert',
  row,
});

const rirInput = z.number().int().min(0).max(4).describe('Reps in reserve, 0–4');

// Sets are logged today and on past days only; a future day is planning (D45).
function notFuture(date: string, today: string) {
  if (date > today) throw new ToolError('future_date', { date, today });
}

export const writeTools = [
  defineTool({
    name: 'log_sets',
    description:
      'Log done sets of one exercise ("4x10" is four sets). Each completes the next planned set ' +
      'of the exercise that day (warm-up or working alike), the rest are added; the first done ' +
      'set starts the workout. Today or a past day only.',
    input: z.object({
      exercise_id: exerciseIdInput,
      date: dateInput.optional().describe('Local date, YYYY-MM-DD; default today'),
      sets: z
        .array(
          z.object({
            ...setValuesInput,
            rir: rirInput.optional(),
            warmup: z.boolean().optional(),
          }),
        )
        .min(1)
        .max(20),
    }),
    risk: 'write',
    run: async (ctx, input) => {
      const date = dateOf(ctx, input.date);
      notFuture(date, ctx.today);
      const [exercises, day] = await Promise.all([catalog(ctx.db), days(ctx.db, date, date)]);
      const exercise = exerciseOf(exercises, input.exercise_id);
      const result = logSets({
        date,
        exerciseId: exercise.id,
        workouts: day.workouts,
        sets: day.sets,
        logged: input.sets.map((set) => ({
          ...measured(exercise, set),
          rir: set.rir ?? null,
          warmup: set.warmup ?? false,
        })),
        performedAt: ctx.now,
      });
      return commit(ctx, [
        ...result.workouts.map((workout) => upsert('workouts', workout)),
        ...result.sets.map((set) => upsert('sets', set)),
      ]);
    },
  }),
  defineTool({
    name: 'update_set',
    description:
      'Change one done set (weight, reps or seconds, RIR, warm-up, note). Planned sets are ' +
      'changed with edit_planned_sets, several done sets with update_sets.',
    input: z.object({
      set_id: z.string(),
      weight_kg: z.number().min(0).optional(),
      reps: z.number().int().positive().optional(),
      duration_s: z.number().int().positive().optional(),
      rir: rirInput.optional(),
      warmup: z.boolean().optional(),
      note: z.string().optional(),
    }),
    risk: 'write',
    run: async (ctx, { set_id, ...fields }) => {
      const [set] = await setsById(ctx.db, [set_id]);
      if (!set) throw new ToolError('set_not_found', { set_id });
      if (set.status !== 'done') throw new ToolError('not_done', { set_id });
      const exercise = exerciseOf(await catalog(ctx.db), set.exercise_id);
      return commit(ctx, [upsert('sets', editedSet(set, exercise, fields))]);
    },
  }),
  defineTool({
    name: 'copy_workout',
    description:
      "Copy a day's workout onto another day as planned sets, appended after the target day's " +
      'sets. `light` copies one working set fewer per exercise at about 10% less weight.',
    input: z.object({
      from_date: dateInput,
      to_date: dateInput,
      light: z.boolean().optional(),
    }),
    risk: 'write',
    run: async (ctx, input) => {
      const [from, to] = [dateOf(ctx, input.from_date), dateOf(ctx, input.to_date)];
      const [source, target, exercises, training, allLabels] = await Promise.all([
        days(ctx.db, from, from),
        days(ctx.db, to, to),
        catalog(ctx.db),
        trainingSettings(ctx.db),
        labels(ctx.db),
      ]);
      const existing = dayWorkout(target.workouts);
      const workout = existing ?? workoutSchema.parse({ id: newId(), date: to });
      const sets = copyWorkout({
        source: source.sets,
        target: { workoutId: workout.id, sets: target.sets },
        light: input.light ? { exercises, training } : undefined,
      });
      if (sets.length === 0) throw new ToolError('nothing_to_copy', { date: from });
      const labelId = copiedLabelId(source.workouts, target.workouts, allLabels);
      const written = labelId ? { ...workout, label_id: labelId } : workout;
      return commit(ctx, [
        ...(existing && !labelId ? [] : [upsert('workouts', written)]),
        ...sets.map((set) => upsert('sets', set)),
      ]);
    },
  }),
  defineTool({
    name: 'edit_planned_sets',
    description:
      "Edit a day's planned sets: add exercises (with sets, or planned from their last " +
      'session), change or remove planned sets, swap an exercise for another one with the same ' +
      'measure. Done sets are never touched.',
    input: z.object({
      date: dateInput,
      add: z
        .array(
          z.object({
            exercise_id: exerciseIdInput,
            sets: z.array(z.object(setValuesInput)).max(20).optional(),
          }),
        )
        .optional(),
      update: z
        .array(
          z.object({
            set_id: z.string(),
            weight_kg: z.number().min(0).optional(),
            reps: z.number().int().positive().optional(),
            duration_s: z.number().int().positive().optional(),
            rir: rirInput.optional(),
          }),
        )
        .optional(),
      remove: z.array(z.string()).optional().describe('Ids of planned sets'),
      swap: z
        .array(z.object({ exercise_id: exerciseIdInput, to_exercise_id: exerciseIdInput }))
        .optional(),
    }),
    risk: 'write',
    run: async (ctx, input) => {
      const date = dateOf(ctx, input.date);
      const [day, exercises] = await Promise.all([days(ctx.db, date, date), catalog(ctx.db)]);
      const writes: PlannedWrite[] = [];
      // Each planned set as edited so far, so two edits of one set combine.
      const edited = new Map<string, WorkoutSet>();
      const plannedSet = (id: string) => {
        const set = edited.get(id) ?? day.sets.find((row) => row.id === id);
        if (!set || set.status !== 'planned') throw new ToolError('not_planned', { set_id: id });
        return set;
      };

      let workout = dayWorkout(day.workouts);
      let position = nextPosition(day.sets);
      for (const { exercise_id, sets } of input.add ?? []) {
        const exercise = exerciseOf(exercises, exercise_id);
        if (!workout) {
          workout = workoutSchema.parse({ id: newId(), date });
          writes.push(upsert('workouts', workout));
        }
        const target = { workoutId: workout.id, start: position, source: 'agent' as const };
        const added: WorkoutSet[] = sets?.length
          ? sets.map((values, i) => ({
              id: newId(),
              workout_id: target.workoutId,
              exercise_id: exercise.id,
              position: position + i,
              status: 'planned',
              ...measured(exercise, values),
              rir: null,
              warmup: false,
              note: '',
              performed_at: null,
              source: 'agent',
            }))
          : plannedSetsFor(exercise, await history(ctx.db, [exercise.id]), date, target);
        position += added.length;
        writes.push(...added.map((set) => upsert('sets', set)));
      }
      for (const { set_id, ...fields } of input.update ?? []) {
        const set = plannedSet(set_id);
        edited.set(set_id, editedSet(set, exerciseOf(exercises, set.exercise_id), fields));
      }
      for (const { exercise_id, to_exercise_id } of input.swap ?? []) {
        const [from, to] = [
          exerciseOf(exercises, exercise_id),
          exerciseOf(exercises, to_exercise_id),
        ];
        if (from.measure !== to.measure) {
          throw new ToolError('measure_mismatch', { exercise_id, to_exercise_id });
        }
        const swapped = day.sets.filter(
          (set) => set.status === 'planned' && set.exercise_id === exercise_id,
        );
        if (swapped.length === 0) throw new ToolError('not_planned', { exercise_id });
        for (const set of swapped) {
          edited.set(set.id, { ...plannedSet(set.id), exercise_id: to_exercise_id });
        }
      }
      for (const id of input.remove ?? []) {
        plannedSet(id);
        edited.delete(id);
        writes.push({ entity: 'sets', op: 'delete', row: { id } });
      }
      const removed = new Set(input.remove);
      writes.push(
        ...[...edited.values()]
          .filter((set) => !removed.has(set.id))
          .map((set) => upsert('sets', set)),
      );
      if (writes.length === 0) throw new ToolError('nothing_to_change');
      return commit(ctx, writes);
    },
  }),
  defineTool({
    name: 'start_workout',
    description: "Start the day's workout now (logging the first set starts it too).",
    input: z.object({
      date: dateInput.optional().describe('Local date, YYYY-MM-DD; default today'),
    }),
    risk: 'write',
    run: async (ctx, input) => {
      const date = dateOf(ctx, input.date);
      notFuture(date, ctx.today);
      const day = await days(ctx.db, date, date);
      const workout = dayWorkout(day.workouts) ?? workoutSchema.parse({ id: newId(), date });
      if (workout.started_at) {
        throw new ToolError('already_started', { started_at: workout.started_at });
      }
      return commit(ctx, [upsert('workouts', { ...workout, started_at: ctx.now })]);
    },
  }),
  defineTool({
    name: 'finish_workout',
    description: "Finish the day's started workout now.",
    input: z.object({
      date: dateInput.optional().describe('Local date, YYYY-MM-DD; default today'),
    }),
    risk: 'write',
    run: async (ctx, input) => {
      const date = dateOf(ctx, input.date);
      const day = await days(ctx.db, date, date);
      const open = day.workouts.filter((workout) => workout.started_at && !workout.ended_at);
      if (open.length === 0) throw new ToolError('not_started', { date });
      return commit(
        ctx,
        open.map((workout) => upsert('workouts', { ...workout, ended_at: ctx.now })),
      );
    },
  }),
  defineTool({
    name: 'undo_change',
    description:
      'Undo a change group (the groupId of an earlier write or confirmed proposal). If records ' +
      'changed since, it returns `conflict`: ask the user, then call again with confirm=true.',
    input: z.object({
      group_id: z.string(),
      confirm: z.boolean().optional().describe('Overwrite records that changed since'),
    }),
    risk: 'write',
    run: async (ctx, { group_id, confirm = false }) => {
      const result = await undoGroup(ctx.db, group_id, {
        confirm,
        actor: 'agent',
        threadId: ctx.threadId,
      });
      if ('error' in result) {
        const { error, ...details } = result;
        throw new ToolError(error, details);
      }
      return { groupId: result.groupId, changes: result.changes.map(changeView) };
    },
  }),
];

type SetFields = {
  weight_kg?: number;
  reps?: number;
  duration_s?: number;
  rir?: number;
  warmup?: boolean;
  note?: string;
};

// A set with the given fields changed; the value must be the exercise's measure.
export function editedSet(
  set: WorkoutSet,
  exercise: Parameters<typeof measured>[0],
  fields: SetFields,
): WorkoutSet {
  const values = measured(exercise, {
    weight_kg: fields.weight_kg ?? set.weight_kg,
    reps: fields.reps ?? set.reps ?? undefined,
    duration_s: fields.duration_s ?? set.duration_s ?? undefined,
  });
  return {
    ...set,
    ...values,
    rir: fields.rir ?? set.rir,
    warmup: fields.warmup ?? set.warmup,
    note: fields.note ?? set.note,
  };
}

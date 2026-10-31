// Fixtures for core tests; not exported from the package.
import type { DatedSet } from './history';
import { newId } from './ids';
import { exerciseSchema, type Exercise } from './schemas/exercise';
import { workoutSetSchema, type WorkoutSet } from './schemas/set';

export function makeExercise(fields: Record<string, unknown> = {}): Exercise {
  return exerciseSchema.parse({
    id: newId(),
    name_pl: 'Wyciskanie hantli',
    primary_muscles: ['chest'],
    patterns: ['horizontal_push'],
    implements: 2,
    unilateral: false,
    rest_seconds: 90,
    measure: 'reps',
    rep_range: { min: 8, max: 12 },
    ...fields,
  });
}

export function makeTimedExercise(fields: Record<string, unknown> = {}): Exercise {
  return makeExercise({
    name_pl: 'Deska',
    primary_muscles: ['abs'],
    patterns: ['core'],
    implements: 1,
    measure: 'time',
    time_range_s: { min: 30, max: 60 },
    ...fields,
  });
}

// A done working set with 10 reps at 20 kg unless overridden.
export function makeSet(fields: Partial<WorkoutSet> = {}): WorkoutSet {
  const status = fields.status ?? 'done';
  return workoutSetSchema.parse({
    id: newId(),
    workout_id: newId(),
    exercise_id: newId(),
    position: 0,
    status,
    weight_kg: 20,
    reps: fields.duration_s ? null : 10,
    performed_at: status === 'done' ? '2026-10-01T18:00:00+02:00' : null,
    source: 'manual',
    ...fields,
  });
}

export function makeDatedSet(date: string, fields: Partial<WorkoutSet> = {}): DatedSet {
  const performed_at = fields.status === 'planned' ? null : `${date}T18:00:00+01:00`;
  return { ...makeSet({ performed_at, ...fields }), date };
}

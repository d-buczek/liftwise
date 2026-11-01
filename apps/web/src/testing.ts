// Fixtures for web tests.
import {
  exerciseSchema,
  newId,
  workoutSetSchema,
  type Exercise,
  type SyncRow,
  type WorkoutSet,
} from '@liftwise/core';
import { vi } from 'vite-plus/test';
import { db } from './db/database';

export async function resetDb() {
  await db.delete();
  await db.open();
}

export function dumbbells(maxKg: number | null = 32.5) {
  return { id: newId(), type: 'dumbbells' as const, props: { max_kg: maxKg } };
}

// An equipment row as the server returns it in a pull.
export function pulledBench(seq: number, id = newId()): SyncRow<'equipment_items'> {
  return {
    id,
    type: 'bench',
    props: { incline: true, decline: false },
    created_at: '2026-10-31T10:00:00.000Z',
    updated_at: '2026-10-31T10:00:00.000Z',
    deleted_at: null,
    seq,
  };
}

type Handler = (request: { method: string; path: string; body: unknown }) => {
  status: number;
  body?: unknown;
};

// Replaces fetch with a handler; returns the mock to inspect the calls.
export function mockApi(handler: Handler) {
  const mock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    async (input, init = {}) => {
      const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      const { status, body: responseBody } = handler({
        method: init.method ?? 'GET',
        path: input,
        body,
      });
      return new Response(responseBody === undefined ? null : JSON.stringify(responseBody), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

// A set row; done at 20 kg × 10 unless overridden.
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

// A reps exercise (chest, horizontal push, 8–12) unless overridden.
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

import {
  newId,
  seedCatalog,
  type SyncEntity,
  type SyncMutationInput,
  type SyncPullResponse,
} from '@liftwise/core';
import { env } from 'cloudflare:test';
import { generateToken, sha256Hex } from '../src/auth/tokens';
import { createDb } from '../src/db';
import { devices, syncCounter } from '../src/db/schema';
import app from '../src/index';

export const db = () => createDb(env.DB);

// Inserts an active device, as `device:create` does, and returns its token.
export async function createDevice(name = 'PC', fields: Partial<typeof devices.$inferInsert> = {}) {
  const token = generateToken();
  const id = newId();
  await db()
    .insert(devices)
    .values({
      id,
      name,
      token_hash: await sha256Hex(token),
      created_at: new Date().toISOString(),
      ...fields,
    });
  return { id, token };
}

export function call(path: string, init: RequestInit & { token?: string; json?: unknown } = {}) {
  const { token, json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  const body = json === undefined ? rest.body : JSON.stringify(json);
  return app.request(path, { ...rest, headers, body }, env);
}

// Sync fixtures: seed exercises by measure, rows with defaults, mutations, push and pull.

const catalog = seedCatalog();
export const repsExercise = catalog.find((exercise) => exercise.measure === 'reps')!;
export const timedExercise = catalog.find((exercise) => exercise.measure === 'time')!;

export const workoutRow = (fields: Record<string, unknown> = {}) => ({
  id: newId(),
  date: '2026-10-31',
  ...fields,
});

export const setRow = (workoutId: string, fields: Record<string, unknown> = {}) => ({
  id: newId(),
  workout_id: workoutId,
  exercise_id: repsExercise.id,
  position: 0,
  status: 'planned',
  weight_kg: 20,
  reps: 10,
  source: 'manual',
  ...fields,
});

export const upsert = (
  entity: SyncEntity,
  row: Record<string, unknown>,
  groupId = newId(),
): SyncMutationInput =>
  ({ mutationId: newId(), groupId, op: 'upsert', entity, row }) as SyncMutationInput;

export const remove = (entity: SyncEntity, id: string, groupId = newId()): SyncMutationInput => ({
  mutationId: newId(),
  groupId,
  op: 'delete',
  entity,
  row: { id },
});

export const push = (token: string, mutations: SyncMutationInput[]) =>
  call('/api/sync/push', { method: 'POST', token, json: { mutations } });

export async function pull(token: string, since = 0, limit?: number) {
  const query = new URLSearchParams({ since: String(since) });
  if (limit !== undefined) query.set('limit', String(limit));
  const response = await call(`/api/sync/pull?${query.toString()}`, { token });
  return response.json<SyncPullResponse>();
}

// The last `seq` handed out, i.e. what a device that pulled everything has.
export async function lastSeq() {
  const [counter] = await db().select().from(syncCounter);
  return counter?.value ?? 0;
}

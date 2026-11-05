import { newId, type SyncEntity, type SyncMutationInput } from '@liftwise/core';
import { isNull } from 'drizzle-orm';
import { expect } from 'vite-plus/test';
import { domainFields, syncTables } from '../src/sync/apply';
import { toolByName } from '../src/tools';
import { runTool, type ToolContext } from '../src/tools/registry';
import { call, db, push, setRow, upsert, workoutRow } from './helpers';

// Fixtures of the tool tests: a fixed local "now" (a Saturday) and calls as the agent makes them.

export const TODAY = '2026-10-31';
export const NOW = '2026-10-31T18:00:00+01:00';
export const THREAD_ID = newId();

export const toolContext = (fields: Partial<ToolContext> = {}): ToolContext => ({
  db: db(),
  threadId: THREAD_ID,
  today: TODAY,
  now: NOW,
  ...fields,
});

// A call of a registered tool: the input as the AI SDK validates it, then the handler by risk.
export async function runNamed<T = Record<string, unknown>>(
  name: string,
  input: unknown,
  ctx = toolContext(),
): Promise<T> {
  const tool = toolByName(name);
  if (!tool) throw new Error(`no tool ${name}`);
  return (await runTool(ctx, tool, tool.input.parse(input))) as T;
}

export const done = (fields: Record<string, unknown> = {}) => ({
  status: 'done',
  performed_at: '2026-10-28T18:00:00+01:00',
  ...fields,
});

// A day's workout with sets, pushed by the user.
export async function pushDay(
  token: string,
  date: string,
  rows: Record<string, unknown>[],
  fields: Record<string, unknown> = {},
) {
  const workout = workoutRow({ date, ...fields });
  const sets = rows.map((row, position) => setRow(workout.id, { position, ...row }));
  const mutations: SyncMutationInput[] = [
    upsert('workouts', workout),
    ...sets.map((row) => upsert('sets', row)),
  ];
  expect((await push(token, mutations)).status).toBe(200);
  return { workout, sets };
}

export const confirmProposal = (token: string, id: string) =>
  call(`/api/agent/proposals/${id}/confirm`, { method: 'POST', token });

export const rejectProposal = (token: string, id: string) =>
  call(`/api/agent/proposals/${id}/reject`, { method: 'POST', token });

// The live rows of the user's data by their domain fields, to compare before and after an undo.
export async function liveData() {
  const entities: SyncEntity[] = ['exercises', 'workouts', 'sets', 'athlete_profile', 'settings'];
  const tables = await Promise.all(
    entities.map(async (entity) => {
      const table = syncTables[entity];
      const rows = await db().select().from(table).where(isNull(table.deleted_at));
      const fields = rows.map((row) => domainFields(entity, row as Record<string, unknown>));
      return [entity, fields.sort((a, b) => String(a.id).localeCompare(String(b.id)))];
    }),
  );
  return Object.fromEntries(tables) as Record<SyncEntity, Record<string, unknown>[]>;
}

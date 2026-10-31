import {
  setMatchesMeasure,
  SYNC_PULL_LIMIT,
  syncEntitySchema,
  syncPushSchema,
  type Exercise,
  type SyncChange,
  type SyncEntity,
  type SyncMutation,
  type SyncPullResponse,
  type SyncPushResponse,
  type WorkoutSet,
} from '@liftwise/core';
import { asc, gt, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import { appliedMutations } from '../db/schema';
import { apiError } from '../http';
import {
  changeStatements,
  domainFields,
  loadRows,
  rowKey,
  runBatch,
  sameState,
  syncTables,
  withoutSeq,
  type Change,
  type Row,
  type StoredRow,
} from './apply';

const pullSchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(SYNC_PULL_LIMIT).default(SYNC_PULL_LIMIT),
});

export const syncRoutes = new Hono<AppEnv>()
  // Applies the mutations in order as one D1 batch: all of them or none (§6.4).
  .post('/push', async (c) => {
    const db = c.var.db;
    const parsed = syncPushSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      const [where, index] = parsed.error.issues[0]?.path ?? [];
      return where === 'mutations' && typeof index === 'number'
        ? c.json({ error: 'invalid_mutation', index }, 400)
        : apiError(c, 400, 'invalid_request');
    }
    const { mutations } = parsed.data;

    // A retried push skips what an earlier one applied.
    const ids = mutations.map((mutation) => mutation.mutationId);
    const applied = new Set(
      ids.length === 0
        ? []
        : (
            await db
              .select({ id: appliedMutations.mutation_id })
              .from(appliedMutations)
              .where(inArray(appliedMutations.mutation_id, ids))
          ).map((row) => row.id),
    );
    const fresh = mutations.filter((mutation) => !applied.has(mutation.mutationId));

    const now = new Date().toISOString();
    const rows = await loadRows(db, fresh.flatMap(touchedRows));
    const planned = planChanges(fresh, rows, now);
    if ('invalid' in planned) {
      return c.json({ error: 'invalid_mutation', index: mutations.indexOf(planned.invalid) }, 400);
    }

    await runBatch(db, [
      ...changeStatements(db, { actor: 'user' }, planned.changes, now),
      ...fresh.map((mutation) =>
        db.insert(appliedMutations).values({
          mutation_id: mutation.mutationId,
          device_id: c.var.device.id,
          applied_at: now,
        }),
      ),
    ]);
    return c.json<SyncPushResponse>({
      results: mutations.map(({ mutationId }) => ({
        mutationId,
        status: applied.has(mutationId) ? 'duplicate' : 'applied',
      })),
    });
  })
  // Rows changed after `since`, tombstones included, in `seq` order.
  .get('/pull', async (c) => {
    const db = c.var.db;
    const query = pullSchema.safeParse(c.req.query());
    if (!query.success) return apiError(c, 400, 'invalid_request');
    const { since, limit } = query.data;

    // `seq` is unique across tables, so the first `limit` rows overall are among the first
    // `limit + 1` of each table; the extra row tells whether there is more.
    const entities = syncEntitySchema.options;
    const results = await runBatch(
      db,
      entities.map((entity) => {
        const table = syncTables[entity];
        return db
          .select()
          .from(table)
          .where(gt(table.seq, since))
          .orderBy(asc(table.seq))
          .limit(limit + 1);
      }),
    );
    const changes = entities
      .flatMap((entity, i) =>
        ((results[i] ?? []) as StoredRow[]).map((row) => toChange(entity, row)),
      )
      .sort((a, b) => a.row.seq - b.row.seq);
    const page = changes.slice(0, limit);
    return c.json<SyncPullResponse>({
      changes: page,
      seq: page.at(-1)?.row.seq ?? since,
      hasMore: changes.length > limit,
    });
  });

// The row a mutation writes, plus what a set refers to.
function touchedRows(mutation: SyncMutation): [SyncEntity, string][] {
  const touched: [SyncEntity, string][] = [[mutation.entity, mutation.row.id]];
  if (mutation.op === 'upsert' && mutation.entity === 'sets') {
    touched.push(['workouts', mutation.row.workout_id], ['exercises', mutation.row.exercise_id]);
  }
  return touched;
}

// The changes the mutations make, in order, or the first invalid mutation. `rows` is updated
// as it goes, so a mutation sees the ones before it. No-ops are left out.
function planChanges(
  mutations: SyncMutation[],
  rows: Map<string, StoredRow>,
  now: string,
): { changes: Change[] } | { invalid: SyncMutation } {
  const changes: Change[] = [];
  for (const mutation of mutations) {
    const { entity, row } = mutation;
    const key = rowKey(entity, row.id);
    const before = rows.get(key) ?? null;
    let after: Row | null;
    if (mutation.op === 'delete') {
      after = before && { ...withoutSeq(before), updated_at: now, deleted_at: now };
    } else {
      if (mutation.entity === 'sets' && !validSetRefs(mutation.row, rows)) {
        return { invalid: mutation };
      }
      // An upsert of a tombstone brings the row back: last write wins.
      after = {
        ...domainFields(entity, row),
        id: row.id,
        created_at: before?.created_at ?? now,
        updated_at: now,
        deleted_at: null,
      };
    }
    if (!after || (before && sameState(entity, before, after))) continue;
    changes.push({ groupId: mutation.groupId, entity, before, after });
    // The new `seq` is assigned in D1; later mutations only need the fields.
    rows.set(key, { ...after, seq: before?.seq ?? 0 });
  }
  return { changes };
}

// A set needs its workout and exercise (tombstones count, e.g. a workout deleted on the other
// device) and the value the exercise measures (D32).
function validSetRefs(set: WorkoutSet, rows: Map<string, StoredRow>): boolean {
  const exercise = rows.get(rowKey('exercises', set.exercise_id)) as Exercise | undefined;
  return (
    rows.has(rowKey('workouts', set.workout_id)) &&
    exercise !== undefined &&
    setMatchesMeasure(set, exercise)
  );
}

// Rows go out in their core shape; an exercise keeps only the range of its measure.
function toChange(entity: SyncEntity, row: StoredRow): SyncChange {
  if (entity === 'exercises') {
    const { rep_range, time_range_s, ...rest } = row;
    const range = row.measure === 'reps' ? { rep_range } : { time_range_s };
    return { entity, row: { ...rest, ...range } } as SyncChange;
  }
  return { entity, row } as SyncChange;
}

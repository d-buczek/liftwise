import {
  SYNC_PULL_LIMIT,
  syncEntitySchema,
  syncPushSchema,
  type SyncChange,
  type SyncEntity,
  type SyncPullResponse,
  type SyncPushResponse,
} from '@liftwise/core';
import { asc, gt, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import { appliedMutations } from '../db/schema';
import { apiError } from '../http';
import { changeStatements, loadRows, runBatch, syncTables, type StoredRow } from './apply';
import { planChanges, touchedRows } from './write';

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
      const { mutationId } = fresh[planned.invalid] ?? {};
      const index = mutations.findIndex((mutation) => mutation.mutationId === mutationId);
      return c.json({ error: 'invalid_mutation', index }, 400);
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

// Rows go out in their core shape; an exercise keeps only the range of its measure.
function toChange(entity: SyncEntity, row: StoredRow): SyncChange {
  if (entity === 'exercises') {
    const { rep_range, time_range_s, ...rest } = row;
    const range = row.measure === 'reps' ? { rep_range } : { time_range_s };
    return { entity, row: { ...rest, ...range } } as SyncChange;
  }
  return { entity, row } as SyncChange;
}

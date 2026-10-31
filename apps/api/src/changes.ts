import { newId } from '@liftwise/core';
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from './app-env';
import { changeLog } from './db/schema';
import { apiError, readJson } from './http';
import {
  changeStatements,
  loadRows,
  rowKey,
  runBatch,
  sameState,
  withoutSeq,
  type Change,
  type Row,
} from './sync/apply';

// `confirm` overwrites records that changed after the group (§5.9.4).
const undoSchema = z.object({ confirm: z.boolean().default(false) }).default({ confirm: false });

export const changeRoutes = new Hono<AppEnv>()
  // Applies the inverse of a group as a new group, so undo syncs and can itself be undone.
  .post('/:groupId/undo', async (c) => {
    const db = c.var.db;
    const groupId = c.req.param('groupId');
    const body = await readJson(c, undoSchema);
    if (!body) return apiError(c, 400, 'invalid_request');

    const [entries, undos] = await db.batch([
      db
        .select()
        .from(changeLog)
        .where(eq(changeLog.change_group_id, groupId))
        .orderBy(asc(changeLog.seq)),
      db
        .select({ id: changeLog.id })
        .from(changeLog)
        .where(eq(changeLog.undo_of, groupId))
        .limit(1),
    ]);
    if (entries.length === 0) return apiError(c, 404, 'not_found');
    if (undos.length > 0) return apiError(c, 409, 'already_undone');

    // Per record: its state before the group and the `seq` of the group's last change to it.
    type UndoRecord = { entity: Change['entity']; id: string; before: Row | null; seq: number };
    const records = new Map<string, UndoRecord>();
    for (const entry of entries) {
      const key = rowKey(entry.entity, entry.entity_id);
      const first = records.get(key);
      records.set(key, {
        entity: entry.entity,
        id: entry.entity_id,
        before: first ? first.before : (entry.before as Row | null),
        seq: entry.seq,
      });
    }
    const current = await loadRows(
      db,
      [...records.values()].map((record) => [record.entity, record.id]),
    );

    // A newer `seq` means someone changed the record after the group.
    const conflicts = [...records.entries()]
      .filter(([key, record]) => current.get(key)?.seq !== record.seq)
      .map(([, { entity, id }]) => ({ entity, id }));
    if (conflicts.length > 0 && !body.confirm) {
      return c.json({ error: 'conflict', conflicts }, 409);
    }

    const now = new Date().toISOString();
    const undoGroupId = newId();
    const changes = [...records.entries()].flatMap(([key, { entity, before }]): Change[] => {
      const row = current.get(key);
      if (!row) return [];
      // A record the group created goes back to not existing: a tombstone.
      const after = before
        ? { ...before, updated_at: now }
        : { ...withoutSeq(row), updated_at: now, deleted_at: row.deleted_at ?? now };
      return sameState(entity, row, after)
        ? []
        : [{ groupId: undoGroupId, entity, before: row, after }];
    });
    await runBatch(db, changeStatements(db, { actor: 'user', undoOf: groupId }, changes, now));
    return c.json({ groupId: undoGroupId });
  });

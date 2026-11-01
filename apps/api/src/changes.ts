import { newId } from '@liftwise/core';
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from './app-env';
import type { Db } from './db';
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
  type ChangeMeta,
  type Row,
} from './sync/apply';

// `confirm` overwrites records that changed after the group (§5.9.4).
const undoSchema = z.object({ confirm: z.boolean().default(false) }).default({ confirm: false });

// The group that undid `groupId`, if any.
const undoOf = (db: Db, groupId: string) =>
  db
    .select({ groupId: changeLog.change_group_id })
    .from(changeLog)
    .where(eq(changeLog.undo_of, groupId))
    .limit(1);

export type UndoResult =
  // The undo group, or null when nothing changed (nothing is written).
  | { groupId: string | null }
  | { error: 'not_found' }
  // Carries the undo group, so a client whose undo response got lost can still redo.
  | { error: 'already_undone'; groupId: string }
  | { error: 'conflict'; conflicts: { entity: Change['entity']; id: string }[] };

// Applies the inverse of a group as a new group, so undo syncs and can itself be undone. Used by
// the endpoint and the agent's `undo_change`.
export async function undoGroup(
  db: Db,
  groupId: string,
  { confirm, ...meta }: { confirm: boolean } & Omit<ChangeMeta, 'undoOf'>,
): Promise<UndoResult> {
  const [entries, [undone]] = await db.batch([
    db
      .select()
      .from(changeLog)
      .where(eq(changeLog.change_group_id, groupId))
      .orderBy(asc(changeLog.seq)),
    undoOf(db, groupId),
  ]);
  if (entries.length === 0) return { error: 'not_found' };
  if (undone) return { error: 'already_undone', groupId: undone.groupId };

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
  if (conflicts.length > 0 && !confirm) return { error: 'conflict', conflicts };

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
  // Nothing to revert (e.g. the group created and deleted a row), so no group to redo.
  if (changes.length === 0) return { groupId: null };
  try {
    await runBatch(db, changeStatements(db, { ...meta, undoOf: groupId }, changes, now));
  } catch (error) {
    // A concurrent undo of the group was first (unique index on `undo_of`).
    const [winner] = await undoOf(db, groupId);
    if (!winner) throw error;
    return { error: 'already_undone', groupId: winner.groupId };
  }
  return { groupId: undoGroupId };
}

export const changeRoutes = new Hono<AppEnv>().post('/:groupId/undo', async (c) => {
  const body = await readJson(c, undoSchema);
  if (!body) return apiError(c, 400, 'invalid_request');
  const result = await undoGroup(c.var.db, c.req.param('groupId'), {
    confirm: body.confirm,
    actor: 'user',
  });
  if (!('error' in result)) return c.json(result);
  return result.error === 'not_found' ? apiError(c, 404, 'not_found') : c.json(result, 409);
});

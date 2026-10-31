import { newId, type SyncEntity, type SyncFields } from '@liftwise/core';
import { getTableColumns, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { SQLiteColumn, SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import type { Db } from '../db';
import {
  athleteProfile,
  changeLog,
  equipmentItems,
  exercises,
  sets,
  settings,
  syncCounter,
  workouts,
} from '../db/schema';

// The server mutation path (§6.4, §5.9.4): every write to a synced table gets the next `seq`
// and a change_log row, in the same D1 batch. Push and undo build their changes on top of it.

export const syncTables = {
  exercises,
  equipment_items: equipmentItems,
  workouts,
  sets,
  athlete_profile: athleteProfile,
  settings,
};

// Drizzle can't type a write to a table picked at runtime; rows are checked by core schemas.
type SyncTable = SQLiteTableWithColumns<{
  name: string;
  schema: undefined;
  dialect: 'sqlite';
  columns: Record<string, SQLiteColumn> & { id: SQLiteColumn };
}>;
const tableOf = (entity: SyncEntity) => syncTables[entity] as unknown as SyncTable;

// A row by column (= core field) name; change_log snapshots are rows without `seq`.
export type Row = Record<string, unknown> & { id: string } & Omit<SyncFields, 'seq'>;
export type StoredRow = Row & Pick<SyncFields, 'seq'>;

export type Change = { groupId: string; entity: SyncEntity; before: StoredRow | null; after: Row };
export type ChangeMeta = {
  actor: 'user' | 'agent' | 'system';
  threadId?: string | null;
  undoOf?: string | null;
};

const SYNC_KEYS = new Set(['created_at', 'updated_at', 'deleted_at', 'seq']);

export const rowKey = (entity: SyncEntity, id: string) => `${entity}/${id}`;

// The domain fields of a row in column order, absent ones as null (e.g. the unused range).
export function domainFields(entity: SyncEntity, row: Record<string, unknown>) {
  const keys = Object.keys(getTableColumns(tableOf(entity))).filter((key) => !SYNC_KEYS.has(key));
  return Object.fromEntries(keys.map((key) => [key, row[key] ?? null])) as Record<string, unknown>;
}

// Same fields and both live or both deleted: writing `b` over `a` would change nothing.
export function sameState(entity: SyncEntity, a: Row, b: Row): boolean {
  return (
    (a.deleted_at === null) === (b.deleted_at === null) &&
    JSON.stringify(domainFields(entity, a)) === JSON.stringify(domainFields(entity, b))
  );
}

export function withoutSeq({ seq: _seq, ...row }: StoredRow): Row {
  return row;
}

// Rows by `rowKey`, tombstones included, in one round trip.
export async function loadRows(
  db: Db,
  wanted: [SyncEntity, string][],
): Promise<Map<string, StoredRow>> {
  const ids = new Map<SyncEntity, Set<string>>();
  for (const [entity, id] of wanted) ids.set(entity, (ids.get(entity) ?? new Set()).add(id));
  const queries = [...ids].map(([entity, entityIds]) => {
    const table = tableOf(entity);
    return db
      .select()
      .from(table)
      .where(inArray(table.id, [...entityIds]));
  });
  const results = await runBatch(db, queries);
  const rows = new Map<string, StoredRow>();
  [...ids.keys()].forEach((entity, i) => {
    for (const row of (results[i] ?? []) as StoredRow[]) rows.set(rowKey(entity, row.id), row);
  });
  return rows;
}

// Read inside each statement, so concurrent batches never share a `seq`.
const currentSeq = sql`(SELECT ${syncCounter.value} FROM ${syncCounter} WHERE ${syncCounter.id} = 1)`;

// Per change: bump the counter, write the row with the new `seq`, log before/after.
export function changeStatements(db: Db, meta: ChangeMeta, changes: Change[], now: string) {
  return changes.flatMap(({ groupId, entity, before, after }): BatchItem<'sqlite'>[] => {
    const table = tableOf(entity);
    const deletes = after.deleted_at !== null && (before === null || before.deleted_at === null);
    return [
      db
        .insert(syncCounter)
        .values({ id: 1, value: 1 })
        .onConflictDoUpdate({
          target: syncCounter.id,
          set: { value: sql`${syncCounter.value} + 1` },
        }),
      db
        .insert(table)
        .values({ ...after, seq: currentSeq })
        .onConflictDoUpdate({ target: table.id, set: overwrite(table) }),
      db.insert(changeLog).values({
        id: newId(),
        change_group_id: groupId,
        actor: meta.actor,
        thread_id: meta.threadId ?? null,
        entity,
        entity_id: after.id,
        op: deletes ? 'delete' : 'upsert',
        before: before && withoutSeq(before),
        after,
        seq: currentSeq,
        undo_of: meta.undoOf ?? null,
        created_at: now,
      }),
    ];
  });
}

// On conflict take every column from the new row, except the key and `created_at`.
function overwrite(table: SyncTable) {
  return Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([key]) => key !== 'id' && key !== 'created_at')
      .map(([key, column]) => [key, sql`excluded.${sql.identifier(column.name)}`]),
  );
}

// `db.batch` wants a non-empty tuple; statements here are built at runtime.
export async function runBatch(db: Db, statements: BatchItem<'sqlite'>[]): Promise<unknown[]> {
  if (statements.length === 0) return [];
  return db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}

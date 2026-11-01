import {
  setMatchesMeasure,
  syncRowSchemas,
  type Exercise,
  type SyncEntity,
  type Workout,
  type WorkoutSet,
} from '@liftwise/core';
import type { Db } from '../db';
import {
  changeStatements,
  domainFields,
  loadRows,
  rowKey,
  runBatch,
  sameState,
  withoutSeq,
  type Change,
  type ChangeMeta,
  type Row,
  type StoredRow,
} from './apply';

// A write to a synced table in its change group: the full domain row of an upsert, the id of a
// delete. A push's mutations are writes; so are the agent's tool calls.
export type Write = {
  groupId: string;
  entity: SyncEntity;
  op: 'upsert' | 'delete';
  row: { id: string } & Record<string, unknown>;
};

// The row a write changes, plus what a set or a workout refers to.
export function touchedRows({ entity, op, row }: Write): [SyncEntity, string][] {
  const touched: [SyncEntity, string][] = [[entity, row.id]];
  if (op === 'upsert' && entity === 'sets') {
    const set = row as WorkoutSet;
    touched.push(['workouts', set.workout_id], ['exercises', set.exercise_id]);
  }
  if (op === 'upsert' && entity === 'workouts' && row.label_id) {
    touched.push(['workout_labels', (row as Workout).label_id as string]);
  }
  return touched;
}

// The changes the writes make, in order, or the index of the first invalid one. `rows` is
// updated as it goes, so a write sees the ones before it. No-ops are left out.
export function planChanges(
  writes: Write[],
  rows: Map<string, StoredRow>,
  now: string,
): { changes: Change[] } | { invalid: number } {
  const changes: Change[] = [];
  for (const [index, write] of writes.entries()) {
    const { entity, row } = write;
    const key = rowKey(entity, row.id);
    const before = rows.get(key) ?? null;
    let after: Row | null;
    if (write.op === 'delete') {
      after = before && { ...withoutSeq(before), updated_at: now, deleted_at: now };
    } else {
      if (
        (entity === 'sets' && !validSetRefs(row as WorkoutSet, rows)) ||
        (entity === 'workouts' && !validWorkoutRefs(row as Workout, rows))
      ) {
        return { invalid: index };
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
    changes.push({ groupId: write.groupId, entity, before, after });
    // The new `seq` is assigned in D1; later writes only need the fields.
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

// A workout's label must exist; a tombstone counts, as for a set's references.
function validWorkoutRefs(workout: Workout, rows: Map<string, StoredRow>): boolean {
  return workout.label_id === null || rows.has(rowKey('workout_labels', workout.label_id));
}

export class InvalidWrite extends Error {
  constructor(readonly write: Write) {
    super(`invalid ${write.op} of ${write.entity}/${write.row.id}`);
    this.name = 'InvalidWrite';
  }
}

// A server-side write (agent tools, proposals, chat threads): rows are checked with the core
// schemas, then planned and logged like a push, in one D1 batch. Returns the changes made.
export async function applyWrites(db: Db, meta: ChangeMeta, writes: Write[]): Promise<Change[]> {
  const checked = writes.map((write): Write => {
    if (write.op === 'delete') return write;
    const parsed = syncRowSchemas[write.entity].safeParse(write.row);
    if (!parsed.success) throw new InvalidWrite(write);
    return { ...write, row: parsed.data as Write['row'] };
  });
  const now = new Date().toISOString();
  const rows = await loadRows(db, checked.flatMap(touchedRows));
  const planned = planChanges(checked, rows, now);
  if ('invalid' in planned) throw new InvalidWrite(checked[planned.invalid] as Write);
  await runBatch(db, changeStatements(db, meta, planned.changes, now));
  return planned.changes;
}

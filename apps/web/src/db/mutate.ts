import { newId, syncMutationSchema, type SyncMutationInput, type SyncRow } from '@liftwise/core';
import { db } from './database';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// A change as pushed (§6.4) without the ids, which `applyLocal` assigns.
export type LocalChange = DistributiveOmit<SyncMutationInput, 'mutationId' | 'groupId'>;

const listeners = new Set<() => void>();

// The sync loop listens to push soon after a write.
export function onLocalChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Every data write: one user action applied to the mirror and queued in the outbox in one
// transaction. Its changes share a `groupId`, so one undo reverts the action (D41).
export async function applyLocal(changes: LocalChange[]): Promise<string> {
  const groupId = newId();
  // Validated here: the server rejects a whole push for one invalid mutation, and it would
  // stay first in the outbox.
  const mutations = changes.map((change) =>
    syncMutationSchema.parse({ ...change, mutationId: newId(), groupId }),
  );

  await db.transaction('rw', [...db.mirrorTables(), db.outbox], async () => {
    // The server sets the real sync fields; pull replaces these.
    const now = new Date().toISOString();
    for (const mutation of mutations) {
      const table = db.mirror(mutation.entity);
      const current = await table.get(mutation.row.id);
      if (mutation.op === 'upsert') {
        await table.put({
          ...mutation.row,
          created_at: current?.created_at ?? now,
          updated_at: now,
          deleted_at: null,
          seq: current?.seq ?? 0,
        } as SyncRow);
      } else if (current) {
        await table.put({ ...current, updated_at: now, deleted_at: now });
      }
      await db.outbox.add({ entity: mutation.entity, entityId: mutation.row.id, mutation });
    }
  });

  for (const listener of listeners) listener();
  return groupId;
}

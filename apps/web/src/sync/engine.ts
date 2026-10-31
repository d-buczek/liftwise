import { SYNC_PUSH_MAX } from '@liftwise/core';
import { api, ApiError } from '../api/client';
import type { LiftWiseDb } from '../db/database';

// One sync run (§6.4): push the outbox in order, then pull until caught up.
export async function syncOnce(db: LiftWiseDb, token: string): Promise<void> {
  let rejected: ApiError | null = null;
  try {
    await pushOutbox(db, token);
  } catch (error) {
    // A rejected mutation stays queued and is reported; pulling still brings other changes.
    if (!(error instanceof ApiError && error.status === 400)) throw error;
    rejected = error;
  }
  await pullChanges(db, token);
  if (rejected) throw rejected;
}

async function pushOutbox(db: LiftWiseDb, token: string) {
  for (;;) {
    const batch = await db.outbox.orderBy('id').limit(SYNC_PUSH_MAX).toArray();
    if (batch.length === 0) return;
    // A retry after a lost response is safe: applied mutation ids come back as `duplicate`.
    await api.push(
      token,
      batch.map((entry) => entry.mutation),
    );
    await db.outbox.bulkDelete(batch.map((entry) => entry.id));
  }
}

async function pullChanges(db: LiftWiseDb, token: string) {
  let since = (await db.sync_state.get('pull'))?.seq ?? 0;
  for (;;) {
    const page = await api.pull(token, since);
    await db.transaction('rw', [...db.mirrorTables(), db.outbox, db.sync_state], async () => {
      for (const { entity, row } of page.changes) {
        // A record changed here and not pushed yet keeps the local version: its push moves
        // the server to it, and a later pull returns the result.
        const pending = await db.outbox.where('[entity+entityId]').equals([entity, row.id]).count();
        if (pending === 0) await db.mirror(entity).put(row);
      }
      await db.sync_state.put({ id: 'pull', seq: page.seq, syncedAt: new Date().toISOString() });
    });
    since = page.seq;
    if (!page.hasMore) return;
  }
}

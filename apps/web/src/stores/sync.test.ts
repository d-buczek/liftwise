import { newId, type SyncMutation } from '@liftwise/core';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { db } from '../db/database';
import { mockApi, resetDb } from '../testing';
import { useAuthStore } from './auth';
import { useSyncStore } from './sync';

const pulled = { status: 200, body: { changes: [], seq: 0, hasMore: false } };

function syncStore() {
  useAuthStore().device = { id: 'device', deviceId: newId(), token: 'token' };
  const sync = useSyncStore();
  const listener = vi.fn<() => void>();
  sync.onSynced(listener);
  return { sync, listener };
}

describe('onSynced', () => {
  beforeEach(async () => {
    await resetDb();
    setActivePinia(createPinia());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('runs after a sync the server answered', async () => {
    mockApi(() => pulled);
    const { sync, listener } = syncStore();
    await sync.sync();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(sync.error).toBeNull();
  });

  it("doesn't run when the server can't be reached", async () => {
    vi.stubGlobal('fetch', async () => Promise.reject(new TypeError('Failed to fetch')));
    const { sync, listener } = syncStore();
    await sync.sync();
    expect(listener).not.toHaveBeenCalled();
    expect(sync.error).toBe('unreachable');
  });

  it('runs after a rejected mutation: the pull went through', async () => {
    await db.outbox.add({
      entity: 'equipment_items',
      entityId: newId(),
      mutation: {} as SyncMutation,
    });
    mockApi(({ path }) =>
      path === '/api/sync/push' ? { status: 400, body: { error: 'invalid_request' } } : pulled,
    );
    const { sync, listener } = syncStore();
    await sync.sync();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(sync.error).toBe('invalid_request');
  });
});

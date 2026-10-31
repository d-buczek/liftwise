import type { SyncMutation, SyncRow } from '@liftwise/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '../api/client';
import { db } from '../db/database';
import { applyLocal } from '../db/mutate';
import { dumbbells, mockApi, pulledBench, resetDb } from '../testing';
import { syncOnce } from './engine';

const TOKEN = 'token';

type Pages = Record<number, { changes: { entity: string; row: SyncRow }[]; next: number }>;

// A server that accepts every push and answers pulls by `since` from `pages`.
function server(pages: Pages = {}, pushStatus = 200) {
  const pushed: SyncMutation[][] = [];
  const pulls: number[] = [];
  const fetch = mockApi(({ path, body }) => {
    if (path === '/api/sync/push') {
      const { mutations } = body as { mutations: SyncMutation[] };
      pushed.push(mutations);
      return pushStatus === 200
        ? { status: 200, body: { results: [] } }
        : { status: pushStatus, body: { error: 'invalid_mutation', index: 0 } };
    }
    const since = Number(new URL(path, 'http://x').searchParams.get('since'));
    pulls.push(since);
    const page = pages[since] ?? { changes: [], next: since };
    return {
      status: 200,
      body: {
        changes: page.changes,
        seq: page.next,
        hasMore: since in pages && page.next !== since,
      },
    };
  });
  return { pushed, pulls, fetch };
}

describe('syncOnce', () => {
  beforeEach(resetDb);
  afterEach(() => vi.unstubAllGlobals());

  it('pushes the outbox in order in batches of at most 100 and empties it', async () => {
    const items = Array.from({ length: 150 }, () => dumbbells());
    await applyLocal(items.map((row) => ({ op: 'upsert', entity: 'equipment_items', row })));
    const { pushed, fetch } = server();

    await syncOnce(db, TOKEN);

    expect(pushed.map((batch) => batch.length)).toEqual([100, 50]);
    expect(pushed.flat().map((mutation) => mutation.row.id)).toEqual(items.map((row) => row.id));
    expect(await db.outbox.count()).toBe(0);
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer token',
    );
  });

  it('pulls page by page into the mirror and resumes from the stored cursor', async () => {
    const first = pulledBench(3);
    const second = pulledBench(9);
    const { pulls } = server({
      0: { changes: [{ entity: 'equipment_items', row: first }], next: 3 },
      3: { changes: [{ entity: 'equipment_items', row: second }], next: 9 },
    });

    await syncOnce(db, TOKEN);
    expect(pulls).toEqual([0, 3, 9]);
    expect(await db.equipment_items.toArray()).toEqual(expect.arrayContaining([first, second]));
    expect(await db.sync_state.get('pull')).toMatchObject({ seq: 9 });

    await syncOnce(db, TOKEN);
    expect(pulls).toEqual([0, 3, 9, 9]);
  });

  it('keeps a locally changed record that is still queued, but pulls the rest', async () => {
    const local = dumbbells(30);
    await applyLocal([{ op: 'upsert', entity: 'equipment_items', row: local }]);
    const other = pulledBench(5);
    // The push is rejected, so the local change stays in the outbox.
    server(
      {
        0: {
          changes: [
            { entity: 'equipment_items', row: { ...pulledBench(4, local.id), seq: 4 } },
            { entity: 'equipment_items', row: other },
          ],
          next: 5,
        },
      },
      400,
    );

    const error = await syncOnce(db, TOKEN).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'invalid_mutation' });
    expect(await db.equipment_items.get(local.id)).toMatchObject({
      type: 'dumbbells',
      props: { max_kg: 30 },
    });
    expect(await db.equipment_items.get(other.id)).toEqual(other);
    expect(await db.outbox.count()).toBe(1);
    expect(await db.sync_state.get('pull')).toMatchObject({ seq: 5 });
  });

  it('stops without pulling when the server is unreachable and keeps the outbox', async () => {
    await applyLocal([{ op: 'upsert', entity: 'equipment_items', row: dumbbells() }]);
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(syncOnce(db, TOKEN)).rejects.toMatchObject({ status: 0, code: 'unreachable' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(await db.outbox.count()).toBe(1);
  });

  it('lets a 401 through to the caller', async () => {
    mockApi(() => ({ status: 401, body: { error: 'unauthorized' } }));
    await expect(syncOnce(db, TOKEN)).rejects.toMatchObject({ status: 401 });
  });
});

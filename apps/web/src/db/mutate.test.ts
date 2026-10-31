import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { dumbbells, resetDb } from '../testing';
import { db } from './database';
import { applyLocal, onLocalChange } from './mutate';

describe('applyLocal', () => {
  beforeEach(resetDb);

  it('writes the mirror and queues one mutation per change with a shared group', async () => {
    const first = dumbbells();
    const second = dumbbells(null);
    const groupId = await applyLocal([
      { op: 'upsert', entity: 'equipment_items', row: first },
      { op: 'upsert', entity: 'equipment_items', row: second },
    ]);

    const stored = await db.equipment_items.get(first.id);
    expect(stored).toMatchObject({ ...first, deleted_at: null, seq: 0 });
    expect(stored?.created_at).toBe(stored?.updated_at);

    const outbox = await db.outbox.orderBy('id').toArray();
    expect(outbox.map((entry) => entry.entityId)).toEqual([first.id, second.id]);
    expect(outbox.map((entry) => entry.mutation.groupId)).toEqual([groupId, groupId]);
    expect(new Set(outbox.map((entry) => entry.mutation.mutationId)).size).toBe(2);
  });

  it('keeps created_at and seq of an existing row and applies schema defaults', async () => {
    const item = dumbbells();
    await db.equipment_items.put({
      ...item,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      deleted_at: '2026-10-02T00:00:00.000Z',
      seq: 7,
    });
    await applyLocal([{ op: 'upsert', entity: 'equipment_items', row: { ...item, props: {} } }]);

    // An upsert of a tombstone brings it back, as on the server (§6.4).
    expect(await db.equipment_items.get(item.id)).toMatchObject({
      props: { max_kg: null },
      created_at: '2026-10-01T00:00:00.000Z',
      deleted_at: null,
      seq: 7,
    });
  });

  it('turns a delete into a tombstone', async () => {
    const item = dumbbells();
    await applyLocal([{ op: 'upsert', entity: 'equipment_items', row: item }]);
    await applyLocal([{ op: 'delete', entity: 'equipment_items', row: { id: item.id } }]);

    const stored = await db.equipment_items.get(item.id);
    expect(stored?.deleted_at).toEqual(expect.any(String));
    expect(stored?.props).toEqual(item.props);
    expect((await db.outbox.toArray()).map((entry) => entry.mutation.op)).toEqual([
      'upsert',
      'delete',
    ]);
  });

  it('rejects an invalid change without writing anything', async () => {
    const valid = dumbbells();
    await expect(
      applyLocal([
        { op: 'upsert', entity: 'equipment_items', row: valid },
        { op: 'upsert', entity: 'equipment_items', row: { ...dumbbells(), props: { max_kg: -5 } } },
      ]),
    ).rejects.toThrow(/max_kg/);
    expect(await db.equipment_items.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('tells listeners after the write', async () => {
    const listener = vi.fn<() => Promise<void>>(async () =>
      expect(await db.outbox.count()).toBe(1),
    );
    const stop = onLocalChange(listener);
    await applyLocal([{ op: 'upsert', entity: 'equipment_items', row: dumbbells() }]);
    stop();
    await applyLocal([{ op: 'upsert', entity: 'equipment_items', row: dumbbells() }]);
    expect(listener).toHaveBeenCalledOnce();
  });
});

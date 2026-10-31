import { seedCatalog, SYNC_PULL_LIMIT } from '@liftwise/core';
import { describe, expect, it } from 'vite-plus/test';
import { createDevice, pull } from '../../test/helpers';

// Fails when exercises.json changed without `db:seed` (a new seed migration).
describe('seed catalog', () => {
  it('is in D1 after the migrations, ready to pull', async () => {
    const { token } = await createDevice();
    const { changes, hasMore } = await pull(token, 0, SYNC_PULL_LIMIT);
    expect(hasMore).toBe(false);

    const rows = changes.map(({ entity, row }) => {
      const { created_at: _created, updated_at: _updated, deleted_at, seq, ...fields } = row;
      expect({ entity, deleted_at, seq: typeof seq }).toEqual({
        entity: 'exercises',
        deleted_at: null,
        seq: 'number',
      });
      return fields;
    });
    expect(rows).toEqual(seedCatalog());
    expect(changes.map(({ row }) => row.seq)).toEqual(rows.map((_, i) => i + 1));
  });
});

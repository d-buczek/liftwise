import { newId, seedCatalog, SYNC_PULL_LIMIT } from '@liftwise/core';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vite-plus/test';
import { createDevice, lastSeq, pull, repsExercise } from '../../test/helpers';
import { seedCatalogSql } from './seed';

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

// A seed migration, as wrangler applies it.
const runSeed = (catalog = seedCatalog()) =>
  env.DB.batch(seedCatalogSql(catalog).map((statement) => env.DB.prepare(statement)));

describe('seed catalog', () => {
  // Fails when exercises were added without `db:seed`, or a migrated one was edited in
  // exercises.json: migrations keep its first version (D40), so it changes by a mutation.
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
    expect(rows.toSorted(byId)).toEqual(seedCatalog().toSorted(byId));
    expect(changes.map(({ row }) => row.seq)).toEqual(rows.map((_, i) => i + 1));
  });

  it('adds only new exercises in a later migration', async () => {
    const { token } = await createDevice();
    const since = await lastSeq();
    await runSeed();
    expect(await lastSeq()).toBe(since);

    const added = { ...repsExercise, id: newId(), name_pl: 'Nowe ćwiczenie' };
    const edited = seedCatalog().map((exercise) => ({ ...exercise, note: 'Zmienione' }));
    await runSeed([...edited, added]);
    const { changes } = await pull(token, since);
    expect(changes.map(({ row }) => [row.id, row.seq])).toEqual([[added.id, since + 1]]);
  });
});

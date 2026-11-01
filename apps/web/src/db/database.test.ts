import { newId } from '@liftwise/core';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { LiftWiseDb } from './database';

const name = 'liftwise-upgrade';

describe('LiftWiseDb', () => {
  afterEach(() => Dexie.delete(name));

  it('gives workouts pulled before labels no label', async () => {
    const before = new Dexie(name);
    before.version(2).stores({ workouts: 'id, date' });
    const id = newId();
    await before.table('workouts').put({ id, date: '2026-10-01', note: '' });
    before.close();

    const upgraded = new LiftWiseDb(name);
    expect(await upgraded.workouts.get(id)).toMatchObject({ id, label_id: null });
    upgraded.close();
  });
});

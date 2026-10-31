import type { SyncEntity, SyncMutation, SyncRow } from '@liftwise/core';
import { Dexie, type EntityTable, type Table } from 'dexie';

// Local mirror of the synced tables plus client-only state (SPEC §6.3). Mirror rows keep the
// sync fields; tombstones stay, so readers filter `deleted_at`.

// A mutation waiting for push; `entity` + `entityId` mark the record as locally changed.
export type OutboxEntry = {
  id: number;
  entity: SyncEntity;
  entityId: string;
  mutation: SyncMutation;
};

// Pull cursor (§6.4) and the time of the last finished sync.
export type SyncState = { id: 'pull'; seq: number; syncedAt: string };

// This device's token (§6.8: IndexedDB on the PC; Keystore on Android comes with LW-08).
export type DeviceAuth = { id: 'device'; deviceId: string; token: string };

export class LiftWiseDb extends Dexie {
  exercises!: Table<SyncRow<'exercises'>, string>;
  equipment_items!: Table<SyncRow<'equipment_items'>, string>;
  workouts!: Table<SyncRow<'workouts'>, string>;
  sets!: Table<SyncRow<'sets'>, string>;
  athlete_profile!: Table<SyncRow<'athlete_profile'>, string>;
  settings!: Table<SyncRow<'settings'>, string>;
  outbox!: EntityTable<OutboxEntry, 'id'>;
  sync_state!: Table<SyncState, string>;
  device!: Table<DeviceAuth, string>;

  constructor(name = 'liftwise') {
    super(name);
    this.version(1).stores({
      exercises: 'id',
      equipment_items: 'id',
      workouts: 'id',
      sets: 'id',
      athlete_profile: 'id',
      settings: 'id',
      outbox: '++id, [entity+entityId]',
      sync_state: 'id',
      device: 'id',
    });
  }

  mirror(entity: SyncEntity): Table<SyncRow, string> {
    return this.table(entity);
  }

  mirrorTables(): Table[] {
    return [
      this.exercises,
      this.equipment_items,
      this.workouts,
      this.sets,
      this.athlete_profile,
      this.settings,
    ];
  }
}

export const db = new LiftWiseDb();

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

// This device's token (§6.8): kept here on the PC; Android keeps it in the Keystore
// (native/deviceStorage).
export type DeviceAuth = { id: 'device'; deviceId: string; token: string };

// A prompt to the agent waiting for the network (§5.9.8): `id` is the user message's id,
// `localTime` when it was said. `tries` counts the requests sent; after one that got no answer the
// server may already have the message. `failed` waits for the user (retry or delete).
export type QueuedPrompt = {
  seq: number;
  id: string;
  threadId: string;
  text: string;
  localTime: string;
  status: 'pending' | 'failed';
  error: { code: string; provider?: string } | null;
  tries: number;
};

export class LiftWiseDb extends Dexie {
  exercises!: Table<SyncRow<'exercises'>, string>;
  equipment_items!: Table<SyncRow<'equipment_items'>, string>;
  workout_labels!: Table<SyncRow<'workout_labels'>, string>;
  workouts!: Table<SyncRow<'workouts'>, string>;
  sets!: Table<SyncRow<'sets'>, string>;
  athlete_profile!: Table<SyncRow<'athlete_profile'>, string>;
  settings!: Table<SyncRow<'settings'>, string>;
  threads!: Table<SyncRow<'threads'>, string>;
  messages!: Table<SyncRow<'messages'>, string>;
  outbox!: EntityTable<OutboxEntry, 'id'>;
  sync_state!: Table<SyncState, string>;
  device!: Table<DeviceAuth, string>;
  prompt_queue!: EntityTable<QueuedPrompt, 'seq'>;

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
    // The calendar reads workouts by date, a day its sets, history the sets of an exercise.
    this.version(2).stores({
      workouts: 'id, date',
      sets: 'id, workout_id, exercise_id',
    });
    // Workout labels (D48); workouts pulled before them get no label.
    this.version(3)
      .stores({ workout_labels: 'id' })
      .upgrade((tx) =>
        tx
          .table('workouts')
          .toCollection()
          .modify((workout: Partial<SyncRow<'workouts'>>) => {
            workout.label_id ??= null;
          }),
      );
    // Agent threads by day and their messages (§5.9.5), pulled only.
    this.version(4).stores({ threads: 'id, date', messages: 'id, thread_id' });
    // The offline prompt queue (§5.9.8), client only, in the order the prompts were said.
    this.version(5).stores({ prompt_queue: '++seq' });
  }

  mirror(entity: SyncEntity): Table<SyncRow, string> {
    return this.table(entity);
  }

  mirrorTables(): Table[] {
    return [
      this.exercises,
      this.equipment_items,
      this.workout_labels,
      this.workouts,
      this.sets,
      this.athlete_profile,
      this.settings,
      this.threads,
      this.messages,
    ];
  }
}

export const db = new LiftWiseDb();

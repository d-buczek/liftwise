import type {
  Checkin,
  EquipmentItem,
  EquipmentType,
  MovementPattern,
  MuscleGroup,
  Range,
  Setting,
  SyncEntity,
} from '@liftwise/core';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Column names are the core field names (snake_case), so a row maps 1:1 onto a core type.
// Timestamps are ISO 8601 strings. Synced tables have no foreign keys: rows reference
// client-generated ids and the sync push checks them (src/sync/routes.ts), so a tombstoned
// parent never blocks a write from the other device.

const json = <T>() => text({ mode: 'json' }).$type<T>();
const bool = () => integer({ mode: 'boolean' });

// Fields of every synced table (§6.3); `seq` is the server sequence used by pull.
const synced = () => ({
  id: text().primaryKey(),
  created_at: text().notNull(),
  updated_at: text().notNull(),
  deleted_at: text(),
  seq: integer().notNull(),
});

export const exercises = sqliteTable(
  'exercises',
  {
    ...synced(),
    name_pl: text().notNull(),
    aliases: json<string[]>().notNull(),
    primary_muscles: json<MuscleGroup[]>().notNull(),
    secondary_muscles: json<MuscleGroup[]>().notNull(),
    patterns: json<MovementPattern[]>().notNull(),
    requires: json<EquipmentType[]>().notNull(),
    implements: integer().$type<1 | 2>().notNull(),
    unilateral: bool().notNull(),
    rest_seconds: integer().notNull(),
    weight_step_kg: real(),
    note: text(),
    archived: bool().notNull().default(false),
    // Variant by measure (D32): exactly one of rep_range / time_range_s is set.
    measure: text({ enum: ['reps', 'time'] }).notNull(),
    rep_range: json<Range>(),
    time_range_s: json<Range>(),
  },
  (t) => [index('exercises_seq_idx').on(t.seq)],
);

export const equipmentItems = sqliteTable(
  'equipment_items',
  {
    ...synced(),
    type: text().$type<EquipmentType>().notNull(),
    props: json<EquipmentItem['props']>().notNull(),
  },
  (t) => [index('equipment_items_seq_idx').on(t.seq)],
);

export const workouts = sqliteTable(
  'workouts',
  {
    ...synced(),
    date: text().notNull(),
    started_at: text(),
    ended_at: text(),
    checkin: json<Checkin>(),
    rationale: text(),
    note: text().notNull().default(''),
  },
  (t) => [index('workouts_seq_idx').on(t.seq), index('workouts_date_idx').on(t.date)],
);

export const sets = sqliteTable(
  'sets',
  {
    ...synced(),
    workout_id: text().notNull(),
    exercise_id: text().notNull(),
    position: integer().notNull(),
    status: text({ enum: ['planned', 'done'] }).notNull(),
    weight_kg: real().notNull(),
    reps: integer(),
    duration_s: integer(),
    rir: integer(),
    warmup: bool().notNull().default(false),
    note: text().notNull().default(''),
    performed_at: text(),
    source: text({ enum: ['manual', 'copy', 'agent', 'proposal'] }).notNull(),
  },
  (t) => [
    index('sets_seq_idx').on(t.seq),
    index('sets_workout_idx').on(t.workout_id),
    index('sets_exercise_idx').on(t.exercise_id),
  ],
);

export const athleteProfile = sqliteTable(
  'athlete_profile',
  {
    ...synced(),
    content: text().notNull().default(''),
  },
  (t) => [index('athlete_profile_seq_idx').on(t.seq)],
);

export const settings = sqliteTable(
  'settings',
  {
    ...synced(),
    key: text().$type<Setting['key']>().notNull(),
    value: json<Setting['value']>().notNull(),
  },
  (t) => [index('settings_seq_idx').on(t.seq)],
);

// Per-day agent threads (§5.9.5); LW-09 extends threads and messages as needed.
export const threads = sqliteTable(
  'threads',
  {
    ...synced(),
    date: text().notNull(),
    workout_id: text(),
  },
  (t) => [index('threads_seq_idx').on(t.seq), index('threads_date_idx').on(t.date)],
);

export const messages = sqliteTable(
  'messages',
  {
    ...synced(),
    thread_id: text().notNull(),
    role: text({ enum: ['user', 'assistant'] }).notNull(),
    // Message parts, incl. tool calls and results.
    parts: json<unknown[]>().notNull(),
  },
  (t) => [index('messages_seq_idx').on(t.seq), index('messages_thread_idx').on(t.thread_id)],
);

// Server-only tables.

export const changeLog = sqliteTable(
  'change_log',
  {
    id: text().primaryKey(),
    change_group_id: text().notNull(),
    actor: text({ enum: ['user', 'agent', 'system'] }).notNull(),
    thread_id: text(),
    entity: text().$type<SyncEntity>().notNull(),
    entity_id: text().notNull(),
    op: text({ enum: ['upsert', 'delete'] }).notNull(),
    before: json<Record<string, unknown>>(),
    after: json<Record<string, unknown>>(),
    // The `seq` this change gave the row; a newer `seq` on the row means a later change (undo).
    // Every write sets it; the default only lets SQLite add the column.
    seq: integer().notNull().default(0),
    undo_of: text(),
    created_at: text().notNull(),
  },
  (t) => [
    index('change_log_group_idx').on(t.change_group_id),
    index('change_log_entity_idx').on(t.entity, t.entity_id),
    // A group is undone once: a concurrent second undo writes the same records and fails.
    uniqueIndex('change_log_undo_of_idx').on(t.undo_of, t.entity, t.entity_id),
  ],
);

// Idempotency of sync pushes (§6.4).
export const appliedMutations = sqliteTable('applied_mutations', {
  mutation_id: text().primaryKey(),
  device_id: text().notNull(),
  applied_at: text().notNull(),
});

export const devices = sqliteTable('devices', {
  id: text().primaryKey(),
  name: text().notNull(),
  token_hash: text().notNull().unique(),
  created_at: text().notNull(),
  last_seen_at: text(),
  revoked_at: text(),
});

export const pairingCodes = sqliteTable('pairing_codes', {
  id: text().primaryKey(),
  code_hash: text().notNull().unique(),
  created_by: text().notNull(),
  created_at: text().notNull(),
  expires_at: text().notNull(),
  used_at: text(),
});

// Failed redeem attempts, for the rate limit (§6.8).
export const pairingFailures = sqliteTable(
  'pairing_failures',
  {
    id: text().primaryKey(),
    at: text().notNull(),
  },
  (t) => [index('pairing_failures_at_idx').on(t.at)],
);

// Single row holding the last assigned `seq`.
export const syncCounter = sqliteTable('sync_counter', {
  id: integer().primaryKey(),
  value: integer().notNull(),
});

// Risky tool calls awaiting confirmation (§5.9.3); LW-09 extends this.
export const pendingProposals = sqliteTable('pending_proposals', {
  id: text().primaryKey(),
  thread_id: text().notNull(),
  tool: text().notNull(),
  input: json<unknown>().notNull(),
  status: text({ enum: ['pending', 'confirmed', 'rejected'] }).notNull(),
  created_at: text().notNull(),
  resolved_at: text(),
});

export type Device = typeof devices.$inferSelect;

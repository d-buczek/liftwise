import { z } from 'zod';
import { idSchema } from './ids';
import { equipmentItemSchema } from './schemas/equipment';
import { exerciseSchema } from './schemas/exercise';
import { workoutLabelSchema } from './schemas/label';
import { ATHLETE_PROFILE_ID, athleteProfileSchema } from './schemas/profile';
import { workoutSetSchema } from './schemas/set';
import { SETTING_IDS, settingSchema } from './schemas/settings';
import { workoutSchema } from './schemas/workout';

// Sync protocol (§6.4). Clients push mutations from their outbox and pull rows changed since a
// `seq`; the server is authoritative and resolves conflicts last-write-wins in apply order.

// Tables clients push and pull; `threads` / `messages` join with LW-09.
export const syncEntitySchema = z.enum([
  'exercises',
  'equipment_items',
  'workout_labels',
  'workouts',
  'sets',
  'athlete_profile',
  'settings',
]);
export type SyncEntity = z.infer<typeof syncEntitySchema>;

export const syncRowSchemas = {
  exercises: exerciseSchema,
  equipment_items: equipmentItemSchema,
  workout_labels: workoutLabelSchema,
  workouts: workoutSchema,
  sets: workoutSetSchema,
  athlete_profile: athleteProfileSchema,
  settings: settingSchema,
};
export type SyncRows = { [E in SyncEntity]: z.infer<(typeof syncRowSchemas)[E]> };

// Set by the server on every write; a row with `deleted_at` is a tombstone.
export type SyncFields = {
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  seq: number;
};
export type SyncRow<E extends SyncEntity = SyncEntity> = SyncRows[E] & SyncFields;

export const SYNC_PUSH_MAX = 100;
export const SYNC_PULL_LIMIT = 500;

// `groupId` is one per user action (e.g. a copied workout), so one undo reverts it (D41).
const mutationFields = { mutationId: idSchema, groupId: idSchema };

// An upsert carries the full domain row; the server sets the sync fields.
function upsertOf<E extends SyncEntity, S extends z.ZodType>(entity: E, row: S) {
  return z.object({ ...mutationFields, op: z.literal('upsert'), entity: z.literal(entity), row });
}

export const syncMutationSchema = z.discriminatedUnion('op', [
  z.discriminatedUnion('entity', [
    upsertOf('exercises', exerciseSchema),
    upsertOf('equipment_items', equipmentItemSchema),
    upsertOf('workout_labels', workoutLabelSchema),
    upsertOf('workouts', workoutSchema),
    upsertOf('sets', workoutSetSchema),
    upsertOf(
      'athlete_profile',
      athleteProfileSchema.refine((row) => row.id === ATHLETE_PROFILE_ID, {
        message: 'the profile has a fixed id',
        path: ['id'],
      }),
    ),
    upsertOf(
      'settings',
      settingSchema.refine((row) => row.id === SETTING_IDS[row.key], {
        message: 'a setting has the fixed id of its key',
        path: ['id'],
      }),
    ),
  ]),
  // A delete leaves a tombstone, so it reaches every device through pull.
  z.object({
    ...mutationFields,
    op: z.literal('delete'),
    entity: syncEntitySchema,
    row: z.object({ id: idSchema }),
  }),
]);
export type SyncMutation = z.infer<typeof syncMutationSchema>;
export type SyncMutationInput = z.input<typeof syncMutationSchema>;

export const syncPushSchema = z.object({
  mutations: z
    .array(syncMutationSchema)
    .max(SYNC_PUSH_MAX)
    .refine((mutations) => new Set(mutations.map((m) => m.mutationId)).size === mutations.length, {
      message: 'mutation ids are unique',
    }),
});
export type SyncPush = z.infer<typeof syncPushSchema>;

// `duplicate`: the mutation id was applied before, so the retry changed nothing.
export type SyncPushResponse = {
  results: { mutationId: string; status: 'applied' | 'duplicate' }[];
};

export type SyncChange = { [E in SyncEntity]: { entity: E; row: SyncRow<E> } }[SyncEntity];

// Changes ordered by `seq`; `seq` is the cursor for the next pull (`since`).
export type SyncPullResponse = { changes: SyncChange[]; seq: number; hasMore: boolean };

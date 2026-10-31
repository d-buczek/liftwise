import { describe, expect, it } from 'vite-plus/test';
import { idSchema, newId } from './ids';
import { ATHLETE_PROFILE_ID } from './schemas/profile';
import { DEFAULT_TRAINING_SETTINGS, SETTING_IDS } from './schemas/settings';
import { SYNC_PUSH_MAX, syncMutationSchema, syncPushSchema } from './sync';
import { makeExercise, makeSet } from './testing';

const mutation = (fields: Record<string, unknown>) => ({
  mutationId: newId(),
  groupId: newId(),
  ...fields,
});

describe('sync mutations', () => {
  it('validates an upsert row by entity and fills defaults', () => {
    const { warmup: _warmup, note: _note, ...set } = makeSet();
    const parsed = syncMutationSchema.parse(mutation({ op: 'upsert', entity: 'sets', row: set }));
    expect(parsed.row).toMatchObject({ warmup: false, note: '' });

    const asWorkout = mutation({ op: 'upsert', entity: 'workouts', row: set });
    expect(syncMutationSchema.safeParse(asWorkout).success).toBe(false);
  });

  it('drops sync fields the client sends along', () => {
    const exercise = { ...makeExercise(), seq: 7, deleted_at: null };
    const parsed = syncMutationSchema.parse(
      mutation({ op: 'upsert', entity: 'exercises', row: exercise }),
    );
    expect(parsed.row).not.toHaveProperty('seq');
    expect(parsed.row).not.toHaveProperty('deleted_at');
  });

  it('deletes by id for any entity', () => {
    const remove = mutation({ op: 'delete', entity: 'workouts', row: { id: newId() } });
    expect(syncMutationSchema.safeParse(remove).success).toBe(true);
    const unknown = { ...remove, entity: 'devices' };
    expect(syncMutationSchema.safeParse(unknown).success).toBe(false);
  });

  it('requires the fixed ids of singletons', () => {
    const profile = (id: string) =>
      mutation({ op: 'upsert', entity: 'athlete_profile', row: { id, content: '' } });
    expect(syncMutationSchema.safeParse(profile(ATHLETE_PROFILE_ID)).success).toBe(true);
    expect(syncMutationSchema.safeParse(profile(newId())).success).toBe(false);

    const training = (id: string) =>
      mutation({
        op: 'upsert',
        entity: 'settings',
        row: { id, key: 'training', value: DEFAULT_TRAINING_SETTINGS },
      });
    expect(syncMutationSchema.safeParse(training(SETTING_IDS.training)).success).toBe(true);
    expect(syncMutationSchema.safeParse(training(SETTING_IDS.balance)).success).toBe(false);
  });

  it('has valid singleton ids', () => {
    for (const id of [ATHLETE_PROFILE_ID, ...Object.values(SETTING_IDS)]) {
      expect(idSchema.safeParse(id).success).toBe(true);
    }
    expect(new Set(Object.values(SETTING_IDS)).size).toBe(Object.keys(SETTING_IDS).length);
  });
});

describe('sync push', () => {
  const remove = () => mutation({ op: 'delete', entity: 'sets', row: { id: newId() } });

  it('caps the batch size', () => {
    const mutations = Array.from({ length: SYNC_PUSH_MAX + 1 }, remove);
    expect(syncPushSchema.safeParse({ mutations }).success).toBe(false);
    expect(syncPushSchema.safeParse({ mutations: mutations.slice(1) }).success).toBe(true);
  });

  it('rejects repeated mutation ids', () => {
    const first = remove();
    const again = { ...remove(), mutationId: first.mutationId };
    expect(syncPushSchema.safeParse({ mutations: [first, again] }).success).toBe(false);
  });
});

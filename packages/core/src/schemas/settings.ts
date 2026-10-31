import { z } from 'zod';
import { DEFAULT_WEIGHT_STEP_KG } from '../conventions';
import { idSchema } from '../ids';
import { rangeOf, rirSchema, weightKgSchema, type Range } from './common';
import { muscleGroupSchema, type MuscleGroup } from './exercise';

export const trainingSettingsSchema = z.object({
  rest_seconds: z.int().nonnegative(),
  target_rir: rangeOf(rirSchema),
  weight_step_kg: weightKgSchema.positive(),
});
export type TrainingSettings = z.infer<typeof trainingSettingsSchema>;

// Rolling 7-day hard sets per muscle group (§5.8).
export const balanceSettingsSchema = z.object({
  weekly_sets: z.record(muscleGroupSchema, rangeOf(z.int().nonnegative())),
});
export type BalanceSettings = z.infer<typeof balanceSettingsSchema>;

export const providerSchema = z.enum(['anthropic', 'openai', 'google']);
export type Provider = z.infer<typeof providerSchema>;

const modelChoiceSchema = z.object({ provider: providerSchema, model: z.string().min(1) });

// Model per role (D17); default model ids are server settings, not part of core.
export const modelSettingsSchema = z.object({
  fast: modelChoiceSchema,
  planner: modelChoiceSchema,
});
export type ModelSettings = z.infer<typeof modelSettingsSchema>;

export const settingSchema = z.discriminatedUnion('key', [
  z.object({ id: idSchema, key: z.literal('training'), value: trainingSettingsSchema }),
  z.object({ id: idSchema, key: z.literal('balance'), value: balanceSettingsSchema }),
  z.object({ id: idSchema, key: z.literal('models'), value: modelSettingsSchema }),
]);
export type Setting = z.infer<typeof settingSchema>;
export type SettingKey = Setting['key'];

// One row per key with a fixed id, so devices creating it offline write the same row (D41).
export const SETTING_IDS: Record<SettingKey, string> = {
  training: '01a18f41-8c00-7000-8001-000000000002',
  balance: '01a18f41-8c00-7000-8001-000000000003',
  models: '01a18f41-8c00-7000-8001-000000000004',
};

export const DEFAULT_TRAINING_SETTINGS: TrainingSettings = {
  rest_seconds: 120,
  target_rir: { min: 1, max: 2 },
  weight_step_kg: DEFAULT_WEIGHT_STEP_KG,
};

export const DEFAULT_BALANCE_SETTINGS: BalanceSettings = {
  weekly_sets: Object.fromEntries(
    muscleGroupSchema.options.map((group) => [group, { min: 10, max: 20 }]),
  ) as Record<MuscleGroup, Range>,
};

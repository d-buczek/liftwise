import { describe, expect, it } from 'vite-plus/test';
import { newId } from '../ids';
import { muscleGroupSchema } from './exercise';
import {
  balanceSettingsSchema,
  DEFAULT_BALANCE_SETTINGS,
  DEFAULT_TRAINING_SETTINGS,
  settingSchema,
  trainingSettingsSchema,
} from './settings';

describe('settings', () => {
  it('has valid defaults', () => {
    expect(trainingSettingsSchema.parse(DEFAULT_TRAINING_SETTINGS).weight_step_kg).toBe(1.25);
    const balance = balanceSettingsSchema.parse(DEFAULT_BALANCE_SETTINGS);
    expect(Object.keys(balance.weekly_sets)).toEqual(muscleGroupSchema.options);
  });

  it('validates the value by key', () => {
    const training = { id: newId(), key: 'training', value: DEFAULT_TRAINING_SETTINGS };
    expect(settingSchema.safeParse(training).success).toBe(true);
    expect(settingSchema.safeParse({ ...training, key: 'balance' }).success).toBe(false);
    expect(settingSchema.safeParse({ ...training, key: 'theme' }).success).toBe(false);
  });

  it('accepts a model per role', () => {
    const models = {
      fast: { provider: 'anthropic', model: 'some-model' },
      planner: { provider: 'google', model: 'other-model' },
    };
    const row = { id: newId(), key: 'models', value: models };
    expect(settingSchema.safeParse(row).success).toBe(true);
    const unknownProvider = { ...models, fast: { provider: 'mistral', model: 'x' } };
    expect(settingSchema.safeParse({ ...row, value: unknownProvider }).success).toBe(false);
  });
});

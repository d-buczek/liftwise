import { newId, SETTING_IDS } from '@liftwise/core';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { call, createDevice, push, upsert } from '../../test/helpers';
import { PROVIDERS, ProviderUnavailable, resolveModel, type ProvidersResponse } from './providers';

const NO_KEYS = {
  ANTHROPIC_API_KEY: undefined,
  OPENAI_API_KEY: undefined,
  GOOGLE_GENERATIVE_AI_API_KEY: undefined,
};

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

const providers = async (env: Partial<Cloudflare.Env>) =>
  (await call('/api/providers', { token, env: { ...NO_KEYS, ...env } })).json<ProvidersResponse>();

describe('providers', () => {
  it('shows which providers have a key, never the key', async () => {
    const body = await providers({ OPENAI_API_KEY: 'sk-secret' });
    expect(body.providers.map(({ id, configured }) => [id, configured])).toEqual([
      ['anthropic', false],
      ['openai', true],
      ['google', false],
    ]);
    expect(JSON.stringify(body)).not.toContain('sk-secret');
    // Without a saved choice the first configured provider's defaults apply.
    expect(body.models.fast).toEqual({ provider: 'openai', model: PROVIDERS.openai.defaults.fast });
  });

  it('defaults to Anthropic and uses the saved model choice', async () => {
    expect((await providers({})).models.planner).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
    });
    const value = {
      fast: { provider: 'google', model: 'gemini-x' },
      planner: { provider: 'anthropic', model: 'claude-y' },
    };
    await push(token, [upsert('settings', { id: SETTING_IDS.models, key: 'models', value })]);
    expect((await providers({})).models).toEqual(value);
  });

  it('creates a model only with a key', () => {
    for (const provider of ['anthropic', 'openai', 'google'] as const) {
      const choice = { provider, model: `${provider}-model` };
      expect(() => resolveModel({}, choice)).toThrow(ProviderUnavailable);
      const { model } = resolveModel({ [PROVIDERS[provider].secretName]: newId() }, choice);
      expect(model).toMatchObject({ modelId: `${provider}-model` });
    }
  });
});

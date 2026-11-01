import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import {
  modelSettingsSchema,
  providerSchema,
  SETTING_IDS,
  type ModelSettings,
  type Provider,
  type ProvidersResponse,
} from '@liftwise/core';
import type { LanguageModel } from 'ai';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../app-env';
import type { Db } from '../db';
import { settings } from '../db/schema';

// The model provider layer (§6.7): provider → secret and model factory. A provider is available
// iff its secret is set. Model ids are settings; these defaults apply until the user picks one.
// An optional base URL variable points a provider elsewhere (the chat profile's replay server).

type ProviderEntry = {
  secretName: 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY' | 'GOOGLE_GENERATIVE_AI_API_KEY';
  baseUrlName: 'ANTHROPIC_BASE_URL' | 'OPENAI_BASE_URL' | 'GOOGLE_GENERATIVE_AI_BASE_URL';
  createModel: (apiKey: string, modelId: string, baseURL?: string) => LanguageModel;
  defaults: Record<keyof ModelSettings, string>;
};

export const PROVIDERS: Record<Provider, ProviderEntry> = {
  anthropic: {
    secretName: 'ANTHROPIC_API_KEY',
    baseUrlName: 'ANTHROPIC_BASE_URL',
    createModel: (apiKey, modelId, baseURL) => createAnthropic({ apiKey, baseURL })(modelId),
    defaults: { fast: 'claude-haiku-5-5', planner: 'claude-sonnet-5-5' },
  },
  openai: {
    secretName: 'OPENAI_API_KEY',
    baseUrlName: 'OPENAI_BASE_URL',
    createModel: (apiKey, modelId, baseURL) => createOpenAI({ apiKey, baseURL })(modelId),
    defaults: { fast: 'gpt-6-luna', planner: 'gpt-6-sol' },
  },
  google: {
    secretName: 'GOOGLE_GENERATIVE_AI_API_KEY',
    baseUrlName: 'GOOGLE_GENERATIVE_AI_BASE_URL',
    createModel: (apiKey, modelId, baseURL) => createGoogle({ apiKey, baseURL })(modelId),
    defaults: { fast: 'gemini-3.8-flash', planner: 'gemini-pro-latest' },
  },
};

export type Role = keyof ModelSettings;
type Secrets = Partial<Record<ProviderEntry['secretName'] | ProviderEntry['baseUrlName'], string>>;

export function configuredProviders(env: Secrets): Provider[] {
  return providerSchema.options.filter((provider) => Boolean(env[PROVIDERS[provider].secretName]));
}

// Without a saved choice each role takes the defaults of the first configured provider
// (Anthropic first, D16).
export function defaultModels(env: Secrets): ModelSettings {
  const provider = configuredProviders(env)[0] ?? 'anthropic';
  const { defaults } = PROVIDERS[provider];
  return {
    fast: { provider, model: defaults.fast },
    planner: { provider, model: defaults.planner },
  };
}

export async function modelSettings(db: Db, env: Secrets): Promise<ModelSettings> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.id, SETTING_IDS.models), isNull(settings.deleted_at)));
  const saved = modelSettingsSchema.safeParse(row?.value);
  return saved.success ? saved.data : defaultModels(env);
}

export class ProviderUnavailable extends Error {
  constructor(readonly provider: Provider) {
    super(`provider ${provider} has no API key`);
    this.name = 'ProviderUnavailable';
  }
}

// The model of a role, with its provider (prompt caching is provider-specific).
export function resolveModel(
  env: Secrets,
  choice: ModelSettings[Role],
): { provider: Provider; model: LanguageModel } {
  const entry = PROVIDERS[choice.provider];
  const apiKey = env[entry.secretName];
  if (!apiKey) throw new ProviderUnavailable(choice.provider);
  return {
    provider: choice.provider,
    model: entry.createModel(apiKey, choice.model, env[entry.baseUrlName] || undefined),
  };
}

// Configured ✓/✗ per provider (never a key) and the models in use (§5.10).
export const providerRoutes = new Hono<AppEnv>().get('/', async (c) => {
  const configured = configuredProviders(c.env);
  return c.json<ProvidersResponse>({
    providers: providerSchema.options.map((id) => ({
      id,
      configured: configured.includes(id),
      defaults: PROVIDERS[id].defaults,
    })),
    models: await modelSettings(c.var.db, c.env),
  });
});

import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vite-plus/test';
import { PROVIDERS, resolveModel } from '../apps/api/src/agent/providers';
import { CASES } from './cases';
import { metered, runCase, startResult } from './harness';
import type { EvalMeta } from './report';

// The cases on a real model; `pnpm eval` sets the options (run.ts) and they cost tokens, so this
// file isn't a `*.test.ts`. Provider keys come from apps/api/.dev.vars.

type Options = {
  EVAL_PROVIDER: string;
  EVAL_MODEL?: string;
  EVAL_RUNS?: string;
  EVAL_ONLY?: string;
};

const options = env as unknown as Options;
const provider = options.EVAL_PROVIDER as keyof typeof PROVIDERS;
const entry = PROVIDERS[provider];
if (!entry) {
  throw new Error(`Unknown provider "${provider}": use ${Object.keys(PROVIDERS).join(', ')}.`);
}
if (!env[entry.secretName]) {
  throw new Error(`No ${entry.secretName}: add it to apps/api/.dev.vars.`);
}

const models = {
  provider,
  fast: options.EVAL_MODEL || entry.defaults.fast,
  planner: entry.defaults.planner,
};
const only = options.EVAL_ONLY ? new RegExp(options.EVAL_ONLY) : undefined;
const cases = CASES.filter((evalCase) => !only || only.test(evalCase.id));
const runs = Array.from({ length: Number(options.EVAL_RUNS) || 1 }, (_, index) => index + 1);

describe.each(runs)('run %i', (run) => {
  it.for(cases)('$id', async (evalCase, { task }) => {
    const result = startResult(evalCase, models, run);
    (task.meta as EvalMeta).evalResult = result;
    await runCase(evalCase, result, (_expected, _previous, meter) => (secrets, choice) => {
      const resolved = resolveModel(secrets, choice);
      return { ...resolved, model: metered(resolved.model, meter) };
    });
    expect(result.turns.flatMap((turn) => turn.problems)).toEqual([]);
  });
});

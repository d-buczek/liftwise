// `pnpm eval --provider <anthropic|openai|google> [--model <id>] [--runs <n>] [--only <regex>]`:
// the agent cases on a real model, with a compliance report in evals/reports/. Costs tokens, so it
// runs only by hand. The options reach the tests as bindings (vite.config.ts).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    provider: { type: 'string' },
    model: { type: 'string' },
    runs: { type: 'string' },
    only: { type: 'string' },
  },
});

if (!values.provider) {
  console.error(
    'Usage: pnpm eval --provider <anthropic|openai|google> [--model <id>] [--runs <n>] [--only <regex>]',
  );
  process.exit(2);
}

// The options go through the environment, so nothing the user typed passes through the shell.
const { status } = spawnSync(
  'vp',
  ['test', 'run', '--reporter=default', '--reporter=./reporter.ts', '--silent=passed-only'],
  {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      EVAL_PROVIDER: values.provider,
      EVAL_MODEL: values.model ?? '',
      EVAL_RUNS: values.runs ?? '',
      EVAL_ONLY: values.only ?? '',
    },
  },
);
process.exit(status ?? 1);

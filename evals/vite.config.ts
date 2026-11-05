import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig, lazyPlugins } from 'vite-plus';

// The API's Worker config, so a case runs like the app; a local apps/api/.dev.vars gives the keys.
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// `pnpm eval` sets the provider (run.ts). Otherwise, as in `ci:check`, only the replay and the
// scoring run: no key, no network, no cost.
const live = Boolean(process.env.EVAL_PROVIDER);

export default defineConfig({
  plugins: lazyPlugins(() => [
    cloudflareTest(async () => ({
      wrangler: { configPath: local('../apps/api/wrangler.toml') },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(local('../apps/api/migrations')),
          EVAL_PROVIDER: process.env.EVAL_PROVIDER ?? '',
          EVAL_MODEL: process.env.EVAL_MODEL ?? '',
          EVAL_RUNS: process.env.EVAL_RUNS ?? '',
          EVAL_ONLY: process.env.EVAL_ONLY ?? '',
        },
      },
    })),
  ]),
  test: {
    include: live ? ['live.eval.ts'] : ['*.test.ts'],
    setupFiles: ['../apps/api/test/setup.ts'],
    // A turn on the `planner` model takes tens of seconds.
    testTimeout: live ? 180_000 : 20_000,
  },
});

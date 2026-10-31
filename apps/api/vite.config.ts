import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig, lazyPlugins } from 'vite-plus';

// `vp test` runs from the repo root, so paths are resolved against this file.
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Tests run inside workerd with a local D1; migrations are applied in test/setup.ts.
export default defineConfig({
  plugins: lazyPlugins(() => [
    cloudflareTest(async () => ({
      wrangler: { configPath: local('./wrangler.toml') },
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations(local('./migrations')) },
      },
    })),
  ]),
  test: {
    setupFiles: ['./test/setup.ts'],
  },
});

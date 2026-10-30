import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
    printWidth: 100,
    // docs/ is hand-written prose; formatting would re-pad whole tables on every edit
    ignorePatterns: ['docs/**', '.tickets/**', '.claude/settings.local.json', 'pnpm-lock.yaml'],
  },
  lint: {
    ignorePatterns: ['**/dist/**', '**/.wrangler/**', '**/android/**', '.tickets/**'],
    plugins: ['eslint', 'typescript', 'unicorn', 'oxc', 'vue', 'vitest'],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});

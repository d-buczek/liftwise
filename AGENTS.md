# LiftWise — notes for coding agents

- **Spec:** `docs/SPEC.md` is the source of truth. If a decision changes, update its decision log (§3) and affected sections in the same commit.
- **Work units:** tickets LW-xx from SPEC §8, one per `/ticket` session.
- **Stack:** pnpm monorepo. `packages/core` (pure TS domain logic + zod schemas + seed catalog), `apps/api` (Hono on Cloudflare Workers + D1/Drizzle, agent via Vercel AI SDK), `apps/web` (Vue 3 + Vite + Ionic Vue + Pinia + Dexie, PWA + Capacitor Android).

## Conventions

- Code, comments, docs and commits in English. UI strings in Polish via vue-i18n — no hardcoded UI text.
- Weights are kg **per dumbbell**; IDs are UUIDv7 generated on the client.
- Domain logic (plates, progression, balance, records) lives only in `packages/core`, as pure functions with tests.
- Every data write goes through the server mutation path so it lands in `change_log` and can be undone.
- Agent tools live in the tool registry with a risk level (`read` / `write` / `risky`); `risky` tools return a proposal and run only after confirmation.

## Never

- Commit secrets (`.dev.vars`, keystores, tokens) or personal training data — the repo becomes public.
- Hardcode model ids in code paths; they are settings with defaults.

## Commands

Node 24 (`.node-version`), pnpm 10 (`packageManager`). Toolchain is Vite+ (`vite-plus`, project-local `vp`; config in the root `vite.config.ts`). Run from the repo root:

- `pnpm install` — install all workspaces.
- `pnpm ci:check` — `vp check` (Oxfmt, Oxlint, TypeScript 7 type check of `.ts`), `vue-tsc` for `.vue` in `apps/web`, `vp test`. Run before every commit.
- `pnpm ci:build` — build all apps (`apps/web` → `vp build`, `apps/api` → `wrangler deploy --dry-run`).
- `pnpm format` — `vp check --fix` (format + lint autofix; `docs/` is excluded on purpose).
- `pnpm exec vp check` / `pnpm exec vp test` — the parts of `ci:check` separately; `pnpm exec vp test --project @liftwise/core` for one workspace.
- `pnpm --filter @liftwise/web dev` / `pnpm --filter @liftwise/api dev` — local dev servers (API on a local D1, no Cloudflare account needed).
- `pnpm --filter @liftwise/api db:generate` — SQL migration from `apps/api/src/db/schema.ts` (drizzle-kit); never edit generated migrations by hand.
- `pnpm --filter @liftwise/api db:seed` — after changing `packages/core/data/exercises.json`: writes a new seed-catalog migration (existing rows are kept).
- `pnpm --filter @liftwise/api db:migrate:local` / `db:migrate:remote` — apply migrations with wrangler.
- `pnpm --filter @liftwise/api device:create <name> [--remote]` — create a device and print its token once.

Tests import from `vite-plus/test`, not `vitest`. API tests run in workerd (`@cloudflare/vitest-plugin`, config in `apps/api/vite.config.ts`) on a local D1 that is reset and migrated before each test; bindings come from `cloudflare:test`. `apps/web` keeps TypeScript 6 because vue-tsc needs the TypeScript JS API, which TypeScript 7 does not ship.

CI (`.github/workflows/ci.yml`) only calls `ci:check`, `ci:build` and gitleaks; put logic in pnpm scripts, not in the yaml.

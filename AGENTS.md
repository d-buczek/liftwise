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

To be filled in by LW-01.

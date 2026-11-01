# Deployment (Cloudflare)

One Worker, `liftwise`, serves the API and the PWA from the same origin (SPEC §6.1, D12, D51):
`https://liftwise.<account-subdomain>.workers.dev`. Data lives in the D1 database `liftwise`
(region WEUR). Commands run from the repo root unless noted.

## What runs where

- **Worker** `liftwise` (`apps/api/wrangler.toml`): API routes first (`/api/*`, `/health`), every
  other path gets the PWA from `apps/web/dist`. Workers Logs are on (`[observability]`).
- **D1** `liftwise`: its `database_id` is in `wrangler.toml`. The id is not a secret: without access
  to the account it opens nothing.
- **Worker secrets**: provider API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
  `GOOGLE_GENERATIVE_AI_API_KEY`); a provider without its key shows ✗ in Settings → Modele.
- **Cost**: Workers Free and prepaid API credits without auto-reload. When either runs out, requests
  fail and nothing is billed; a provider billed per use (OpenAI) is the exception.

## First deployment (one time)

1. Cloudflare account on the Free plan (https://dash.cloudflare.com/sign-up, no card).
2. `pnpm --filter @liftwise/api exec wrangler login` (browser → Allow).
3. `pnpm --filter @liftwise/api exec wrangler d1 create liftwise --location weur`, then put the printed
   `database_id` into the `[[d1_databases]]` block of `apps/api/wrangler.toml`.
4. `pnpm deploy:api`: builds the PWA, applies the D1 migrations remotely (incl. the seed catalog)
   and deploys the Worker. The first deploy registers the account's `workers.dev` subdomain; a new
   subdomain can take a few minutes to resolve.
5. A provider key, in your own terminal (the key must not land in a chat or a log). Copy the key,
   then in PowerShell:

   ```powershell
   cd apps/api
   Get-Clipboard | pnpm exec wrangler secret put ANTHROPIC_API_KEY
   ```

   The name is the variable name, never the key: `wrangler secret list` prints names in plain text.
   A key that leaked anywhere is deleted in the provider's console and replaced. Secrets take effect
   without a redeploy.
6. The first device: `pnpm --filter @liftwise/api device:create <name> --remote` prints its token
   once. Open the app URL, expand "To pierwsze urządzenie" on the pairing screen and paste the token.
   Every next device pairs with a QR code from Settings → Urządzenia.
7. Android: set `VITE_API_URL=https://liftwise.<account-subdomain>.workers.dev` in
   `apps/web/.env.android.local`, then `pnpm android:install` (`docs/android.md`).

## Updates

- `pnpm deploy:api` after a commit: migrations first (they are additive), then the Worker.
- A bad Worker version: `pnpm --filter @liftwise/api exec wrangler rollback`. Data: D1 Time Travel
  (SPEC §5.12).
- Local dev keeps its own D1 under `apps/api/.wrangler/`, keyed by `database_id`. A fresh one needs
  `pnpm --filter @liftwise/api db:migrate:local` and `device:create <name>` (without `--remote`).

## Logs and limits

- Live: `pnpm --filter @liftwise/api exec wrangler tail liftwise --format json`. Each invocation has
  `cpuTime`, `wallTime`, `outcome` and the console output; a provider failure is logged as
  `AI_APICallError` with the provider's message (e.g. "credit balance is too low").
- Dashboard: Workers & Pages → `liftwise` → Observability (Workers Logs; 3 days on Free).
- Workers Free allows 10 ms CPU per request with some tolerance for overruns; a Worker that keeps
  exceeding it gets error 1102 (`outcome: exceededCpu`). An agent turn uses far more (SPEC §9, LW-15),
  so watch the chat for 1102 errors.

## Where to log in

| Service | Address | What for |
|---|---|---|
| Cloudflare dashboard | https://dash.cloudflare.com | Workers & Pages → `liftwise`: logs, metrics, versions, secret names; Storage & Databases → D1 → `liftwise`: console, Time Travel; plan usage; the `workers.dev` subdomain |
| wrangler (CLI) | `wrangler login` / `whoami` / `logout` | The OAuth login used by deploys, secrets and remote D1 commands |
| Claude Console | https://platform.claude.com | API keys (Settings → API keys), credits (Settings → Billing), cost |
| Google AI Studio | https://aistudio.google.com/apikey | `GOOGLE_GENERATIVE_AI_API_KEY`. The free tier may use the content to improve Google's products |
| OpenAI Platform | https://platform.openai.com/api-keys | `OPENAI_API_KEY` (billed per use) |
| GitHub | https://github.com | Repository and CI; deploys from CI later need a Cloudflare API token as a repository secret |

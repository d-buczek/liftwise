# LiftWise — Product & Technical Specification

Status: **v1 spec**, agreed in a design interview on 2026-10-30.
This file is the source of truth. When a decision changes, update the decision log (§3) and the affected sections in the same commit.

---

## 1. Summary

LiftWise is a personal, **agent-first** strength-training log for Android and Windows, a richer successor to FitNotes for a single user.
Instead of form-filling, an AI agent with tools over the app's data logs workouts from a sentence or voice, edits data on request, answers questions about history, and proposes today's workout from time available, wellbeing, recent sessions and progression.
A fast, keyboard-free workout screen covers the common case (repeat a set, ±1 rep) and works offline.

## 2. Context and constraints

- **One user**, training at home.
- **Equipment:** adjustable dumbbells + bench to start with. Equipment is a configurable profile and must be easy to extend (pull-up bar, bands, …) without code changes.
- **Training style it serves:** flexible, no rigid program; progress in weight, reps or sets.
- **No manual typing of data** during workouts (taps and voice are fine).
- **Devices:** Android phone (primary during workouts), Windows PC (history, analysis, chat).
- **Distribution:** own use only, sideloaded APK (not Play Store). Must not be blocked by Android developer verification (global from 2027), see §6.10.
- **LLM budget:** small and prepaid, without auto-reload: an empty balance stops the API without a charge. The architecture must not depend on Anthropic.
- **Public portfolio:** the repo will be public on GitHub. No secrets and no personal training data in the repo.

## 3. Decision log

| # | Topic | Decision | Rationale |
|---|---|---|---|
| D1 | Logging mode | **Hybrid**: keyboard-free workout screen (repeat set, ±rep, ±weight, RIR chips) + agent for everything expressible as a sentence | Agent round-trip is 2–5 s and costs money; most sets repeat the previous one; screen works offline |
| D2 | Earlier history | **One-time import of the recent sessions (LW-16), through the sync push; no import feature in the app** | The recent sessions feed the hints and records; older data isn't needed |
| D3 | Equipment | Plate-loaded dumbbells + bench; **extensible equipment profile** in settings | Plate calculator and exercise availability depend on it |
| D4 | Effort tracking | **Optional RIR** (0–4+) per set | Key signal for progression; never mandatory |
| D5 | v1 extras | **Rest timer** and **charts & records**; body measurements and supersets go to backlog | Keep v1 focused |
| D6 | Balance guard | **Muscle groups (primary/secondary) + movement patterns**; UI shows muscle groups, patterns are an extra tag mainly for the agent | Superset of plain muscle groups, fits flexible FBW |
| D7 | Workout proposal | **Check-in → plan → prefilled workout screen** | Uses time/wellbeing; plan is a suggestion, deviations allowed |
| D8 | Progression | **Deterministic engine + agent adjustments** (double progression with RIR) | Offline, testable baseline; agent adapts to check-in |
| D9 | Confirmations | **Only risky changes** need confirmation; every change is logged and undoable | Low friction for logging, safety for destructive ops |
| D10 | Voice | **System speech-to-text** (Android SpeechRecognizer, Web Speech API on PC) | Free, fast, Polish, no extra key |
| D11 | Architecture | **Small cloud backend is the source of truth**; agent runs server-side; clients keep a local mirror for offline | Easy sync, API keys never on devices, natural home for MCP |
| D12 | Hosting | **Cloudflare Workers + D1**, server written with Hono (portable to Node) | Zero admin, free tier to start, good remote-MCP support |
| D13 | Client | **Vue 3 + Vite**, Android via **Capacitor** (APK via ADB), PC via **PWA**; pnpm monorepo with shared TS core | One codebase; domain logic shared by client and server |
| D14 | UI kit | **Ionic Vue** | Built for Capacitor: Android back button, safe areas, gestures, haptics |
| D15 | Model layer | **Vercel AI SDK** wrapped in our own provider/model registry | Unified tool calling + streaming across providers, runs on Workers |
| D16 | Providers in v1 | **Anthropic, OpenAI, Google Gemini** | Anthropic default; others prove the abstraction |
| D17 | Model selection | **Model per role**: `fast` (chat: logging, edits, history Q&A) and `planner` (workout proposal, analyses) | Cost/latency vs reasoning |
| D18 | API keys | **Cloudflare Worker secrets**; UI shows only configured ✓/✗ | Keys never in DB, repo or devices |
| D19 | Auth | **Per-device tokens**: first via CLI, next via QR pairing; hashes in D1; individually revocable | Single user, simple, revocable |
| D20 | Offline agent input | **Prompt queue**: offline text/voice is queued with its timestamp and processed when back online | Logging intent is never lost |
| D21 | Agent memory | **Athlete profile + per-day threads** | Profile is explicit and editable; old chats don't bloat context |
| D22 | Exercise catalog | **Seed dumbbell catalog** (~40–60 exercises, PL names, aliases) in repo as JSON; agent can add (with confirmation) | Good matching from day one |
| D23 | MCP | **Phase 2**; v1 already has a shared tool registry with risk levels | MVP first; MCP is a second transport for the same tools |
| D24 | Languages | **UI Polish** (vue-i18n, EN addable); code, docs, spec, commits **English** | Portfolio readability |
| D25 | Repo & CI | **GitHub only**; thin GitHub Actions calling pnpm scripts | Logic portable, CI yaml trivial |
| D26 | Repo bootstrap | Local `git init` now; GitHub remote (private until publication) added later | Publishing is a separate, later step |

## 4. Scope

### 4.1 v1

- Active workout screen with hybrid logging (§5.2) and rest timer (§5.3).
- History, charts and records (§5.4).
- Exercise catalog with seed data (§5.5).
- Equipment profile and plate calculator (§5.6).
- Progression engine (§5.7) and balance guard (§5.8).
- Agent: logging, edits, history Q&A, workout proposal, clarification, confirmations, change log with undo, athlete profile, per-day threads, voice input, offline prompt queue (§5.9).
- Settings: model per role, provider status, devices, equipment, catalog, balance targets (§5.10).
- Android APK (Capacitor) + PC PWA, synced through the backend.

### 4.2 Backlog (not v1)

- MCP server (phase 2, §6.11): token auth first, then OAuth for claude.ai connectors.
- Body weight and body measurements.
- Supersets / circuits.
- Local models (Ollama on PC via Cloudflare Tunnel).
- Speech-to-text via API as an option.
- English UI.
- LLM usage/cost log in settings.
- Native desktop shell (Tauri) if the PWA ever falls short.

### 4.3 Non-goals

- Multi-user, social features, Play Store distribution.
- Rigid periodized programs.
- FitNotes import.
- Imperial units (kg only).

## 5. Functional specification

### 5.1 Domain conventions

- Weights are in **kg, per dumbbell**. "Wyciskanie 24 kg 4x10" = each dumbbell 24 kg, 4 sets × 10 reps.
- Each exercise declares `implements` (1 or 2 dumbbells) and `unilateral` (reps counted per side). Volume = weight × reps × implements.
- Weight precision 0.25 kg. Reps are integers. RIR is optional: 0, 1, 2, 3, 4 (= "4+").
- Sets can be marked **warm-up**; warm-ups are excluded from progression, records and balance.
- Time zone: device local; the client sends local date/time with agent requests.
- IDs are UUIDv7 generated on the client (offline-safe, time-ordered).

### 5.2 Active workout (hybrid logging)

- Start: empty session, from an accepted plan (§5.9.6), or implicitly when the first set is logged.
- Current exercise card shows the target (plan or progression engine) and the last session's sets.
- Big controls, no keyboard:
  - **"Jak poprzednio"**: log a set identical to the previous one (or to the target for the first set).
  - Reps −/+, weight −/+ (steps = per-dumbbell weights achievable with the current plates, §5.6).
  - RIR chips (optional), warm-up toggle.
  - Next/previous exercise, pick exercise (search + recent).
  - Mic button and chat drawer for the agent.
- Swipe a set to edit or delete. A manual delete is immediate with an undo snackbar.
- Screen stays awake during an active workout (Android).
- A new record shows a short toast.

### 5.3 Rest timer

- Starts automatically after a set is logged; default duration per exercise (catalog default, user-editable), global fallback in settings.
- In-app countdown with +15 s / −15 s / skip.
- Android: local notification + vibration at the end, also with the screen locked (scheduled notification). PC: in-app only.
- Logging the next set cancels the pending notification.

### 5.4 History, charts and records

- History: list of sessions by date, session detail, per-exercise history.
- Records per exercise (working sets only):
  - **Rep record per weight**: most reps at ≥ a given weight (FitNotes-style).
  - **Estimated 1RM** (Epley: `w × (1 + reps/30)`, per dumbbell), best ever and trend.
- Charts: per exercise (top-set weight, e1RM, session volume over time), per muscle group (weekly sets).

### 5.5 Exercise catalog

- Fields: `id`, `name_pl`, `aliases[]` (PL and EN variants, common voice mis-transcriptions), `primary_muscles[]`, `secondary_muscles[]`, `patterns[]`, `requires[]` (equipment types), `implements`, `unilateral`, `rep_range` (min/max), `rest_seconds`, `archived`.
- Seed: `packages/core/data/exercises.json`, ~40–60 dumbbell + bench exercises, validated by a zod schema in tests.
- Muscle groups (keys → PL labels in i18n): `chest`, `lats`, `upper_back`, `front_delts`, `side_delts`, `rear_delts`, `biceps`, `triceps`, `forearms`, `quads`, `hamstrings`, `glutes`, `calves`, `abs`, `lower_back`.
- Movement patterns: `horizontal_push`, `vertical_push`, `horizontal_pull`, `vertical_pull`, `squat`, `hinge`, `lunge`, `core`, `isolation`.
- User can add, edit and archive exercises. The agent can propose new ones (risky tool, confirmation).

### 5.6 Equipment profile and plate calculator

- Equipment items (extensible by `type`):
  - `dumbbell_handle`: handle weight, count, collar weight.
  - `plate`: weight and count (e.g. 1.25 × 4, 2.5 × 4, 5 × 4).
  - `bench`: flat / adjustable incline / decline.
  - Later types: `pullup_bar`, `band`, `kettlebell`, `barbell`, … (new type = schema + catalog `requires` value, no UI rewrite: generic item editor).
- Plate calculator (pure function in core):
  - Input: target per-dumbbell weight, number of dumbbells loaded at once (1 or 2).
  - Plates must be symmetric per side, and **the plate inventory is shared between both dumbbells** (two dumbbells = four sides).
  - Output: plates per side; if not exact, nearest lower and higher achievable weights.
  - Also returns the sorted list of all achievable per-dumbbell weights (used for weight ± steps and for progression increments).

### 5.7 Progression engine

Pure, deterministic function in core. Gives the next target per exercise and runs offline.

- Input: exercise config (rep range, target RIR, default 1–2), achievable weights (§5.6), recent working sets.
- Rules (v1, double progression):
  1. If every working set of the last session reached `rep_max` and RIR was ≥ 1 or not recorded → **increase weight** to the next achievable per-dumbbell weight; target reps = `rep_min`.
  2. Otherwise → **same weight**; target reps = last reps + 1 per set, capped at `rep_max`.
  3. Reps at the same weight dropped in 2 consecutive sessions → flag `stall` (agent may suggest a deload of about 10% or an exercise swap).
  4. Last session older than 14 days → hold weight (`reentry`).
- Output: `{ weight, sets, reps[], targetRir, reason }`, where `reason` is a code the UI/agent can explain.
- The agent uses this as a baseline and may deviate based on check-in, stating why.

### 5.8 Balance guard

- Per muscle group:
  - Days since last direct work (primary muscle).
  - Rolling 7-day **hard sets** (working sets; primary = 1.0, secondary = 0.5) vs a target range (default 10–20, editable per group).
  - Status: under / in range / over.
- Per movement pattern: days since last.
- Shown as a compact dashboard; the snapshot is also an agent tool (§6.6).
- With dumbbells and a bench, `vertical_pull` has few options, so the guard shows that gap rather than hiding it.

### 5.9 Agent

#### 5.9.1 Capabilities

- Log sets from text or voice ("wyciskanie 24 kg 4x10, ostatnia na zero").
- Edit data ("zmień ostatnią serię na 22 kg").
- Answer history questions from tools ("kiedy ostatnio robiłem wiosłowanie i z jakim ciężarem?").
- Propose today's workout (§5.9.6).
- Manage the athlete profile and catalog (with confirmation).

#### 5.9.2 Behavior rules (system prompt contract)

- Replies in the user's language (Polish by default), short.
- Applies the conventions from §5.1.
- **Asks instead of guessing** before any write when:
  - the exercise match is ambiguous (more than one plausible candidate) or unknown;
  - the weight is not achievable with the current plates (offers nearest achievable);
  - sets or reps are missing;
  - the target set or session is unclear ("ostatnia seria" while two exercises are in progress).
- All data access goes through tools; never invents history.
- After each write, a one-line summary appears in the chat as a change card with **Cofnij**.

#### 5.9.3 Confirmation policy

| Risk | Examples | Behavior |
|---|---|---|
| `read` | history, records, balance, targets, plate calc | Runs immediately |
| `write` | log sets, edit a single set, start/finish workout, save accepted plan, undo | Runs immediately; change card with undo |
| `risky` | delete anything, change more than one record, create/edit exercise, update profile, update settings | Returns a **proposal** (diff card); executes only after the user taps **Zatwierdź** |

#### 5.9.4 Change log and undo

- Every server-applied mutation (user or agent) writes `change_log` rows with before/after snapshots, grouped by `change_group_id` (one group per tool call or user action).
- **Undo** applies the inverse of a group as a new group (`undo_of`), so undo is itself synced and reversible.
- If an affected record changed after the group, undo shows the conflict and requires confirmation.

#### 5.9.5 Threads and athlete profile

- Conversations are stored as **threads**, by default one per day; a workout's check-in conversation is linked to that workout.
- Only the current thread's messages go into the model context. Older threads are browsable but not sent.
- **Athlete profile**: editable document (goals, limitations/injuries, preferences, typical session length) sent with every request. The agent proposes edits via a risky tool.

#### 5.9.6 Workout proposal flow

1. User taps **"Trening na dziś"** (or asks the agent).
2. Check-in sheet: time available (chips 20/30/45/60+ min), wellbeing 1–5, pain/limitations (body-part chips + optional voice).
3. The server builds context: engine targets, balance snapshot, last 2–3 weeks of sessions, profile, equipment.
4. The `planner` model returns a structured plan: exercises, sets × target reps × per-dumbbell weight, target RIR, short rationale.
5. Plan card: accept / change by chat / regenerate.
6. Accepting saves the plan and prefills the active workout. Items are marked done/skipped; deviations are fine.

#### 5.9.7 Voice input

- Android: system SpeechRecognizer through a Capacitor plugin (pl-PL; works offline if the language pack is installed).
- PC: Web Speech API (Edge/Chrome); typing is always available.
- The transcript is sent like typed text; the agent resolves mis-transcriptions using catalog aliases or asks.

#### 5.9.8 Offline prompt queue

- Without connectivity, typed or spoken prompts go to a local **"Do przetworzenia"** queue with the time they were said.
- When back online, the queue is processed in order; each request carries its original timestamp so sets get the right time.
- Each result appears as a change card (undo) or a question.

### 5.10 Settings

- **Models:** provider + model id for roles `fast` and `planner`. Only providers whose key secret is configured are selectable.
- **Providers:** status ✓/✗ per provider (no key values ever shown).
- **Devices:** list (name, created, last seen), pair new device (QR), revoke.
- **Equipment:** generic item editor (§5.6).
- **Catalog:** edit, archive, add exercises.
- **Balance:** target ranges per muscle group.
- **Training:** default rest, default target RIR.
- **Profile:** athlete profile editor.

## 6. Architecture

### 6.1 Overview

```
 Android (Capacitor APK)           Windows (PWA in Edge/Chrome)
 Vue + Ionic, Dexie mirror          Vue + Ionic, Dexie mirror
 native: notifications, STT,        Web Speech API
 haptics, keep-awake, Keystore
          \                              /
           \  HTTPS, Bearer device token /
            v                            v
        Cloudflare Worker (Hono) — also serves the PWA static assets
        ├─ /api/auth     device tokens, QR pairing
        ├─ /api/sync     push (mutations) / pull (changes since seq)
        ├─ /api/agent    streaming chat, queue processing, confirm
        ├─ /api/changes  undo
        ├─ tool registry (read / write / risky)  ← shared by agent and MCP
        ├─ agent runtime: Vercel AI SDK → Anthropic | OpenAI | Gemini
        └─ /mcp (phase 2)
                 |
                 v
           Cloudflare D1 (SQLite) — source of truth
```

### 6.2 Monorepo layout (pnpm workspaces)

```
liftwise/
├─ apps/
│  ├─ web/            Vue 3 + Vite + Ionic Vue + Pinia + vue-i18n + Dexie + PWA; Capacitor android/ project
│  └─ api/            Hono on Cloudflare Workers, Drizzle + D1, agent runtime, tool registry, auth, sync
├─ packages/
│  └─ core/           zod schemas & types, conventions, plate calc, e1RM/records, progression engine,
│                     balance, sync protocol types; data/exercises.json (seed catalog)
├─ evals/             agent evaluation cases (Polish utterances → expected tool calls)
└─ docs/SPEC.md
```

Rule: domain logic lives in `packages/core` as pure functions with tests. Apps call it and never reimplement it.

### 6.3 Data model (D1, mirrored in Dexie)

All synced tables have: `id` (UUIDv7, text), `created_at`, `updated_at`, `deleted_at` (tombstone), `seq` (server sequence for sync).

| Table | Key fields |
|---|---|
| `exercises` | catalog fields from §5.5 |
| `equipment_items` | `type`, `props` (JSON validated per type) |
| `workouts` | `started_at`, `ended_at`, `plan_id?`, `checkin` (JSON: time, wellbeing, pain), `note` |
| `sets` | `workout_id`, `exercise_id`, `position`, `weight_kg`, `reps`, `rir?`, `warmup`, `note`, `performed_at`, `source` (manual/agent/plan) |
| `plans` | `date`, `items` (JSON: exercise, sets, target reps, weight, RIR, status), `rationale`, `status` |
| `athlete_profile` | single row, markdown/JSON document |
| `settings` | key/value (JSON) |
| `threads` / `messages` | per-day threads, linked `workout_id?`, message parts (incl. tool calls/results) |

Server-only tables: `change_log` (`change_group_id`, `actor` user/agent/system, `thread_id?`, `entity`, `entity_id`, `op`, `before`, `after`, `undo_of?`), `applied_mutations` (idempotency), `devices` (`name`, `token_hash`, `last_seen_at`, `revoked_at`), `pairing_codes` (`code_hash`, `expires_at`, `used_at`), `sync_counter`, `pending_proposals` (risky tool proposals awaiting confirmation).

Client-only (Dexie): `outbox` (pending mutations), `prompt_queue`, `sync_state` (last pulled `seq`).

### 6.4 Sync

- The server is authoritative. Clients apply changes optimistically to Dexie and enqueue mutations in `outbox`.
- **Push** `POST /api/sync/push` takes `{ mutations: [{ mutationId, entity, op: upsert|delete, row }] }`. The server validates with core zod schemas, applies in order, writes `change_log`, assigns `seq` from `sync_counter` in the same D1 batch, and records `mutationId` for idempotency.
- **Pull** `GET /api/sync/pull?since=<seq>` returns rows (incl. tombstones) with `seq > since`, paged.
- Conflicts are resolved **last-write-wins** in server-apply order (single user, two devices; per-field merge not needed).
- Agent writes happen server-side and reach clients via pull. The client pulls after push, after each agent turn, on app resume, and periodically while in the foreground.

### 6.5 API surface (v1)

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/pairing` | Authorized device creates a one-time pairing code (TTL 5 min) |
| `POST /api/auth/pairing/redeem` | New device exchanges code + name for its token (rate-limited) |
| `GET /api/devices`, `DELETE /api/devices/:id` | List / revoke devices |
| `POST /api/sync/push`, `GET /api/sync/pull` | Sync (§6.4) |
| `POST /api/agent/chat` | Streaming agent turn `{ threadId, message, role?, localTime }` |
| `POST /api/agent/proposals/:id/confirm` / `reject` | Risky tool confirmation |
| `POST /api/changes/:groupId/undo` | Undo a change group |
| `GET /api/providers` | Provider status (configured ✓/✗) and model settings |

### 6.6 Agent runtime and tool registry

- The agent runs in the Worker using the AI SDK (`streamText` with tools and a step limit), streamed to the client (`@ai-sdk/vue` on the client).
- Context per request:
  - System prompt (rules §5.9.2, conventions, local date/time).
  - Athlete profile, equipment summary, compact catalog (names + aliases + ids), balance snapshot.
  - Current thread.
  - Details are fetched via tools.
  - For Anthropic, the stable prefix (system prompt + catalog) is marked for prompt caching.
- **Tool registry** (`apps/api/src/tools`): each tool is `{ name, description, input: zod schema, risk: read|write|risky, handler }`. The same registry backs the in-app agent and the MCP server (phase 2).
- Risky tools don't execute. They store a `pending_proposal` and return a diff for the confirmation card. Confirmation executes the stored proposal as one change group.
- v1 tools:
  - **read:** `find_exercise`, `get_exercise_history`, `get_workouts`, `get_active_workout`, `get_records`, `get_balance`, `get_progression_targets`, `get_profile`, `get_equipment`, `calc_plates`
  - **write:** `log_sets`, `update_set` (single set), `start_workout`, `finish_workout`, `save_plan`, `undo_change`
  - **risky:** `delete_sets`, `update_sets` (more than one), `create_exercise`, `update_exercise`, `update_profile`, `update_settings`
  - Internal to the proposal flow: structured `propose_plan` output from the `planner` role.

### 6.7 Model provider layer

- Built on the Vercel AI SDK provider packages (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`).
- Our own **registry** maps `provider → { secretName, createModel(modelId) }`. A provider is available iff its secret exists.
- Model ids are **settings**, not code, because they change faster than the app. Defaults for Anthropic:
  - `fast`: `claude-haiku-5-5`
  - `planner`: `claude-sonnet-5-5`
  - OpenAI and Gemini defaults are picked from provider docs at implementation time.
- Adding a provider (e.g. an OpenAI-compatible endpoint for Ollama) = registry entry + secret + eval run.

### 6.8 Security

- **API keys:** Worker secrets only (`wrangler secret put ANTHROPIC_API_KEY | OPENAI_API_KEY | GOOGLE_GENERATIVE_AI_API_KEY`). Local dev uses `.dev.vars` (gitignored). Keys are never stored in D1, never sent to clients, never logged.
- **Device tokens:** 32 random bytes (base64url), shown once. Only the SHA-256 hash is stored. Sent as `Authorization: Bearer`.
  - First token: `pnpm --filter api device:create <name>` (writes the hash via wrangler, prints the token once).
  - Next devices: QR pairing; codes are single-use, TTL 5 min, rate-limited.
  - Revocation in settings.
- **Token storage:**
  - Android: Keystore-backed secure storage plugin.
  - PC PWA: IndexedDB. Accepted risk: anyone with access to the Windows user profile can read it; mitigated by revocation.
- **CORS:** same origin for the PWA (served by the Worker) plus `https://localhost` (Capacitor Android WebView origin).
- **Data sent to LLM providers:** training data and the athlete profile go to the selected provider. Documented, acceptable for personal use.
- **Repo hygiene:**
  - No personal data or secrets.
  - Secret scanning in CI (gitleaks).
  - Release keystore outside the repo.

### 6.9 Offline matrix

| Feature | Offline | Notes |
|---|---|---|
| Active workout logging, rest timer | ✅ | Outbox syncs later |
| History, charts, records | ✅ | From local mirror |
| Plate calculator, progression targets, balance guard | ✅ | Pure core functions |
| Catalog / equipment / settings edits | ✅ | Synced later |
| Voice → text | ✅ Android with offline language pack; PC needs network | |
| Agent (logging, Q&A, edits) | ⏳ | Queued (§5.9.8) |
| Workout proposal (planner) | ❌ | Engine targets still shown on the workout screen |
| Device pairing, undo of agent changes | ❌ | Server-side operations |

### 6.10 Platforms and distribution

- **Android:** Capacitor app built from `apps/web`. App id TBD (reverse-DNS, e.g. `io.github.<user>.liftwise`).
  - Native plugins:
    - local notifications (rest timer)
    - haptics
    - keep-awake
    - speech recognition (community plugin)
    - Keystore-backed secure storage
- **Install via ADB over Wi-Fi** (Wireless debugging, Android 11+):
  - One-time setup: `adb pair <ip:port> <code>`.
  - Each install/update: `adb connect <ip:port>` + `adb install -r app-release.apk`, wrapped as `pnpm android:install`.
  - Google's developer-verification FAQ states that ADB installs don't require verification and are not subject to the advanced flow's 24-hour wait.
  - Fallbacks: a free **limited distribution** developer account (up to 20 devices, no ID) or the one-time **advanced flow**.
- **Signing:**
  - Own release keystore kept outside the repo and backed up (password manager).
  - Losing it means uninstall/reinstall, which wipes only the local mirror; server data is safe.
  - CI signing via GitHub secrets later.
- **PC:** PWA served by the same Worker (static assets), installed from Edge/Chrome.
- **Dev:**
  - `wrangler dev` with local D1.
  - Vite dev server with `/api` proxy.
  - Capacitor live reload on the phone.
- **Toolchain to install:**
  - Android Studio (bundles JDK, Android SDK, platform-tools/adb).
  - Cloudflare account (wrangler is a devDependency).
  - Later: GitHub CLI.

### 6.11 MCP server (phase 2)

- Endpoint `/mcp` on the same Worker (Streamable HTTP), exposing the tool registry (§6.6).
- Risky tools keep the proposal/confirm semantics: the MCP client gets the diff and must call a confirm tool.
- Step 1: device-token auth (works for Claude Code and other clients that send a header).
- Step 2: OAuth (required by claude.ai custom connectors), e.g. Cloudflare's Workers OAuth provider library.

## 7. Quality

- **Unit tests (Vitest):** core (plate calc incl. shared inventory, progression rules, balance math, e1RM/records, catalog schema), sync apply/idempotency, undo.
- **API integration tests:** Workers Vitest pool with local D1.
- **Agent evals** (`evals/`): Polish utterances → expected tool calls/args. Covers logging variants, ambiguity → question, unachievable weight → question, risky → proposal. Run manually per provider (`pnpm eval --provider anthropic`). Costs tokens, so not in CI.
- **CI (GitHub Actions)** is thin; each job runs one pnpm script:
  - `pnpm ci:check` (lint, typecheck, test)
  - `pnpm ci:build`
  - `pnpm deploy:api` on `main` (Cloudflare API token secret)
  - gitleaks
  - APK artifact build later

## 8. Milestones and ticket breakdown

Each line is meant to be one `/ticket` task.

| Ticket | Scope |
|---|---|
| LW-01 | Monorepo scaffold: pnpm workspaces, strict TS, ESLint + Prettier, Vitest, thin GitHub Actions CI, gitleaks |
| LW-02 | Core schemas (zod) + conventions + seed catalog JSON (40–60 exercises, PL names, aliases, tags) with validation tests |
| LW-03 | Core calculators: plate calc, e1RM/records, balance, progression engine, with tests |
| LW-04 | API skeleton: Hono on Workers, D1 + Drizzle schema & migrations, device auth (CLI bootstrap, QR pairing), CORS |
| LW-05 | Sync: push/pull, `seq`, idempotency, `change_log`, undo, with tests |
| LW-06 | Web shell: Vue + Ionic + Pinia + vue-i18n (pl) + Dexie mirror/outbox + PWA; pairing screen; settings (equipment, devices) |
| LW-07 | Active workout screen, history, in-app rest timer |
| LW-08 | Capacitor Android: build, native plugins, `pnpm android:install` (ADB), signing doc |
| LW-09 | Agent core: provider registry (Anthropic/OpenAI/Gemini), roles, tool registry with risk levels, streaming chat, threads, profile; chat UI with change/confirmation cards |
| LW-10 | Voice input (Android STT, Web Speech on PC) + offline prompt queue |
| LW-11 | Workout proposal flow: check-in → plan → prefilled workout |
| LW-12 | Charts & records UI, balance guard dashboard |
| LW-13 | Agent eval suite |
| LW-20 | Phase 2: MCP endpoint with token auth |
| LW-21 | Phase 2: OAuth for claude.ai connectors |

## 9. Open items to verify during implementation

| Item | Resolve in | Note |
|---|---|---|
| Workers Free limits under agent loops | LW-09 | 10 ms CPU per request; 50 subrequests per invocation, D1 calls count. Measure; switch to Workers Paid ($5/mo) if exceeded |
| AI SDK current major | LW-09 | Check tool-approval support and `@ai-sdk/vue` API; use built-in approval if it fits §5.9.3 |
| Exact rest-timer notifications | LW-08 | Android 12+ exact-alarm permissions and Doze may delay scheduled notifications |
| Speech-recognition plugin | LW-10 | Compatibility with current Capacitor/Android |
| Default OpenAI/Gemini model ids | LW-09 | From provider docs |
| Capacitor app id | LW-08 | |

## 10. References

- Android developer verification FAQ (ADB exemption, limited distribution, advanced flow): https://developer.android.com/developer-verification/guides/faq
- Android developer verification timeline: https://developer.android.com/developer-verification
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/

# LiftWise — Product & Technical Specification

Status: **v1 spec**, agreed in a design interview on 2026-10-30.
This file is the source of truth. When a decision changes, update the decision log (§3) and the affected sections in the same commit.

---

## 1. Summary

LiftWise is a personal strength-training log for Android and Windows, a richer successor to FitNotes for a single user.
The core flow is FitNotes-style and works offline: pick a day in the calendar, copy a past workout onto it, adjust, and confirm sets on a fast workout screen of big controls. Progression is suggested as one-tap hints, never applied automatically.
On top of that, an AI agent with tools over the app's data logs and edits from a sentence or voice, copies and plans workouts, answers questions about history, and can propose a workout for an unusual day (little time, pain).

## 2. Context and constraints

- **One user**, training at home.
- **Equipment:** adjustable dumbbells + bench to start with. Equipment is a configurable profile and must be easy to extend (pull-up bar, bands, …) without code changes.
- **Training style it serves:** flexible, no rigid program; progress in weight, reps or sets.
- **Flow it builds on (as in FitNotes):** workouts live in a calendar; the next one is a copy of a previous workout, then adjusted (swap an exercise, change sets or reps). Workouts can be planned days ahead.
- **No manual typing of data** during workouts (taps and voice are fine).
- **Devices:** Android phone (primary during workouts), Windows PC (history, analysis, chat).
- **Distribution:** own use only, sideloaded APK (not Play Store). Must not be blocked by Android developer verification (global from 2027), see §6.10.
- **LLM budget:** small and prepaid, without auto-reload: an empty balance stops the API without a charge. The architecture must not depend on Anthropic.
- **Public portfolio:** the repo will be public on GitHub. No secrets and no personal training data in the repo.

## 3. Decision log

| # | Topic | Decision | Rationale |
|---|---|---|---|
| D1 | Logging mode | **Hybrid**: workout screen of big controls (confirm planned set, ±rep, ±weight or a typed weight, RIR chips; the keyboard only when a weight is typed, LW-17) + agent for everything expressible as a sentence | Agent round-trip is 2–5 s and costs money; most sets match the plan; screen works offline; the ± step can't reach every weight (one logged at a gym may never land on the home dumbbells' limit), and snapping to a grid would change real weights |
| D2 | Earlier history | **One-time import of the recent sessions (LW-16), through the sync push; no import feature in the app** | The recent sessions feed the hints and records; older data isn't needed |
| D3 | Equipment | Adjustable dumbbells + bench; **extensible equipment profile** in settings | Exercise availability and agent context depend on it |
| D4 | Effort tracking | **Optional RIR** (0–4+) per set | Key signal for progression; never mandatory |
| D5 | v1 extras | **Rest timer** and **charts & records**; body measurements and supersets go to backlog | Keep v1 focused |
| D6 | Balance guard | **Muscle groups (primary/secondary) + movement patterns**; UI shows muscle groups, patterns are an extra tag mainly for the agent | Superset of plain muscle groups, fits flexible FBW |
| D7 | Workout proposal | **Optional** AI flow: check-in → plan → planned sets on a day; the main flow is copying (D29) | Useful on unusual days (little time, pain); overkill for a normal day |
| D8 | Progression | **Hints, not automation**: a deterministic engine (double progression with RIR) suggests the next step, applied with one tap; the agent may adjust | Progress can come in weight, reps or sets; a copied workout stays 1:1 unless a hint is applied |
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
| D27 | Repo location | Repo lives **outside cloud-synced folders** | A sync client such as OneDrive syncs thousands of `node_modules` files and locks files on rename (EPERM); folders cannot be excluded by name |
| D28 | Toolchain | **Vite+** (`vite-plus`): Vite, Vitest, Oxlint, Oxfmt and `vp check` (TypeScript 7 type check) from one dependency and one root `vite.config.ts`; `vue-tsc` on TypeScript 6 checks `.vue` files | One config instead of ESLint + Prettier + Vitest; fast. Cost: Oxlint lints only `<script>` in SFCs, so eslint-plugin-vue template rules are dropped (template types are still checked by vue-tsc) |
| D29 | Primary flow | **Calendar + copy workout** (FitNotes-style): pick a day, copy a past workout onto it 1:1 (default: the last one), then edit | A proven flow; simplest possible; offline, no AI |
| D30 | Set status | Sets are **planned** or **done**; only done sets count for records, charts, balance and progression | Workouts can be planned days ahead without counting as performed |
| D31 | Weight step | **Fixed ± step**, default 1.25 kg per dumbbell, overridable per exercise; plate inventory and plate calculator moved to backlog | Matches FitNotes; a fixed step needs no plate math |
| D32 | Timed exercises | Exercises are measured in **reps or time** (`measure`); timed sets store `duration_s` instead of reps | Planks and holds can't be logged as reps; cheap to add before the schema exists |
| D33 | Light copy | Copy option **"Kopiuj jako lżejszy"**: one working set fewer per exercise, weight lowered by the whole steps closest to 10% | A deload or a bad day in one tap, on top of the copy flow; deterministic, offline |
| D34 | Weekly summary | Computed in core from done sets, **no AI**; the agent comments on it only when asked | Free, offline, consistent with hints and balance |
| D35 | Export & backup | **JSON + CSV export** generated on the device from the local mirror; server-side restore via D1 Time Travel | The user owns the data; no extra infrastructure (R2, cron) |
| D36 | Bodyweight progression | At 0 kg the progression hint never adds weight, for reps and timed exercises alike; it stops at the range max (`hold`) | Loading a bodyweight exercise (vest, dumbbell) is the user's call, not a step |
| D37 | Dumbbell limit | No `weight_up` beyond the heaviest dumbbell of the equipment profile (`max_kg`); the hint holds instead | A hint the user can't load is noise |
| D38 | Records baseline | The first workout of an exercise is the baseline and sets **no records** | Otherwise the first weeks of a new exercise, which has no imported history (D2), would be all records and toasts |
| D39 | DB migrations | **Drizzle schema → `drizzle-kit generate` (SQL) → `wrangler d1 migrations apply`**; not `drizzle-kit migrate`/`push` over `d1-http`. Drizzle stays on the stable 0.x line until v1 is released | Works locally without a Cloudflare account; the same SQL files feed the integration tests (`readD1Migrations`); wrangler records applied migrations in D1 |
| D40 | Seed catalog in D1 | A **generated custom migration** (`pnpm --filter @liftwise/api db:seed` → `drizzle-kit generate --custom` filled from `exercises.json`): `INSERT … ON CONFLICT DO NOTHING`, each new row with the next `seq` (existing ones take none), no `change_log`. A migrated seed exercise keeps its first version; changing it takes a mutation | Ships with the migrations to local, remote and test D1 without an extra step; keeps the user's edits of seed exercises; a test fails when exercises were added without a new seed migration or a migrated one was edited in the JSON |
| D41 | Change groups & singletons | The **client assigns `groupId`**, one per user action, on every pushed mutation; the athlete profile and each settings key have **fixed ids in core** | One undo reverts a whole action (e.g. a copied workout) even across pushes; two offline devices creating the profile or a setting write the same row instead of duplicates |
| D42 | Visual direction | **"Grafit i kobalt"**: dark graphite and chalk palettes with a cobalt accent (replaced the slate "Żeliwo i kreda" with its teal hammertone accent after the first phone test, chosen from four blue variants), Archivo with narrow bold numerals, Ionic `md` mode everywhere; phones get bottom tabs, from 992 px a side menu (split pane) and a 720 px content column; light/dark follows the system with a per-device override (§5.13) | Grounded in the home-gym materials instead of a template look; numbers are what the user reads mid-workout; one look on Android and PC |
| D43 | Client data path | Every write is **one Dexie transaction** (mirror row + outbox mutation, one `groupId` per action), validated with the core schemas before it is queued; sync pushes, then pulls, and a pull **never replaces a record with queued mutations**; the Worker serves the PWA (static assets, SPA fallback) | Works offline and survives reloads; an invalid mutation would block every later push; the server stays authoritative without per-field merge |
| D44 | Editing a day on the client | A day shows the sets of **all its workouts** and new sets go to the oldest; an added exercise is planned from its **last session**; the hint chip names the **load** it sets; "Cofnij" after a copy or a manual delete is a **local** write (delete the copied sets and the workout the copy created, write the deleted rows back), not the server undo | Two offline devices can create a workout for the same date and neither may hide data; the last session is the usual plan; a hint can change the weight of a light copy, so the chip must say so; local undo works offline and right away (agent changes use the server undo, LW-09) |
| D45 | Logging a workout on the client | A **workout screen** per day (`…/:date/workout`), separate from the day: one exercise at a time with a **draft** of its next set (the next planned set, else the previous done set, else the last session's first working set); one large button logs it, labelled **"Jak poprzednio"** while the draft repeats the previous set and **"Zrobione"** otherwise; sets are logged **today and on past days** only (a future day is planning); the rest timer's end is **kept on the device** | The day stays the planning view, the workout screen is the gym view with big controls; one button that names what it does avoids two near-identical ones; logging the future would fake history; a reload or an app switch mid-rest must not lose the timer |
| D46 | Default rest | Every catalog exercise has its **own rest** (edited on its card); the default rest in the training settings is the **starting value of exercises created outside the catalog** (the agent, LW-09), not a live fallback | A fallback would never apply, since every exercise has a rest; one global value over all exercises would erase the catalog's 45–120 s differences |
| D47 | Android app | Capacitor 8; app id `io.github.d_buczek.liftwise`. The APK bundles the web build (no service worker) and gets its **API origin at build time** (`VITE_API_URL` in the gitignored `apps/web/.env.android.local`; plain HTTP allowed only for a LAN dev server). The rest end is a **scheduled notification** on a max-importance channel with **`USE_EXACT_ALARM`** and `allowWhileIdle`; the in-app vibration is only its fallback. The device token lives in **Keystore-backed secure storage**; Android backup is off. Native calls live in `apps/web/src/native/`, no-ops or web fallbacks in the browser | The page's own origin is `https://localhost`, so the API needs an absolute URL; `USE_EXACT_ALARM` is granted at install and only Play restricts it, while the APK is sideloaded; a single vibration source avoids a double buzz; a restored backup couldn't decrypt the token anyway, and the mirror syncs back from the server |
| D48 | Workout labels | A workout has an optional **label** (`workout_labels`: a name of at most 6 characters, a color key from a fixed palette of 6, archived); a day's label is that of its oldest labelled workout, and picking one on the day writes every workout of the day. A copy gives the workout it writes to the source's label unless the target day has its own or the label is archived; the copy dialog offers **"Ostatni A / B…"**. Labels are set by hand, not derived from muscle groups. On the calendar a labelled day takes the label's color **and shows its name**; cobalt, the accent of unlabelled days, is the palette's last color. Clients built before labels stop syncing on the first label (unknown table) and drop labels from the workouts they write, so every device is updated before labels are used | Training sets such as A / B usually share muscle groups (full body), so groups wouldn't tell them apart and couldn't pick "the last A"; inheriting on copy means a label is set once; color keys let each theme pick its own values; the name keeps the label readable without color (color blindness, two similar colors) and fits a phone's calendar cell; a stopped sync keeps the pull cursor, so an updated client loses nothing |
| D49 | Charts, balance and export UI | **Self-drawn SVG charts** (no chart library): one series per chart, the chosen point in plate numerals, a table twin for screen readers. The **balance guard** is a third segment of History, a muscle group opens its weekly sets; the **weekly summary** card under the calendar follows the shown month (this week, else the month's last) with its own ‹ ›. Export on Android goes through the **share sheet** (filesystem + share plugins), in the browser it downloads | Simple series need no 100 kB dependency and keep the type and colors of D42; the WebView can't download a blob, and the share sheet reaches Drive, Files and mail |
| D50 | Risky tool confirmation | **Own proposals, not the AI SDK tool approval**: a risky call stores its input in `pending_proposals` and returns the diff; confirming runs the tool again on the current data as one change group, **without the model**, rejecting writes nothing; both record the status (and the written changes) in the tool result of the stored message | The built-in `needsApproval` pauses the model turn and needs another model call to continue; a stored proposal costs no tokens, survives a reload and the other device, and keeps the same semantics for MCP (§6.11) |
| D51 | Deployment | One Worker **`liftwise`** serves the API and the PWA on `liftwise.<account-subdomain>.workers.dev`; D1 `liftwise` in **WEUR**; Workers Logs on; `pnpm deploy:api` from the PC applies the D1 migrations, then deploys (`docs/deploy.md`). Stays on **Workers Free** although an agent turn takes 20–300 ms CPU against the 10 ms limit (§9); provider keys are set with `wrangler secret put` from the clipboard | Zero running cost is a goal; Cloudflare tolerated every measured turn (outcome `ok`) and sync, undo and pairing stay within 10 ms; LW-15 cut what the app controls and the rest is the AI SDK streaming the model (§9), so Workers Paid ($5/mo) only if chat turns start failing with 1102; a key typed as the secret's name shows in plain text in `wrangler secret list` |
| D52 | Voice input and the prompt queue | **`@capgo/capacitor-speech-recognition`** on Android (the on-device recognizer when offline), the Web Speech API in the browser; the transcript goes **into the composer** and is sent by the user. The queue lives in Dexie, runs **after each successful sync**, in order, and a prompt waiting behind others is queued too even online; a prompt tried before without an answer is dropped when the pulled mirror already has its message | The community plugin has no Capacitor 8 release (7.0.1 is the latest); capgo maintains its fork with the major following Capacitor's. Reading the transcript before sending catches mis-transcriptions cheaply. Order matters ("zmień ostatnią serię" after the queued sets), and the server stores the message before it answers, so the mirror tells whether a lost response went through without an idempotency key on the server |
| D53 | Workout proposal path | **Through the chat:** the check-in sheet sends an ordinary message to today's thread, which runs `propose_workout`; that makes one `planner` call without tools and stores the checked plan as a proposal of the internal `propose_plan`. **The check-in and "Wygeneruj ponownie" send their answers as data and run the tool without a model; `fast` calls it only for typed text.** The turn is stored like a tool call of the model, and a plan that can't be made fails the turn. Accepting doesn't start the workout; target RIR goes on the planned sets, logging a set replaces it | One path for the card, the offline queue and later changes by chat. First designed with `fast` routing the sheet too, but on production it answered a repeated check-in with text instead of a new plan (LW-11). A forced `tool_choice` isn't portable: `fast` is a setting, and Sonnet 5.5 and Opus 5.5 reject it with a 400. Without the routing call a button always gives a card, at one model call less; confirming never calls a model; the day can be in the future, and RIR records what a set actually felt like |

## 4. Scope

### 4.1 v1

- Calendar with planned and done workouts, copy workout (also as a light copy), editing planned sets with swap suggestions (§5.2).
- Active workout screen with hybrid logging, reps or timed sets, exercise setup notes (§5.2) and rest timer (§5.3).
- History, charts and records (§5.4).
- Exercise catalog with seed data (§5.5).
- Equipment profile (§5.6).
- Progression hints (§5.7), balance guard (§5.8) and weekly summary (§5.11).
- Data export (JSON, CSV) and backup (§5.12).
- Agent: logging, edits, copying and planning workouts, history Q&A, optional workout proposal, clarification, confirmations, change log with undo, athlete profile, per-day threads, voice input, offline prompt queue (§5.9).
- Settings: model per role, provider status, devices, equipment, catalog, balance targets (§5.10).
- Android APK (Capacitor) + PC PWA, synced through the backend.

### 4.2 Backlog (not v1)

- MCP server (phase 2, §6.11): token auth first, then OAuth for claude.ai connectors.
- Plate inventory and plate calculator (which plates to load; shared inventory for both dumbbells).
- Ongoing Android notification during a workout with the next set and a **"Zrobione"** action (log without unlocking the phone).
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
- An import feature for other apps' backups (the one import was a one-off, D2).
- Imperial units (kg only).

## 5. Functional specification

### 5.1 Domain conventions

- Weights are in **kg, per dumbbell**. "Wyciskanie 24 kg 4x10" = each dumbbell 24 kg, 4 sets × 10 reps.
- Each exercise declares `implements` (1 or 2 dumbbells; bodyweight exercises use 1) and `unilateral` (reps counted per side). Volume = weight × reps × implements.
- Weight precision 0.25 kg. Weight 0 = bodyweight. Reps are integers. RIR is optional: 0, 1, 2, 3, 4 (= "4+").
- Exercises are measured in **reps** or **time** (`measure`, D32). Timed sets store `duration_s` (integer seconds) instead of reps, "plank 3x45 s"; they have no volume and no e1RM.
- Sets are **planned** or **done** (§5.2). Only done sets count for progression, records, charts and balance.
- Sets can be marked **warm-up**; warm-ups are excluded from progression, records and balance.
- Time zone: device local; the client sends local date/time with agent requests.
- IDs are UUIDv7 generated on the client (offline-safe, time-ordered).

### 5.2 Calendar, planning and active workout

Calendar and planning (D29):

- The **calendar** is the home screen: month view, days with a workout are marked as done or planned only, in the color and with the name of the day's label if it has one (D48). Tapping a day opens its workout. A workout belongs to one local date.
- **Workout labels** (D48): a workout can carry a label, a training set such as "A", "B" or "Push" (a name of 1–6 characters, unique among active labels regardless of case, checked on the client) with a color from a fixed palette of 6 (teal, violet, green, magenta, graphite, cobalt; no amber or rust); a new label starts with the first color no active label uses. A day's label is that of its oldest labelled workout; a day with sets shows it as a chip under the title ("Dodaj etykietę" without one), and a tap picks another label, "Bez etykiety" or a new one, written to every workout of the day in one change group. Settings → Etykiety treningów adds labels, renames them, changes their color and archives them; an archived label stays on its workouts but is no longer offered. No delete.
- **Copy workout** works on any day, today or in the future:
  - Pick the source day in the calendar; the default is the most recent workout with sets before the target day. Above the month, **"Ostatni:"** offers each active label with a workout before the target day; one tap picks the most recent day with it.
  - The copy gives the target the source day's label unless the target day has its own or the label is archived (D48).
  - Exercises are copied in order with their sets (reps or duration, weight, warm-up flag) 1:1, as **planned** sets; RIR and notes are not copied. Done sets of the source are copied; a source with no done sets copies its planned sets.
  - If the target day already has sets, the copy is appended after them.
  - **"Kopiuj jako lżejszy"** (D33), for a deload or a bad day: the same copy, then per exercise the last working set is dropped (at least one stays) and the working weight is lowered by the whole weight steps closest to 10% (at least one step, a tie takes the extra step, not below 0). Warm-ups (including their weight), reps and durations stay.
- **Editing a day:** add, remove or reorder exercises, add or remove sets, swap an exercise (its sets stay), change reps, duration and weight with ± controls. Exercises move as a whole; sets keep their order within an exercise. Exercise picker with search (name and aliases, Polish diacritics optional) and recently done exercises, then the rest by name; exercises the equipment profile doesn't cover come last. On a day it leaves out the day's own exercises (adding or swapping to one would merge two blocks).
  - An added exercise is planned from the working sets of its last session before the day; without history, one set at the bottom of its range and 0 kg.
  - A day shows the sets of all its workouts (two devices offline can each create one); new sets go to the oldest (D44).
- **Swap suggestions:** the picker opened from "Zamień" lists similar exercises first: available with the current equipment, not archived, the same `measure` (the sets stay) and at least one shared primary muscle; ranked by shared primary muscles, then shared movement patterns, then by recent use. The rest of the list keeps the same `measure`.
- **Progression hint** per exercise (§5.7): a chip with the load the planned sets get, such as "↑ 22,5 kg × 11, 11, 10", "↑ 25 kg × 8" or "↑ 50, 45 s" (at 0 kg). One tap applies it to that exercise's planned working sets in order (weight and reps or seconds; the sets done that day keep their place in the order, so the chip stays away mid-workout; sets beyond the hint take its last value, the number of sets stays); ignoring it changes nothing. No chip when the planned sets already match.
- A copy and a manual delete offer **"Cofnij"** in a toast: it deletes the copied sets (and the workout the copy created, unless it has got other sets since, and takes off the label the copy gave an existing workout unless it has been changed since) or writes the deleted rows back, locally as a new change group, so it works offline (D44).

Active workout (hybrid logging):

- The workout screen (D45) opens from a day dated today or earlier: "Rozpocznij trening" / "Wróć do treningu" on the first exercise with a planned set left, or the exercise's name on the day. A future day is planning only. While it is shown the screen stays on (keep-awake on Android, Screen Wake Lock in the browser where supported); logging a set gives a short haptic tap on Android.
- Confirming the first set of a workout starts it (`started_at`). A workout can also start empty, or implicitly when the agent logs the first set. An accepted AI proposal (§5.9.6) only plans the sets (D53).
- The current exercise card shows the progression hint, the last session's done sets ("Poprzednio, 27 października: 22,5 kg × 10, 10, 9"), the exercise's sets of the day and its **setup note** ("ławka na 3", "chwyt neutralny"). The note belongs to the exercise, is editable from the card together with the exercise's weight step and rest, and shows in every workout.
- Big controls; the keyboard opens only to type a weight. The **draft** of the next set is the next planned set; without one, the previous done set of the day, else the first working set of the last session, else the bottom of the range at 0 kg. It starts over after every set (RIR clears):
  - **"Zrobione"**: mark the next planned set as done with the draft's values, or add a done set when none is planned.
  - Before confirming: reps −/+ (timed exercises: duration −/+ 5 s), weight −/+ (fixed step, default 1.25 kg, overridable per exercise; D31), RIR chips (optional), warm-up toggle.
  - **Typing a weight** (LW-17, here and in the set editor; reps and time stay −/+ only): tapping the weight opens a field with the numeric keyboard, with a comma or a dot. Enter or leaving the field applies it, so "Zrobione" with the field open logs the typed weight; Esc or an empty field keeps the old one. Anything but a non-negative multiple of 0.25 kg is never rounded: the field stays open with a message and "Zrobione" / "Zapisz" wait, while −/+ drops the text and steps from the last good weight. There is no upper limit, since history can be above `max_kg`.
  - **"Jak poprzednio"**: the same button while no planned set is left and the draft still matches the previous set: adds a done set identical to it.
  - Next/previous exercise (after the last planned set, "Dalej: <name>"), pick exercise (the day's exercises or any other from the picker).
  - Mic button and chat drawer for the agent (LW-09/10).
- Swipe a set to edit or delete (tap opens the editor too). A manual delete is immediate with an undo snackbar.
- Planned sets left undone stay visible as not done and never count.
- Screen stays awake during an active workout (Android).
- A new record shows a short toast.

### 5.3 Rest timer

- Starts automatically after a set of today is marked done; default duration per exercise (catalog default, user-editable on the exercise card, 0 = no timer); the next set restarts it. The default rest in settings is the starting value of exercises created outside the catalog (the agent's `create_exercise`, LW-09); it doesn't change existing exercises.
- In-app countdown with +15 s / −15 s / skip, at the bottom of the workout and the day; its end is kept on the device, so a reload keeps a running rest (one that ended meanwhile is dropped). At the end: vibration where the browser supports it and "Przerwa skończona" until dismissed or the next set.
- Android: local notification + vibration at the end, also with the screen locked (scheduled notification, exact alarm allowed in Doze; D47). It replaces the in-app vibration; without notification permission (asked at the first rest) the app vibrates itself. PC: in-app only.
- Logging the next set cancels the pending notification; skipping the rest cancels it, dismissing "Przerwa skończona" clears the shown one, ±15 s moves it.

### 5.4 History, charts and records

- History: the calendar (§5.2), session detail, per-exercise history.
  - The History screen lists days with done sets by month, newest first (the exercises done, the number of done sets, the day's label), and the exercises with history (search as in the picker, the most recently done first with that day's working sets).
  - Session detail is the day (§5.2). Per-exercise history: its done sets per day, newest first, warm-ups marked, RIR, the sets that set a record in amber; a session opens its day. Planned sets never show.
- Records per exercise (done working sets only):
  - **Rep record per weight**: most reps at ≥ a given weight (FitNotes-style). A set is a new record when no earlier set has at least its weight and at least its reps; the record table lists the sets no other set beats on both.
  - **Estimated 1RM** (Epley: `w × (1 + reps/30)`, per dumbbell, unrounded), best ever and trend. A new record is above every earlier e1RM; sets at 0 kg have none.
  - Timed exercises: **time record per weight** (longest hold at ≥ a given weight), the same rule with seconds; no e1RM.
  - The first workout of an exercise is the baseline and sets no records (D38).
- Charts: per exercise (top-set weight, e1RM, session volume over time; timed: top-set duration), per muscle group (weekly sets).
  - Per exercise one point per day (`exerciseProgress` in core; workouts of one day count as one session): the top set is the heaviest working set, the most reps (seconds) on a tie; the e1RM is the day's best; volume sums weight × reps × implements. An exercise done only at 0 kg charts its top-set reps instead. Range: 3 months, a year (default) or everything.
  - Per muscle group the hard sets per Monday–Sunday week (`weeklyHardSets`, §5.8 weighting) over the last 12 weeks, against its target range.
  - The exercise's records: the best e1RM with its set, then the record per weight (heaviest first); a row opens its day.

### 5.5 Exercise catalog

- Fields: `id`, `name_pl`, `aliases[]` (PL and EN variants, common voice mis-transcriptions), `primary_muscles[]`, `secondary_muscles[]`, `patterns[]`, `requires[]` (equipment types), `implements`, `unilateral`, `measure` (reps/time), `rep_range` (min/max; for `reps`), `time_range_s` (min/max; for `time`), `rest_seconds`, `weight_step_kg?` (overrides the default ± step), `note?` (user's setup note, §5.2), `archived`.
- Seed: `packages/core/data/exercises.json`, ~40–60 exercises, mostly dumbbell + bench plus a few bodyweight basics, validated by a zod schema in tests. Seed ids are fixed UUIDv7s (one shared timestamp, the index in the random part), so the server and every device share them.
- Muscle groups (keys → PL labels in i18n): `chest`, `lats`, `upper_back`, `front_delts`, `side_delts`, `rear_delts`, `biceps`, `triceps`, `forearms`, `quads`, `hamstrings`, `glutes`, `calves`, `abs`, `lower_back`.
- Movement patterns: `horizontal_push`, `vertical_push`, `horizontal_pull`, `vertical_pull`, `squat`, `hinge`, `lunge`, `core`, `isolation`.
- User can add, edit and archive exercises. The agent can propose new ones (risky tool, confirmation).

### 5.6 Equipment profile

- Equipment items (extensible by `type`):
  - `dumbbells`: adjustable pair, optional max weight per dumbbell.
  - `bench`: flat / adjustable incline / decline.
  - Later types: `pullup_bar`, `band`, `kettlebell`, `barbell`, … (new type = schema + catalog `requires` value, no UI rewrite: generic item editor).
- Used for exercise availability (catalog `requires`) and as agent context. `requires` lists equipment types only; bench props (incline/decline) are not checked for availability in v1.
- Plate inventory and the plate calculator are in the backlog (D31).

### 5.7 Progression hints

Pure, deterministic function in core. Suggests the next step per exercise and runs offline. It never changes data by itself; the user applies a hint with one tap (D8).

- Input: exercise config (rep range, weight step), target RIR (settings, default 1–2), the done working sets before the hint's day, optionally the heaviest dumbbell of the equipment profile.
- The **last session** is the exercise's sets in the last workout before the day: its top weight `W`, its number of sets and their reps in the order performed. No history → no hint.
- Rules (v1, double progression), the first match wins:
  1. Last session older than 14 days → the same weight, sets and reps (`reentry`).
  2. Every set reached `rep_max` and each RIR was ≥ 1 or not recorded → **`W` + one step**, reps = `rep_min` (`weight_up`). Never at 0 kg (D36) or beyond the heaviest dumbbell (D37); those fall through to rule 3.
  3. Otherwise → **same weight `W`**; reps = last reps + 1 per set, capped at `rep_max` (reps already above it stay) (`reps_up`, or `hold` when nothing changes).
- **`stall`** is a flag next to the reason: the last 3 sessions have the same top weight and the summed reps of their common sets dropped twice in a row. The agent may suggest a deload of about 10% or an exercise swap.
- Timed exercises: the same rules with seconds instead of reps (+5 s per set, `time_range_s`, `time_up`); at weight 0 the hint stops at the max time.
- Output: `{ weight, sets, reps, duration_s, targetRir, reason, stall }`: per-set `reps` or `duration_s` by the exercise's measure (the other one is null, as in a set); `reason` is one of `reentry`, `weight_up`, `reps_up`, `time_up`, `hold`, a code the UI/agent can explain.
- Adding sets is left to the user; the engine doesn't suggest it.
- The agent uses this as a baseline and may deviate based on check-in, stating why.

### 5.8 Balance guard

Computed in core (`balanceSnapshot`) from done working sets dated up to today.

- Per muscle group:
  - Days since last direct work (primary muscle); `null` if never.
  - Rolling 7-day **hard sets** (today and the 6 days before; working sets; primary = 1.0, secondary = 0.5) vs a target range (default 10–20, editable per group).
  - Status: under (below the min) / in range (min–max inclusive) / over (above the max).
- Per movement pattern: days since last; `null` if never. `isolation` is not a pattern to balance and is left out.
- Shown as a compact dashboard; the snapshot is also an agent tool (§6.6).
- With dumbbells and a bench, `vertical_pull` has few options, so the guard shows that gap rather than hiding it.

### 5.9 Agent

#### 5.9.1 Capabilities

- Log sets from text or voice ("wyciskanie 24 kg 4x10, ostatnia na zero").
- Edit data ("zmień ostatnią serię na 22 kg").
- Copy and plan workouts ("skopiuj czwartek na sobotę, zamiast wiosłowania daj wiosłowanie jednorącz").
- Answer history questions from tools ("kiedy ostatnio robiłem wiosłowanie i z jakim ciężarem?").
- Propose a workout for an unusual day (§5.9.6).
- Manage the athlete profile and catalog (with confirmation).

#### 5.9.2 Behavior rules (system prompt contract)

- Replies in the user's language (Polish by default), short.
- Applies the conventions from §5.1.
- **Asks instead of guessing** before any write when:
  - the exercise match is ambiguous (more than one plausible candidate) or unknown;
  - sets or reps are missing;
  - the target set or session is unclear ("ostatnia seria" while two exercises are in progress).
- A question about history needs no exact match: it checks every plausible variant and names the one it found ("wiosłowanie" covers all rows).
- All data access goes through tools; never invents history.
- After each write, a one-line summary appears in the chat as a change card with **Cofnij**.

#### 5.9.3 Confirmation policy

| Risk | Examples | Behavior |
|---|---|---|
| `read` | history, calendar, records, balance, progression hints | Runs immediately |
| `write` | log sets, edit a single done set, copy a workout, edit planned sets (add, change, swap, remove), start/finish workout, undo | Runs immediately; change card with undo |
| `risky` | delete done sets, change more than one done set, create/edit exercise, update profile, update settings, propose a workout | Returns a **proposal** (diff card); executes only after the user taps **Zatwierdź** |

Planned sets are cheap to change and every change is undoable, so editing them is never `risky`.

#### 5.9.4 Change log and undo

- Every server-applied mutation (user or agent) writes `change_log` rows with before/after snapshots, grouped by `change_group_id` (one group per tool call or user action).
- **Undo** applies the inverse of a group as a new group (`undo_of`), so undo is itself synced and reversible.
- If an affected record changed after the group, undo shows the conflict and requires confirmation.

#### 5.9.5 Threads and athlete profile

- Conversations are stored as **threads**, by default one per day; accepting a workout proposal links the thread to the day's workout, unless it already has one.
- Only the current thread's messages go into the model context. Older threads are browsable but not sent.
- **Athlete profile**: editable document (goals, limitations/injuries, preferences, typical session length) sent with every request. The agent proposes edits via a risky tool.

#### 5.9.6 Workout proposal flow (optional)

For unusual days; a normal day starts from a copied workout (§5.2, D7).

1. User taps **"Zaproponuj trening"** on today or a later day (action sheet, or an empty day), or asks the agent.
2. Check-in sheet: time available (chips 20/30/45/60+ min), wellbeing 1–5, pain/limitations (body-part chips + optional text or voice). Every answer is optional; tapping a chosen chip clears it. It goes as a message to today's thread, with the exact date and the answers as data, so the server plans it without asking `fast` (typed requests go through `fast`); without the network it waits in the queue (§5.9.8, D53).
3. The server builds context: progression hints of every available exercise with history, each exercise's weight step, balance snapshot, last 21 days of sessions, the day's planned and done sets, profile, equipment, the check-in.
4. The `planner` model returns a structured plan: exercises, sets × target reps × per-dumbbell weight, target RIR, short rationale. The server rejects an exercise that is unknown, archived or needs missing equipment, and brings weights within the heaviest dumbbell; a plan that can't be made goes back to the `fast` model as a tool error, which explains it, or for a check-in and a regeneration fails the turn with the error and a retry. Nothing is written yet.
5. Plan card (the turn ends on it): accept / change by chat / regenerate. A change or a regeneration gets the day's last plan and keeps its check-in; a new check-in takes nothing from it. The new card replaces the day's earlier one, in any thread, which can no longer be accepted. A plan for another day stays. A plan whose day has passed can't be accepted.
6. Accepting (with the device's local time, so a plan for yesterday is refused just after local midnight, not by the server's UTC date) replaces the day's planned sets with the plan (done sets stay, the plan goes after them) and stores the rationale and the check-in on the workout, as one change group with "Cofnij". The rationale shows on the day, and later changes are ordinary edits of planned sets. Deviations are fine.

#### 5.9.7 Voice input

- Android: system SpeechRecognizer through `@capgo/capacitor-speech-recognition` (pl-PL, D52): the default recognizer online, the on-device one offline (needs the Polish offline speech pack, `docs/android.md`).
- PC: Web Speech API (Edge/Chrome, needs the network: the mic is disabled offline); no mic button where the API is missing (Firefox). Typing is always available.
- A mic button in the composer: the transcript appears in the composer while speaking, after what is already typed; the user reads it and sends it like typed text (no auto-send). The agent resolves mis-transcriptions using catalog aliases or asks.

#### 5.9.8 Offline prompt queue

- Without connectivity, typed or spoken prompts go to a local **"Do przetworzenia"** queue (Dexie `prompt_queue`) with the time they were sent. While prompts wait, new ones queue behind them even online, so they run in order. A prompt from a card or another page during a live turn waits in the queue for that turn to end. A live prompt whose request doesn't get through (the device looks online, the signal is weak) moves to the queue with its id and send time.
- The queue runs after each successful sync (network back, return to the app, every minute), one prompt at a time; each request carries its original `localTime`, so sets get that day and time and land in that day's thread.
- A prompt sent before without an answer (the connection dropped) is dropped instead of sent again when the pulled mirror already has its message: the server stores the message before answering (D52).
- A failure the user must act on (no provider key, model error) stops the queue at that prompt with the error, **Spróbuj ponownie** and **Usuń**; an unreachable server just waits for the next sync, and the list says so.
- A request whose response doesn't start within 20 s counts as unreachable, so a weak signal doesn't hold "Agent myśli…" for minutes. While the last sync couldn't reach the server, new prompts go straight to the queue.
- Each result appears in the thread as a change card (undo) or a question, with the sync after the turn.

### 5.10 Settings

- **Models:** provider + model id for roles `fast` and `planner`. Only providers whose key secret is configured are selectable.
- **Providers:** status ✓/✗ per provider (no key values ever shown).
- **Devices:** list (name, created, last seen), pair new device (QR), revoke.
- **Equipment:** generic item editor (§5.6).
- **Catalog:** edit, archive, add exercises.
- **Balance:** target ranges per muscle group (0–40 hard sets, default 10–20).
- **Training:** default rest (for new exercises outside the catalog, §5.3), default target RIR, default weight step (1.25 kg).
- **Profile:** athlete profile editor.
- **Data:** export JSON / CSV (§5.12).

### 5.11 Weekly summary

A card on the calendar for the shown week (Monday–Sunday), computed in core from done working sets (D34). Runs offline.

- Workouts done (with at least one working set), total working sets.
- Hard sets per muscle group in the week vs the balance targets (§5.8).
- New records of the week (§5.4, replayed over the whole history).
- Exercises of the week flagged `stall` (§5.7) by the hint for the day after the week.
- Neglected: muscle groups without a set as a primary muscle and movement patterns (without `isolation`) without a set in the week.
- The agent reads it through a tool and comments only when asked ("podsumuj tydzień").

### 5.12 Data export and backup

- Settings → Data: export all synced tables as **JSON** (full) and done sets as **CSV** (date, exercise, set, weight, reps, duration, RIR, warm-up) (D35).
  - JSON: `{ app: "liftwise", version: 1, exported_at, tables: { exercises, equipment_items, workout_labels, workouts, sets, athlete_profile, settings, threads, messages } }`, rows as stored (sync fields included, tombstones left out), indented by 2.
  - CSV: RFC 4180 (comma, CRLF, quotes when needed, decimal dot), header `date,exercise,set,weight_kg,reps,duration_s,rir,warmup`; done sets including warm-ups, ordered by date, workout and position; `exercise` is `name_pl`, `set` numbers the exercise's sets within the workout from 1, empty for null, `warmup` is `true`/`false`. The UI adds a UTF-8 BOM for spreadsheets.
- Generated on the device from the local mirror after a pull; works offline from the last synced state. No API endpoint. Files are named `liftwise-<local date>.json` / `.csv`; the browser downloads them, the Android app hands them to the share sheet (D49).
- Server side: D1 Time Travel (point-in-time restore) is the backup. Always on; restore window 7 days on Workers Free, 30 days on Workers Paid; restore with `wrangler d1 time-travel restore liftwise --timestamp=<unix>` (overwrites the database in place).
- Exports contain personal training data: never commit them (§2, public repo).

### 5.13 UI shell and visual design

- **Layout:** phones get one column and bottom tabs (Kalendarz, Historia, Agent, Ustawienia). From 992 px (Ionic `lg`) an `ion-split-pane` side menu (240 px: wordmark, sections, sync status) replaces the tabs, and content sits in a column of at most 720 px. Ionic runs in `md` mode on every platform.
- **Visual direction "Grafit i kobalt"** (D42), taken from the materials of a home dumbbell setup:
  - Colors: graphite `#1B1E23` (dark background, light-mode text) with surfaces `#252931` and lines `#373C45`, chalk `#EDF0F4` (light background) and `#ECEEF2` (dark-mode text), lines `#D3D8E0` in light, cobalt `#2D5BC0` light / `#6E9BF5` dark (accent, actions, active section), signal amber `#E0A526` (records and warnings only), rust `#A33A2B` / `#E07A63` (danger). Text contrast at least 4.5:1. The icon keeps chalk plates with cobalt collars on graphite.
  - Type: Archivo variable with its width axis, bundled for offline use. The app paints only once the font is loaded (waiting at most 1 s), so text doesn't jump from the system font. Numbers and headings are narrow (`font-stretch: 75%`), bold, with tabular figures; body text is 400 at normal width. Scale 13 / 14 / 16 / 20 / 26 / 40 / 64 px, sentence case, no all-caps labels.
  - One loud element: large narrow numerals, like numerals cast into a plate (the pairing code now; weights and reps in LW-07). The rest stays quiet: flat headers with a hairline, a list is one bordered block, no decorative motion; Ionic animations are off under `prefers-reduced-motion`.
- **Theme:** both palettes are Ionic variables (`ion-palette-dark` class on `<html>`). Settings → Wygląd: Systemowy / Jasny / Ciemny, stored on the device, not synced.
- **Texts:** every UI string is in `apps/web/src/locales/pl.json` (vue-i18n with Polish plural forms). Errors say what happened and what to do; an empty screen offers the next action.
- **Screens (LW-06):** pairing (`/pair`, without navigation), Settings (equipment, training, workout labels, devices, sync status, appearance) and placeholders for Calendar, History and Agent until their tickets.
  - Equipment: a generic item editor; its fields come from the type's props in the core schema (boolean → toggle, number → decimal field, empty = null), labels from the locale file.
  - Devices: list, revoke (revoking this device signs it out), pair a new device: the code in large numerals, a QR code of `<origin>/pair?code=…` and a 5-minute countdown.
- **Screens (LW-07):** Calendar (home; a "Dziś" row, then the month: a done day is a solid accent tile, a planned-only day an accent outline, today underlined), Day (`/calendar/:date`; the exercises as one bordered block, sets as tiles in the calendar's language: planned outlined, done solid, warm-ups dashed; actions in a ⋮ sheet), the copy dialog (the month as the source picker, a preview, the light switch), the exercise picker, and the set sheet with ± steppers (sized to its content). On phones the back button is the arrow alone, so the day fits in the title. The workout screen (`/calendar/:date/workout`): the exercise name, hint chip and last session, then the draft as the loud element (weight and reps in 64 px numerals with ± on both sides, side by side from 576 px), RIR chips, warm-up and a 64 px "Zrobione"; below, the day's sets of the exercise as a swipeable list. The rest timer is a footer bar (a hairline of the rest left, the countdown in 40 px numerals, −15 s / +15 s / Pomiń) that turns solid accent when the rest ends; undo toasts sit above it, record toasts are amber at the top. Settings → Trening is a sheet: default rest, target RIR range, weight step chips. History (`/history`): a "Treningi / Ćwiczenia" segment; workouts by month as one bordered list per month, each row led by a calendar leaf (the day of the month in 26 px numerals over the weekday); a workout opens its day under `/history/:date` (the History tab stays active), an exercise `/history/exercise/:id`: the name as a heading, then the sessions as one bordered block (the date, then numbered working sets in 20 px numerals with RIR on the right, warm-ups muted, an amber "rekord" tag), each session tappable as a whole.
- **Screens (LW-14):** a label is a solid tag in its color with its name in 14 px narrow bold (contrast text: white in light, graphite in dark). On the calendar (and the copy dialog's month) a labelled day takes the label's color for its done tile or planned outline, with the name in 13 px under the day number; a legend row under the month lists the shown month's labels. Day: the label chip beside the title in the toolbar (a tag icon on a day without a label), so it takes no row of its own; the label sheet (labels as 48 px options, "Bez etykiety", "Nowa etykieta" opening the editor in place). Settings → Etykiety treningów (`/settings/labels`): the labels as one list (archived ones last, muted), the editor as a sheet (name with a counter, the 6 colors as 48 px swatches, the archive switch). History: the label tag at the end of a workout's row. The palette's light and dark values are CSS variables (`--lw-label-<color>`), each at least 4.5:1 against its contrast text and the background.
- **Screens (LW-12):** charts are self-drawn SVG (D49): one cobalt series, a 2px line with dots (only the chosen one when days crowd) or columns of at most 24 px rounded at the top, hairline grid, tick labels in 13 px left of the plot; the y axis of a line doesn't start at 0, so there is no area wash. Above the plot the chosen point is the loud element (40 px narrow numerals, its date muted), the last one until a pointer or ←/→ chooses another; a visually hidden table lists every value. Exercise history: the series as a heading, compact chips (metric, range) above a bordered block with the chart, "Rekordy" as one list (the best e1RM in 26 px, then each weight's record), then "Sesje". History → Balans: muscle groups as one list, each row the name, the days since its last primary work on the right and a meter (a 12 px track, the target range as a cobalt band, the hard sets as a bar: cobalt in range, muted below, amber above with a "za dużo" tag) with the count in 20 px numerals; then the patterns with the days since, "nigdy" as an amber tag. A muscle group (`/history/muscle/:group`): its last 7 days as a meter, then the 12 weekly columns over the target band. The weekly summary card under the calendar's legend: the week as a 20 px title with ‹ ›, workouts / working sets / records in 40 px numerals, then the week's standing records per exercise (an amber dot each), stalled exercises and what got no set, and "Serie na partie" opening a sheet of meters. Settings → Balans (`/settings/balance`): the groups with their ranges, a sheet with two steppers and "Domyślnie 10–20". Settings → Dane: "Eksportuj kopię (JSON)" and "Eksportuj serie (CSV)" with the time of the last sync.
- **Screens (LW-09):** Agent (`/agent`): today's thread (§5.9.5) as a column of messages, the user's in a bordered bubble on the right, the agent's plain text on the left; an empty day offers three example sentences as chips. A write is a change card (one bordered block: the one-line summary in narrow bold, a line per set "exercise · 24 kg × 10", "24 kg × 10 → 22 kg × 10" for an edit, deleted ones struck through; "Cofnij", which asks before reverting records changed later, then "Cofnięte"). A proposal is the same card with a cobalt border and its status above ("Do zatwierdzenia" / "Zatwierdzone" / "Odrzucone"), "Odrzuć" / "Zatwierdź" active once the turn is over and the message is stored; a confirmed one gets "Cofnij". The composer is a footer bar (an auto-growing field, Enter sends, Shift+Enter breaks the line, a 48 px send / stop button); offline it says the agent needs the internet. Errors sit under the messages with "Spróbuj ponownie" (the same message goes again with its id), `provider_unavailable` links to the model settings. The clock icon opens earlier threads (`/agent/threads`: days, newest first, with the first sentence), each read-only under `/agent/threads/:id`. Settings → Agent: Modele (`/settings/models`: providers ✓/✗, then per role the provider chips of configured providers and the model id with "Domyślny"; saved as the `models` setting through the outbox) and Profil zawodnika (`/settings/profile`: a markdown text field; an unedited draft follows the synced text).
- **Screens (LW-11):** the check-in is a bottom sheet with chips and a text field with the mic. The plan card follows the change card (accent border while it waits): the day as the title, per exercise its name and a muted line of the load with the target RIR, warm-ups on their own line, then the rationale; "Wygeneruj ponownie" and "Akceptuj", then "Cofnij" and "Otwórz dzień". An earlier thread has no "Wygeneruj ponownie". The day shows the rationale in muted text under the start button, and the target RIR under an exercise's name.
- **PWA:** manifest (pl, standalone), icons generated from `apps/web/public/icon.svg` (`pnpm --filter @liftwise/web icons`). The service worker precaches the app shell; `/api/*` and `/health` never come from the cache. A new version waits for the "Odśwież" toast, so the app never reloads mid-workout.

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
│  └─ core/           zod schemas & types, conventions, copy workout (incl. light), swap suggestions,
│                     e1RM/records, progression hints, balance, weekly summary, export format,
│                     sync protocol types; data/exercises.json (seed catalog)
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
| `workout_labels` | `name` (1–6 characters), `color` (palette key), `archived` (D48) |
| `workouts` | `date` (local), `started_at?`, `ended_at?`, `checkin?` (JSON: time, wellbeing, pain), `rationale?` (accepted AI proposal), `note`, `label_id?` |
| `sets` | `workout_id`, `exercise_id`, `position`, `status` (planned/done), `weight_kg`, `reps?` / `duration_s?` (by exercise `measure`), `rir?`, `warmup`, `note`, `performed_at?` (set when done), `source` (manual/copy/agent/proposal) |
| `athlete_profile` | single row, markdown document (`content`) |
| `settings` | key/value (JSON) |
| `threads` / `messages` | per-day threads, linked `workout_id?`, message parts (incl. tool calls/results) |

Server-only tables: `change_log` (`change_group_id`, `actor` user/agent/system, `thread_id?`, `entity`, `entity_id`, `op`, `before`, `after` (row snapshots without `seq`), `seq` (the `seq` the change gave the row), `undo_of?`; unique per `undo_of` + record), `applied_mutations` (idempotency), `devices` (`name`, `token_hash`, `last_seen_at`, `revoked_at`), `pairing_codes` (`code_hash`, `created_by`, `expires_at`, `used_at`), `pairing_failures` (`at`, failed redeem attempts for the rate limit), `sync_counter`, `pending_proposals` (risky tool proposals awaiting confirmation).

Client-only (Dexie): `outbox` (pending mutations), `prompt_queue`, `sync_state` (last pulled `seq`, time of the last sync), `device` (this device's id and token, §6.8). Mirror rows keep the sync fields; tombstones stay in the mirror and readers filter `deleted_at`.

### 6.4 Sync

- The server is authoritative. Clients apply changes optimistically to Dexie and enqueue mutations in `outbox`.
- **Push** `POST /api/sync/push` takes `{ mutations: [{ mutationId, groupId, entity, op: upsert|delete, row }] }` (at most 100; protocol schemas in `packages/core/src/sync.ts`).
  - Entities: `exercises`, `equipment_items`, `workout_labels`, `workouts`, `sets`, `athlete_profile`, `settings`. `threads` / `messages` are pulled but never pushed: only the server (agent) writes them.
  - `groupId` is the client's change group, one per user action (D41). An upsert carries the full domain row; the server sets `created_at`, `updated_at`, `deleted_at`, `seq`. A delete (`row: { id }`) leaves a tombstone.
  - The server validates with the core zod schemas, then references: a set needs its workout and exercise (in D1, tombstones included, or upserted earlier in the push) and the value its exercise measures; a workout's `label_id` needs its label the same way. The profile and settings must use their fixed ids (D41).
  - Mutations whose `mutationId` was applied before are skipped (`duplicate`). The rest are applied in order in **one D1 batch** (a transaction): per change, `sync_counter` is bumped and the row is written with the new `seq` and logged in `change_log`; every `mutationId` goes to `applied_mutations`.
  - An invalid mutation rejects the whole push: `400 { error: 'invalid_mutation', index }`, nothing written. A write that changes nothing gets no `seq` and no `change_log` row.
  - The response is `{ results: [{ mutationId, status: applied|duplicate }] }`. Two pushes racing on the same `mutationId` can't both apply: the second batch fails on `applied_mutations` and the client retries.
  - Accepted risk: `before` snapshots are read just before the batch, so a write to the same row from the other device in that window (milliseconds) leaves a stale `before`.
- **Pull** `GET /api/sync/pull?since=<seq>&limit=<n>` (limit ≤ 500, default 500) returns `{ changes: [{ entity, row }], seq, hasMore }`: rows with `seq > since` across all tables in `seq` order, tombstones included, each in its core shape plus the sync fields. `seq` is the cursor for the next pull.
- Conflicts are resolved **last-write-wins** in server-apply order (single user, two devices; per-field merge not needed). An upsert of a tombstoned row brings it back.
- **Undo** `POST /api/changes/:groupId/undo` (`{ confirm? }`): each record of the group goes back to its first `before` (a record the group created becomes a tombstone), written as a new group with `undo_of` through the same path. A record whose current `seq` differs from the group's last change to it is a conflict: `409 { error: 'conflict', conflicts }` unless `confirm: true`. The response is `{ groupId }` of the undo group, or `{ groupId: null }` when nothing changed (nothing is written). A group is undone once, concurrent requests included: `409 { error: 'already_undone', groupId }` names the undo group, so a client that lost the response can still redo; undoing the undo group redoes it.
- The seed catalog reaches D1 as a generated migration (D40) and syncs to devices like any row.
- Agent writes happen server-side and reach clients via pull. The client pulls after push, after each agent turn, on app resume, and periodically while in the foreground.
- **Client** (D43, `apps/web/src/db`, `src/sync`):
  - A user action is one Dexie transaction: the mirror rows and one outbox mutation per change, all with the action's `groupId`. Mutations are validated with the core schemas before they are queued.
  - A sync run pushes the outbox in order (batches of 100), then pulls until `hasMore` is false. A pulled row doesn't replace a record that still has queued mutations; their push moves the server to the local state and a later pull returns it.
  - Runs: on start, when the network comes back, on return to the app, every 60 s in the foreground and 1 s after a write.
  - A rejected push (`400`) stays queued and is shown in the sync status; the pull still runs. A `401` (revoked token) forgets the token and opens the pairing screen; the mirror and outbox stay and are pushed after pairing again.

### 6.5 API surface (v1)

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/pairing` | Authorized device creates a one-time pairing code (TTL 5 min) |
| `POST /api/auth/pairing/redeem` | New device exchanges code + name for its token (rate-limited) |
| `GET /api/devices`, `DELETE /api/devices/:id` | List / revoke devices |
| `POST /api/sync/push`, `GET /api/sync/pull` | Sync (§6.4) |
| `POST /api/agent/chat` | Streaming agent turn `{ threadId, message, role?, localTime }` (§6.6): `message` is the new user message (text parts only), `localTime` the user's local time with offset; streams UI message chunks; `409 provider_unavailable` when the role's provider has no key |
| `POST /api/agent/proposals/:id/confirm` / `reject` | Risky tool confirmation (D50): `{ status, changes, groupId? }`; `409 not_pending` once resolved, `409 stale` when the call no longer fits the data (it stays pending) |
| `POST /api/changes/:groupId/undo` | Undo a change group (`{ confirm? }` overrides conflicts) |
| `GET /api/providers` | Provider status (configured ✓/✗) and model settings |

### 6.6 Agent runtime and tool registry

- The agent runs in the Worker using the AI SDK (`streamText` with tools, at most 8 model calls per turn), streamed to the client as UI message chunks (`@ai-sdk/vue` on the client). Tool-input deltas are left out of that stream: a card needs the complete input, and each delta would make the server and the client re-parse the partial JSON (LW-15). Each turn logs `{"chatTurn":{"isolateTurn","steps"}}` for Workers Logs (§9).
- A turn (`apps/api/src/agent/chat.ts`): the user message is stored first (creating the thread, dated by `localTime`), so a failing model never loses it; the assistant message (text, tool calls and results) is stored when the stream ends, also if the client went away. Both go through `applyWrites`; clients pull them like other data.
- Context per request:
  - System prompt (rules §5.9.2, conventions §5.1) and compact catalog (ids + names + aliases + measure): the stable prefix.
  - Local date, time and weekday from `localTime` (also the day and `performed_at` of logged sets), athlete profile, equipment summary, balance snapshot (hard sets per group, last 7 days; read from the window's sets and each exercise's last working set before it, never the whole history): a second system message.
  - Current thread: the stored messages of `threadId`; the client sends only the new message.
  - Details are fetched via tools.
  - For Anthropic, the stable prefix gets a cache breakpoint, so tools + rules + catalog are cached together.
- **Tool registry** (`apps/api/src/tools`): each tool is `{ name, description, input: zod schema, risk: read|write|risky, handler }`. The same registry backs the in-app agent and the MCP server (phase 2). The input JSON Schemas are built once per isolate, at import: given a bare zod schema, the AI SDK converts it again in every model step.
  - Handlers read D1 and compute with core; ids and dates are plain strings in the input schemas (providers differ in the string formats they accept) and are checked by the handlers.
  - Writes go through the server mutation path (`applyWrites`: core schemas, references, `change_log` with `actor: agent` and the thread); each call is one change group. A write tool returns the change card `{ groupId, changes: [{ entity, id, op: create|update|delete, before, after }] }`.
  - A call that can't run (unknown exercise, missing reps, a future day, a planned set where a done one is needed) returns `{ error: <code>, … }` to the model instead of failing the turn.
- Risky tools don't execute (D50). They store a `pending_proposal` and return `{ proposalId, status: pending, changes }` for the confirmation card. Confirmation runs the tool again on the current data as one change group.
- v1 tools:
  - **read:** `find_exercise`, `get_exercise_history`, `get_workouts` (date range, planned and done), `get_active_workout`, `get_records`, `get_balance`, `get_progression_hints`, `get_swap_options`, `get_weekly_summary`, `get_profile`, `get_equipment`
  - **write:** `log_sets` (done sets; completes matching planned sets first), `update_set` (single done set), `copy_workout` (optional `light`), `edit_planned_sets`, `start_workout`, `finish_workout`, `undo_change`
  - **risky:** `delete_sets`, `update_sets` (more than one done set), `create_exercise`, `update_exercise`, `update_profile`, `update_settings`, `propose_workout` (§5.9.6, D53)
  - Internal to the proposal flow, not offered to the model: `propose_plan`, the checked plan from the `planner` role as a stored proposal; accepting it writes planned sets.

### 6.7 Model provider layer

- Built on the Vercel AI SDK (`ai` 7) provider packages (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`), in `apps/api/src/agent/providers.ts`.
- Our own **registry** maps `provider → { secretName, createModel(modelId) }`. A provider is available iff its secret exists.
- Model ids are **settings** (`models`), not code, because they change faster than the app. Without a saved choice both roles take the defaults of the first configured provider (Anthropic, OpenAI, Gemini in this order):

  | Provider | `fast` | `planner` |
  |---|---|---|
  | Anthropic | `claude-haiku-5-5` | `claude-sonnet-5-5` |
  | OpenAI | `gpt-6-luna` | `gpt-6-sol` |
  | Gemini | `gemini-3.8-flash` | `gemini-pro-latest` |
- A role whose provider has no key fails with `provider_unavailable`; there is no silent fallback to another provider.
- Optional plain variables `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `GOOGLE_GENERATIVE_AI_BASE_URL` point a provider at another endpoint (a proxy such as AI Gateway; `profile:chat` points Anthropic at a local replay of fixed model streams).
- `GET /api/providers` returns per provider `{ id, configured, defaults }` (never a key) and the effective `models`.
- Adding a provider (e.g. an OpenAI-compatible endpoint for Ollama) = registry entry + secret + eval run.

### 6.8 Security

- **API keys:** Worker secrets only (`wrangler secret put ANTHROPIC_API_KEY | OPENAI_API_KEY | GOOGLE_GENERATIVE_AI_API_KEY`). Local dev uses `.dev.vars` (gitignored). Keys are never stored in D1, never sent to clients, never logged.
- **Device tokens:** 32 random bytes (base64url), shown once. Only the SHA-256 hash is stored. Sent as `Authorization: Bearer`.
  - First token: `pnpm --filter @liftwise/api device:create <name> [--remote]` (writes the hash via wrangler, prints the token once; `--remote` for the deployed D1, `docs/deploy.md`).
  - Next devices: QR pairing; codes are single-use, TTL 5 min, rate-limited.
    - Code: 8 characters from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (no 0/O, 1/I), shown as QR and text; redeem accepts any case, spaces and dashes. Only the SHA-256 hash is stored; a new code replaces any unused one.
    - Limit: global, 5 failed redeems in 10 minutes → `429` for every redeem (single user, deterministic). Wrong, expired and used codes return the same `invalid_code`. Each attempt is recorded and counted in one D1 batch, so parallel requests can't exceed the limit; a blocked attempt doesn't extend the block.
    - Revoking a device also deletes the unused codes it created. The redeem response is `Cache-Control: no-store`.
    - The app shows the code with a QR code of `<origin>/pair?code=<code>`, which opens the pairing screen with the code filled in. The pairing screen also takes the first device's token from `device:create`.
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
| Calendar, copy workout, editing planned sets | ✅ | Outbox syncs later |
| Active workout logging, rest timer | ✅ | Outbox syncs later |
| History, charts, records | ✅ | From local mirror |
| Progression hints, balance guard, weekly summary, swap suggestions | ✅ | Pure core functions |
| Data export | ✅ | From the last synced local mirror |
| Catalog / equipment / settings edits | ✅ | Synced later |
| Voice → text | ✅ Android with offline language pack; PC needs network | |
| Agent (logging, Q&A, edits) | ⏳ | Queued (§5.9.8) |
| Workout proposal (planner) | ❌ | Copying and progression hints still work |
| Device pairing, undo of agent changes | ❌ | Server-side operations |

### 6.10 Platforms and distribution

- **Server:** Worker `liftwise` (API + PWA) and D1 `liftwise` on Cloudflare Workers Free (D51). Deploy with `pnpm deploy:api`; first setup, secrets, logs and the services to log in to: `docs/deploy.md`.
- **Android:** Capacitor app built from `apps/web` (`apps/web/android/`, D47). App id `io.github.d_buczek.liftwise`. Setup, signing and install: `docs/android.md`.
  - Native plugins:
    - local notifications (rest timer)
    - haptics
    - keep-awake
    - filesystem + share (data export through the share sheet, §5.12)
    - speech recognition (`@capgo/capacitor-speech-recognition`, D52)
    - Keystore-backed secure storage
- **Install via ADB over Wi-Fi** (Wireless debugging, Android 11+):
  - One-time setup: `adb pair <ip:port> <code>`.
  - Each install/update: `adb connect <ip:port>` + `adb install -r app-release.apk`, wrapped as `pnpm android:install [ip:port]` (builds first; `pnpm android:build` builds only).
  - Google's developer-verification FAQ states that ADB installs don't require verification and are not subject to the advanced flow's 24-hour wait.
  - Fallbacks: a free **limited distribution** developer account (up to 20 devices, no ID) or the one-time **advanced flow**.
- **Signing:**
  - Own release keystore kept outside the repo and backed up (password manager); Gradle reads its path and passwords from `~/.gradle/gradle.properties`.
  - Losing it means uninstall/reinstall, which wipes only the local mirror; server data is safe.
  - CI signing via GitHub secrets later.
- **PC:** PWA served by the same Worker (static assets), installed from Edge/Chrome.
- **Dev:**
  - `wrangler dev` with local D1; `pnpm --filter @liftwise/api dev` builds the PWA first and serves it on the same origin.
  - Vite dev server with `/api` proxy to `wrangler dev`.
  - Capacitor live reload on the phone.
- **Toolchain to install:**
  - Android Studio (Android SDK, platform-tools/adb) and JDK 21: the Gradle 8.14 of the Capacitor 8 template doesn't run on the JDK 25 bundled with Android Studio.
  - Cloudflare account (wrangler is a devDependency).
  - Later: GitHub CLI.

### 6.11 MCP server (phase 2)

- Endpoint `/mcp` on the same Worker (Streamable HTTP), exposing the tool registry (§6.6).
- Risky tools keep the proposal/confirm semantics: the MCP client gets the diff and must call a confirm tool.
- Step 1: device-token auth (works for Claude Code and other clients that send a header).
- Step 2: OAuth (required by claude.ai custom connectors), e.g. Cloudflare's Workers OAuth provider library.

## 7. Quality

- **Unit tests (Vitest):** core (copy workout incl. light copy, swap suggestions, progression hint rules incl. timed, balance math, e1RM/records, weekly summary, export format, catalog schema), sync apply/idempotency, undo.
- **API integration tests:** Workers Vitest integration (`@cloudflare/vitest-plugin`, formerly `vitest-pool-workers`) under `vp test`: tests run in workerd against a local D1, reset and migrated before each test.
- **End-to-end tests (Playwright, `e2e/`):** the whole app in the installed Chrome against the built PWA and a real API on a throwaway local D1, on a phone profile (375 px, touch) and a desktop one: pairing, every screen opening without a page error, logging with a typed weight, editing and undoing a set, the rest timer, offline logging reaching another device, the calendar's arrows and swipe, labels and copies. Run with `pnpm e2e`; not part of `ci:check` (minutes, not seconds). Playwright stays in its own package: as a dependency of `apps/web` it makes pnpm install a second copy of Vitest, and the core tests fail.
- **Agent evals** (`evals/`): Polish utterances → expected tool calls/args. Covers logging variants (incl. timed: "plank 3x45 s"), copying and planning ("skopiuj czwartek na sobotę", "skopiuj lżej"), ambiguity → question, risky → proposal. Run manually per provider (`pnpm eval --provider anthropic`). Costs tokens, so not in CI.
- **CI (GitHub Actions)** is thin; each job runs one pnpm script:
  - `pnpm ci:check` (lint, typecheck, test)
  - `pnpm ci:build`
  - `pnpm deploy:api` on `main` (Cloudflare API token secret), later; for now it runs from the PC (D51)
  - gitleaks
  - APK artifact build later

## 8. Milestones and ticket breakdown

Each line is meant to be one `/ticket` task.

| Ticket | Scope |
|---|---|
| LW-01 | Monorepo scaffold: pnpm workspaces, strict TS, Vite+ toolchain (Oxlint, Oxfmt, Vitest), thin GitHub Actions CI, gitleaks |
| LW-02 | Core schemas (zod) + conventions (incl. reps/timed sets, exercise note) + seed catalog JSON (40–60 exercises, PL names, aliases, tags) with validation tests |
| LW-03 | Core logic: copy workout (incl. light copy), swap suggestions, progression hints, e1RM/records, balance, weekly summary, export format, with tests |
| LW-04 | API skeleton: Hono on Workers, D1 + Drizzle schema & migrations, device auth (CLI bootstrap, QR pairing), CORS |
| LW-05 | Sync: push/pull, `seq`, idempotency, `change_log`, undo, seed catalog into D1, with tests |
| LW-06 | Web shell: Vue + Ionic + Pinia + vue-i18n (pl) + Dexie mirror/outbox + PWA; pairing screen; settings (equipment, devices) |
| LW-07 | Calendar (planned/done), copy workout (incl. light), editing a day with progression hints and swap suggestions, active workout screen (reps/timed, setup note), history, in-app rest timer |
| LW-08 | Capacitor Android: build, native plugins, `pnpm android:install` (ADB), signing doc |
| LW-09 | Agent core: provider registry (Anthropic/OpenAI/Gemini), roles, tool registry with risk levels, streaming chat, threads, profile; chat UI with change/confirmation cards |
| LW-10 | Voice input (Android STT, Web Speech on PC) + offline prompt queue |
| LW-11 | Optional workout proposal flow: check-in → plan → planned sets on a day |
| LW-12 | Charts & records UI, balance guard dashboard, weekly summary card, data export |
| LW-13 | Agent eval suite |
| LW-14 | Workout labels (training sets such as A / B) with colors: synced entity, shown on the calendar, day and history; a copy keeps the label and the copy dialog offers "the last A / B" |
| LW-15 | Agent CPU on Workers Free: profile a chat turn in workerd, cut the CPU per model step (tool schemas, context, message persistence), measure again on the deployed Worker (§9) |
| LW-16 | One-time import of the earlier training history (D2) |
| LW-17 | A field to type a weight, next to the ± step (changes D1) |
| LW-19 | Fix the bugs the test pass found: mic left on, silent failed undo, double taps, dropped agent edits, a blank start on unreadable storage, the proposal's UTC date |
| LW-20 | Phase 2: MCP endpoint with token auth |
| LW-21 | Phase 2: OAuth for claude.ai connectors |

## 9. Open items to verify during implementation

| Item | Resolve in | Note |
|---|---|---|
| Workers Free limits under agent loops | Measured in LW-09, CPU cut in LW-15 | Limits: 10 ms CPU per request (with tolerance for occasional overruns, error 1102 when consistently exceeded), 50 external subrequests, 1,000 to Cloudflare services (D1). Measured on 2026-11-01 (Anthropic `claude-haiku-5-5`, `wrangler tail`): a chat turn takes **54–265 ms CPU**, about 50–100 ms per model step (175–265 ms on a cold isolate), 1.6–5.2 s wall, 1–2 model steps (= external subrequests); sync 3–8 ms, undo 8 ms. Every turn finished with outcome `ok`. **LW-15** (`profile:chat`: workerd CPU profile of fixed turns, the model replayed; and `wrangler tail` before/after on production, ~60 turns): cut tool schemas converted in every step (now once per isolate), the balance context loading the whole history (now the window + the last working set per exercise), a per-comparison Polish collator and re-parsing the partial tool input on every stream chunk. Locally (PC) a cold turn went from 91 to 57 ms, warm turns 22–36 → 13–30 ms. On production the app's share is small: warm one-step turns 21–51 ms, two-step 94–184 ms, a cold two-step turn 305 ms, about the same as before (two-step 102–128 ms) — the rest, ~50–70 ms per step, is the AI SDK and the provider handling the stream (per chunk, ~25–30 text chunks per answer) and could not be attributed further (production profiling answered "No recent executions"). Each turn logs `{"chatTurn":{"isolateTurn","steps"}}` (1 = cold isolate) next to its CPU time. All turns `ok`, no 1102. **LW-11:** one workout proposal on production on 2026-11-04 (`claude-haiku-5-5` routes, `claude-sonnet-5-5` plans, a cold isolate): 112 ms CPU, 13.9 s wall, outcome `ok`. After the check-in stopped going through `fast` (D53), with equipment and a profile set: 121 ms CPU on a cold isolate, 21.6 s wall, `ok`. These are single samples on a nearly empty database, so they say little about the hints' cost with a long history. Staying on Free (D51) |
| ~~AI SDK current major~~ | Resolved in LW-09 | `ai` 7 / `@ai-sdk/vue` 4; built-in tool approval doesn't fit §5.9.3 (D50) |
| ~~Exact rest-timer notifications~~ | Resolved in LW-08 | `USE_EXACT_ALARM` (sideloaded APK, D47) + `allowWhileIdle`: on a real phone the notification came on time and vibrated with the screen locked. Some vendors also need a setting for ADB installs (`docs/android.md`) |
| Speech-recognition plugin | Picked in LW-10, one check left | `@capgo/capacitor-speech-recognition` 8.x (Capacitor 8 peer); the community plugin stops at 7.0.1 (D52). On 2026-11-02 on a real phone the APK builds and prompts from the phone get the model's answers on production. Still to confirm: a series spoken in airplane mode logged with the time it was sent |
| Default OpenAI/Gemini model ids | Picked in LW-09, verify with keys | §6.7: the cheapest current tier for `fast` (OpenAI's model list, Google's "use for new projects" note); not yet run without OpenAI/Gemini keys. `gemini-3.8-flash` is on Gemini's free tier, which may use the content to improve Google's products |
| ~~Capacitor app id~~ | Resolved in LW-08 | `io.github.d_buczek.liftwise`: a hyphen isn't allowed, so the GitHub login `d-buczek` becomes `d_buczek` (Java package convention) |
| ~~D1 Time Travel retention~~ | Resolved in LW-04 | Always on; 7 days on Workers Free, 30 days on Workers Paid (§5.12) |

## 10. References

- Android developer verification FAQ (ADB exemption, limited distribution, advanced flow): https://developer.android.com/developer-verification/guides/faq
- Android developer verification timeline: https://developer.android.com/developer-verification
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/

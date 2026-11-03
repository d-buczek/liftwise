// CPU profile of agent chat turns in workerd (LW-15, §9): `pnpm --filter @liftwise/api profile:chat`.
// `wrangler dev` runs on its own local D1 (.wrangler/profile) seeded with a year of training; the
// Anthropic provider points at a local server that replays fixed model streams, so every run makes
// the same model steps at no cost and without a key. The DevTools protocol samples the CPU of each
// turn; the report gives CPU per scenario, self time per package and the hottest functions.
// Absolute numbers are this PC's, not Cloudflare's: compare runs, not limits.
import { execFileSync, spawn } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { v7 } from 'uuid';
import exercisesJson from '../../../packages/core/data/exercises.json' with { type: 'json' };
import { generateToken, sha256Hex } from '../src/auth/tokens.ts';

const { values } = parseArgs({ options: { runs: { type: 'string', default: '10' } } });
const RUNS = Number(values.runs);
const PORT = 8790;
const INSPECTOR_PORT = 9230;
const SAMPLING_US = 100;

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const persist = join(apiDir, '.wrangler', 'profile');
const wrangler = fileURLToPath(new URL('../bin/wrangler.js', import.meta.resolve('wrangler')));

// --- Scenarios: what the user says and the model steps the replay answers with ---------------

const BENCH = '01a18f41-8c00-7000-8000-000000000001';
const ROW = '01a18f41-8c00-7000-8000-00000000000b';

type Scenario = {
  name: string;
  prompt: string;
  tool?: { name: string; input: unknown };
  answer: string;
};

const SCENARIOS: Scenario[] = [
  {
    name: 'log_sets',
    prompt: 'wyciskanie na płaskiej 24 kg 4x10',
    tool: {
      name: 'log_sets',
      input: { exercise_id: BENCH, sets: Array(4).fill({ weight_kg: 24, reps: 10 }) },
    },
    answer: 'Zapisane: wyciskanie hantli na ławce płaskiej, 4 serie po 10 powtórzeń z 24 kg.',
  },
  {
    name: 'history',
    prompt: 'kiedy ostatnio robiłem wiosłowanie jednorącz i z jakim ciężarem?',
    tool: { name: 'get_exercise_history', input: { exercise_id: ROW, sessions: 3 } },
    answer: 'Ostatnio w piątek: wiosłowanie hantlą jednorącz, 3 serie po 10 powtórzeń z 30 kg.',
  },
  {
    name: 'reply',
    prompt: 'dzięki, to wszystko na dziś',
    answer: 'Proszę bardzo, udanej regeneracji!',
  },
  {
    name: 'propose_workout',
    prompt: 'zaproponuj trening, mam 30 minut',
    tool: { name: 'propose_workout', input: { time_min: 30 } },
    // The plan card ends the turn.
    answer: '',
  },
];

const plannedSets = (weight_kg: number) =>
  Array(3).fill({ weight_kg, reps: 10, duration_s: null, warmup: false });

// What the `planner` model answers for `propose_workout`, in one piece.
const PLAN = {
  exercises: [
    { exercise_id: BENCH, sets: plannedSets(24), target_rir: 1 },
    { exercise_id: ROW, sets: plannedSets(30), target_rir: 1 },
  ],
  rationale: 'Trzydzieści minut wystarczy na dwa główne ćwiczenia, bez zmian ciężaru.',
};

// --- Replay of the Anthropic Messages stream -------------------------------------------------

type AnthropicRequest = {
  messages: { role: string; content: string | { type: string; text?: string }[] }[];
  stream?: boolean;
  tools?: { name: string }[];
};

// A call without streaming is the `planner`'s. The SDK asks for structured output natively, or
// through a forced `json` tool for a model it doesn't know that of.
function plannerMessage(request: AnthropicRequest) {
  const forcedTool = request.tools?.find((tool) => tool.name === 'json');
  return {
    id: `msg_${v7()}`,
    type: 'message',
    role: 'assistant',
    model: 'replay',
    content: forcedTool
      ? [{ type: 'tool_use', id: `toolu_${v7()}`, name: forcedTool.name, input: PLAN }]
      : [{ type: 'text', text: JSON.stringify(PLAN) }],
    stop_reason: forcedTool ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 4000, output_tokens: 300 },
  };
}

const chunks = (text: string, size: number) =>
  Array.from({ length: Math.ceil(text.length / size) }, (_, i) =>
    text.slice(i * size, i * size + size),
  );

function replayEvents(request: AnthropicRequest): { events: object[]; scenario?: Scenario } {
  const first = request.messages[0]?.content;
  const said = typeof first === 'string' ? first : (first ?? []).map((part) => part.text).join('');
  const scenario = SCENARIOS.find((entry) => said.includes(entry.prompt));
  const last = request.messages.at(-1)?.content;
  const answered = Array.isArray(last) && last.some((part) => part.type === 'tool_result');
  const block =
    scenario?.tool && !answered
      ? {
          start: { type: 'tool_use', id: `toolu_${v7()}`, name: scenario.tool.name, input: {} },
          // About a token per text delta and a few per JSON delta, like the real stream.
          deltas: chunks(JSON.stringify(scenario.tool.input), 12).map((partial_json) => ({
            type: 'input_json_delta',
            partial_json,
          })),
          stop: 'tool_use',
        }
      : {
          start: { type: 'text', text: '' },
          deltas: chunks(scenario?.answer ?? 'OK.', 4).map((text) => ({
            type: 'text_delta',
            text,
          })),
          stop: 'end_turn',
        };
  const usage = {
    input_tokens: 400,
    cache_read_input_tokens: 3600,
    cache_creation_input_tokens: 0,
  };
  const events = [
    {
      type: 'message_start',
      message: {
        id: `msg_${v7()}`,
        type: 'message',
        role: 'assistant',
        model: 'replay',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { ...usage, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: block.start },
    { type: 'ping' },
    ...block.deltas.map((delta) => ({ type: 'content_block_delta', index: 0, delta })),
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: block.stop, stop_sequence: null },
      usage: { output_tokens: block.deltas.length },
    },
    { type: 'message_stop' },
  ];
  return { events, scenario };
}

let modelCalls = 0;
const replay = createServer((req, res) => {
  let body = '';
  req.on('data', (data) => (body += data));
  req.on('end', async () => {
    modelCalls += 1;
    const request = JSON.parse(body) as AnthropicRequest;
    if (!request.stream) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(plannerMessage(request)));
      return;
    }
    const { events } = replayEvents(request);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    // One network chunk per event, as from the API.
    for (const event of events) {
      res.write(`event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    res.end();
  });
});

// --- Local D1: migrations, a device and a year of training -----------------------------------

const sqlValue = (value: string | number | null) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${value.replaceAll("'", "''")}'`;

type SqlRow = Record<string, string | number | null>;

function inserts(table: string, rows: SqlRow[]): string[] {
  const statements: string[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const columns = Object.keys(batch[0] as object);
    const tuples = batch.map(
      (row) => `(${columns.map((key) => sqlValue(row[key] ?? null)).join(', ')})`,
    );
    statements.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${tuples.join(',\n')};`);
  }
  return statements;
}

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// Mon / Wed / Fri for a year up to yesterday, sessions A and B alternating, 3 working sets each
// (and a warm-up on the first exercise); weights creep up over the year.
function trainingYear(today: string, offset: string) {
  type Entry = { id: string; measure: string };
  const reps = (exercisesJson as Entry[]).filter((entry) => entry.measure === 'reps');
  const sessionA = [
    BENCH,
    ROW,
    ...reps
      .map((e) => e.id)
      .filter((id) => id !== BENCH && id !== ROW)
      .slice(0, 4),
  ];
  const sessionB = reps
    .map((e) => e.id)
    .filter((id) => !sessionA.includes(id))
    .slice(0, 6);
  const workouts: SqlRow[] = [];
  const sets: SqlRow[] = [];
  let session = 0;
  for (let day = 365; day >= 1; day -= 1) {
    const date = addDays(today, -day);
    if (![1, 3, 5].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
    const at = (minute: number) => `${date}T18:${String(minute).padStart(2, '0')}:00.000${offset}`;
    const workoutId = v7();
    const stamp = `${date}T19:00:00.000Z`;
    const synced = { created_at: stamp, updated_at: stamp, deleted_at: null, seq: 0 };
    workouts.push({
      id: workoutId,
      ...synced,
      date,
      started_at: at(0),
      ended_at: at(55),
      note: '',
    });
    const exercises = session % 2 === 0 ? sessionA : sessionB;
    session += 1;
    let position = 0;
    for (const [index, exerciseId] of exercises.entries()) {
      const weight = 10 + index * 2 + Math.floor((365 - day) / 60) * 2;
      const plan = index === 0 ? [true, false, false, false] : [false, false, false];
      for (const warmup of plan) {
        sets.push({
          id: v7(),
          ...synced,
          workout_id: workoutId,
          exercise_id: exerciseId,
          position: position++,
          status: 'done',
          weight_kg: warmup ? weight / 2 : weight,
          reps: 10,
          duration_s: null,
          rir: warmup ? null : 2,
          warmup: warmup ? 1 : 0,
          note: '',
          performed_at: at(Math.min(position * 2, 54)),
          source: 'manual',
        });
      }
    }
  }
  return { workouts, sets };
}

function runWrangler(args: string[]) {
  execFileSync(process.execPath, [wrangler, ...args], {
    cwd: apiDir,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

// The user's wall clock with its offset, like the app's `localTime`.
function localTime(date = new Date()): string {
  const offset = -date.getTimezoneOffset();
  const local = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 23);
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${local}${offset >= 0 ? '+' : '-'}${hh}:${mm}`;
}

async function prepareDatabase(): Promise<string> {
  rmSync(persist, { recursive: true, force: true });
  mkdirSync(persist, { recursive: true });
  runWrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', persist]);
  const token = generateToken();
  const now = localTime();
  const { workouts, sets } = trainingYear(now.slice(0, 10), now.slice(23));
  const sql = [
    ...inserts('devices', [
      { id: v7(), name: 'profile', token_hash: await sha256Hex(token), created_at: now },
    ]),
    ...inserts(
      'equipment_items',
      [
        { type: 'dumbbells', props: '{"max_kg":40}' },
        { type: 'bench', props: '{"incline":true,"decline":false}' },
      ].map((item) => ({
        id: v7(),
        ...item,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        seq: 0,
      })),
    ),
    ...inserts('workouts', workouts),
    ...inserts('sets', sets),
  ].join('\n');
  const file = join(persist, 'seed.sql');
  writeFileSync(file, sql);
  runWrangler(['d1', 'execute', 'DB', '--local', '--persist-to', persist, '--file', file]);
  console.log(`Seeded ${workouts.length} workouts, ${sets.length} sets.`);
  return token;
}

// --- DevTools protocol ------------------------------------------------------------------------

type CallFrame = { functionName: string; url: string; lineNumber: number };
type ProfileNode = { id: number; callFrame: CallFrame; children?: number[] };
type CpuProfile = { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] };

async function inspector() {
  const [target] = (await (await fetch(`http://127.0.0.1:${INSPECTOR_PORT}/json/list`)).json()) as {
    webSocketDebuggerUrl: string;
  }[];
  // wrangler's inspector proxy accepts local origins only.
  const socket = new WebSocket(target!.webSocketDebuggerUrl, {
    headers: { origin: 'http://localhost' },
  } as unknown as string[]);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map<number, (result: unknown) => void>();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown };
    if (message.id !== undefined) pending.get(message.id)?.(message.result);
  });
  const send = <T>(method: string, params: object = {}) =>
    new Promise<T>((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve as (result: unknown) => void);
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => socket.close() };
}

// --- Attribution: bundle line → module (esbuild's `// path` markers) → package ---------------

const modulesByUrl = new Map<string, { line: number; path: string }[]>();

// wrangler dev names its bundle `index.js`: the newest .wrangler/tmp/dev-*/index.js.
function scriptFile(url: string): string | undefined {
  if (url.startsWith('file:')) return fileURLToPath(url);
  if (url !== 'index.js') return undefined;
  const tmp = join(apiDir, '.wrangler', 'tmp');
  return readdirSync(tmp)
    .filter((dir) => dir.startsWith('dev-'))
    .map((dir) => join(tmp, dir, 'index.js'))
    .filter((file) => existsSync(file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

function modulesOf(url: string) {
  let modules = modulesByUrl.get(url);
  if (modules) return modules;
  modules = [];
  const file = scriptFile(url);
  if (file) {
    for (const [line, text] of readFileSync(file, 'utf8').split('\n').entries()) {
      const marker = /^\/\/ ([\w./@+-]+\.(?:[cm]?[jt]s|json))$/.exec(text);
      if (marker) modules.push({ line, path: marker[1] as string });
    }
  }
  modulesByUrl.set(url, modules);
  return modules;
}

function moduleOf({ url, lineNumber }: CallFrame): string | undefined {
  // The runtime's own JS (D1 client, tracing).
  if (url.startsWith('cloudflare-internal:')) return url;
  let found: string | undefined;
  for (const entry of modulesOf(url)) {
    if (entry.line > lineNumber) break;
    found = entry.path;
  }
  return found;
}

function packageOf(path: string): string {
  if (path.startsWith('cloudflare-internal:')) return `workerd ${path.split(':')[1]}`;
  const parts = path.split('/');
  const index = parts.lastIndexOf('node_modules');
  if (index >= 0) {
    const name = parts[index + 1] as string;
    return name.startsWith('@') ? `${name}/${parts[index + 2]}` : name;
  }
  if (path.includes('packages/core/')) return '@liftwise/core';
  if (path.startsWith('src/')) return 'api';
  return 'other';
}

// What a sample was doing, by the frames on its stack (`name@module`), first match wins. Work
// after an `await` has no caller frames, e.g. drizzle mapping D1 rows: it counts per package.
const ACTIVITIES: [string, RegExp][] = [
  ['tool schemas (zod → JSON Schema)', /^(toJSONSchema|get jsonSchema)@/],
  ['tool handlers', /^runTool@/],
  ['message writes', /^applyWrites@/],
  ['auth', /^(verifyToken|bearerAuth\w*)@/],
  [
    'turn context',
    /@src\/tools\/data\.ts$|^(balanceSnapshot|systemMessages|threadMessages|modelSettings)@/,
  ],
  ['partial tool input JSON', /^parsePartialJson@/],
  ['provider stream', /node_modules\/(@ai-sdk\/anthropic|eventsource-parser)\/|^safeParseJSON@/],
  [
    'prompt conversion',
    /^(convertToModelMessages|standardizePrompt|convertToLanguageModelPrompt)@/,
  ],
];

type Breakdown = {
  cpu: number;
  gc: number;
  activities: Map<string, number>;
  functions: Map<string, number>;
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

// workerd samples about every 0.5 ms while JavaScript runs; while the isolate waits (the model
// stream) samples come rarely and have no JavaScript frame — a native frame right under the root,
// or `(program)`. CPU = samples with a JavaScript frame + GC, each worth at most two busy
// sampling intervals. Native frames (JSON.parse, …) count for their caller.
function breakdown(profile: CpuProfile): Breakdown {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map<number, ProfileNode>();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) parents.set(child, node);
  }
  const cap = 2 * median(profile.timeDeltas.slice(1).filter((delta) => delta < 5000));
  const result: Breakdown = { cpu: 0, gc: 0, activities: new Map(), functions: new Map() };
  const add = (map: Map<string, number>, key: string, ms: number) =>
    map.set(key, (map.get(key) ?? 0) + ms);
  profile.samples.forEach((id, index) => {
    const ms = Math.min(profile.timeDeltas[index + 1] ?? 0, cap) / 1000;
    const node = nodes.get(id) as ProfileNode;
    const name = node.callFrame.functionName;
    if (name === '(garbage collector)') {
      result.gc += ms;
      result.cpu += ms;
      return void add(result.activities, 'gc', ms);
    }
    const stack: { frame: CallFrame; module: string | undefined }[] = [];
    for (let at: ProfileNode | undefined = node; at; at = parents.get(at.id)) {
      stack.push({ frame: at.callFrame, module: moduleOf(at.callFrame) });
    }
    const js = stack.find((entry) => entry.module !== undefined);
    if (!js) return;
    result.cpu += ms;
    const frames = stack.map(({ frame, module }) => `${frame.functionName}@${module ?? ''}`);
    const activity = ACTIVITIES.find(([, pattern]) => frames.some((frame) => pattern.test(frame)));
    add(result.activities, activity?.[0] ?? packageOf(js.module as string), ms);
    const own = moduleOf(node.callFrame);
    const where = own
      ? `${own.split('node_modules/').at(-1)}:${node.callFrame.lineNumber + 1}`
      : '(native)';
    add(result.functions, `${name || '(anonymous)'}  ${where}`, ms);
  });
  return result;
}

// --- Run ----------------------------------------------------------------------------------------

const fmt = (ms: number) => ms.toFixed(1).padStart(7);

async function main() {
  if (!existsSync(join(apiDir, '..', 'web', 'dist'))) {
    throw new Error('The PWA build is missing: run `pnpm --filter @liftwise/web build` first.');
  }
  const token = await prepareDatabase();
  await new Promise<void>((resolve) => replay.listen(0, '127.0.0.1', resolve));
  const replayUrl = `http://127.0.0.1:${(replay.address() as AddressInfo).port}/v1`;

  const log = createWriteStream(join(persist, 'wrangler.log'));
  const dev = spawn(
    process.execPath,
    [
      wrangler,
      'dev',
      '--port',
      String(PORT),
      '--inspector-port',
      String(INSPECTOR_PORT),
      '--persist-to',
      persist,
      '--var',
      'ANTHROPIC_API_KEY:replay',
      '--var',
      `ANTHROPIC_BASE_URL:${replayUrl}`,
    ],
    { cwd: apiDir, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  dev.stdout.pipe(log);
  dev.stderr.pipe(log);
  try {
    const base = `http://127.0.0.1:${PORT}`;
    for (let tries = 0; ; tries += 1) {
      if (tries > 120)
        throw new Error(`wrangler dev did not start, see ${join(persist, 'wrangler.log')}`);
      try {
        if ((await fetch(`${base}/health`)).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const { send, close } = await inspector();
    await send('Profiler.enable');
    await send('Profiler.setSamplingInterval', { interval: SAMPLING_US });

    const turn = async (scenario: Scenario) => {
      modelCalls = 0;
      await send('Profiler.start');
      const response = await fetch(`${base}/api/agent/chat`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: v7(),
          message: { id: v7(), role: 'user', parts: [{ type: 'text', text: scenario.prompt }] },
          localTime: localTime(),
        }),
      });
      const text = await response.text();
      if (!response.ok || text.includes('"type":"error"')) {
        throw new Error(`${scenario.name}: ${response.status} ${text.slice(0, 300)}`);
      }
      // The assistant message is stored in waitUntil after the stream ends.
      await new Promise((resolve) => setTimeout(resolve, 300));
      const { profile } = await send<{ profile: CpuProfile }>('Profiler.stop');
      return { profile, steps: modelCalls };
    };

    // Mean ms per key over some turns, highest first.
    const merge = (results: Breakdown[], key: 'activities' | 'functions') => {
      const total = new Map<string, number>();
      for (const result of results) {
        for (const [name, ms] of result[key]) total.set(name, (total.get(name) ?? 0) + ms);
      }
      return new Map(
        [...total]
          .map(([name, ms]) => [name, ms / results.length] as const)
          .sort((x, y) => y[1] - x[1]),
      );
    };

    // The first turn of a fresh isolate pays for lazy initialisation (with one user, many
    // production turns are cold).
    const cold = await turn(SCENARIOS[0] as Scenario);
    writeFileSync(join(persist, 'cold.cpuprofile'), JSON.stringify(cold.profile));
    const groups = [{ name: 'cold', steps: cold.steps, runs: [breakdown(cold.profile)] }];
    for (const scenario of SCENARIOS) {
      const runs: Breakdown[] = [];
      let steps = 0;
      for (let run = 0; run < RUNS; run += 1) {
        const result = await turn(scenario);
        runs.push(breakdown(result.profile));
        steps = result.steps;
        if (run === RUNS - 1) {
          writeFileSync(
            join(persist, `${scenario.name}.cpuprofile`),
            JSON.stringify(result.profile),
          );
        }
      }
      groups.push({ name: scenario.name, steps, runs });
    }

    const col = (text: string | number) => String(text).padStart(9);
    console.log(`\nCPU per turn, ms (cold: first turn of the isolate; others: ${RUNS} runs)`);
    console.log('turn'.padEnd(10) + ['steps', 'median', 'min', 'max', 'gc'].map(col).join(''));
    for (const { name, steps, runs } of groups) {
      const cpu = runs.map((run) => run.cpu);
      const values = [
        median(cpu),
        Math.min(...cpu),
        Math.max(...cpu),
        median(runs.map((run) => run.gc)),
      ];
      console.log(name.padEnd(10) + col(steps) + values.map((ms) => col(ms.toFixed(1))).join(''));
    }

    const byGroup = groups.map(({ runs }) => merge(runs, 'activities'));
    const activities = merge(
      groups.flatMap(({ runs }) => runs),
      'activities',
    );
    console.log('\nWhere the CPU goes, ms per turn (mean)');
    console.log(''.padEnd(34) + groups.map(({ name }) => col(name)).join(''));
    for (const activity of [...activities.keys()].slice(0, 16)) {
      const cells = byGroup.map((group) => col((group.get(activity) ?? 0).toFixed(1)));
      console.log(activity.slice(0, 33).padEnd(34) + cells.join(''));
    }

    const warm = groups.slice(1).flatMap(({ runs }) => runs);
    console.log('\nHottest functions (self), ms per warm turn');
    for (const [name, ms] of [...merge(warm, 'functions')].slice(0, 15)) {
      console.log(`${fmt(ms)}  ${name}`);
    }
    console.log(`\nProfiles (open in DevTools → Performance): ${persist}`);
    close();
  } finally {
    replay.close();
    if (process.platform === 'win32' && dev.pid) {
      execFileSync('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      dev.kill('SIGINT');
    }
  }
}

await main();

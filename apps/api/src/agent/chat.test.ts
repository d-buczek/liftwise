import { newId } from '@liftwise/core';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  call,
  createDevice,
  db,
  push,
  repsExercise,
  timedExercise,
  upsert,
} from '../../test/helpers';
import type { AppEnv } from '../app-env';
import { messages, pendingProposals, sets, threads } from '../db/schema';
import { createChatRoutes } from './chat';
import { ProviderUnavailable } from './providers';

const NOW = '2026-10-31T18:00:00+01:00';

type StreamPart =
  Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer P>
    ? P
    : never;

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

// One model call: its stream parts, then the finish.
const step = (finish: 'stop' | 'tool-calls', ...parts: StreamPart[]) => ({
  stream: convertArrayToReadableStream<StreamPart>([
    { type: 'stream-start', warnings: [] },
    ...parts,
    { type: 'finish', finishReason: { unified: finish, raw: finish }, usage },
  ]),
});

const text = (id: string, delta: string): StreamPart[] => [
  { type: 'text-start', id },
  { type: 'text-delta', id, delta },
  { type: 'text-end', id },
];

// The chat routes on a mock model, behind the db middleware of the app (auth is tested there).
async function chat(model: MockLanguageModelV4, body: Record<string, unknown>) {
  const app = new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set('db', db());
      await next();
    })
    .route(
      '/',
      createChatRoutes(() => ({ provider: 'anthropic', model })),
    );
  const ctx = createExecutionContext();
  const response = await app.request(
    '/',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    env,
    ctx,
  );
  const stream = await response.text();
  await waitOnExecutionContext(ctx);
  return { status: response.status, stream };
}

const userMessage = (value: string) => ({
  id: newId(),
  role: 'user',
  parts: [{ type: 'text', text: value }],
});

const threadMessages = (threadId: string) =>
  db()
    .select({ role: messages.role, parts: messages.parts })
    .from(messages)
    .where(eq(messages.thread_id, threadId))
    .orderBy(asc(messages.created_at), asc(messages.id));

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

describe('a check-in or a regeneration', () => {
  const DATE = '2026-11-05';
  const LOCAL_TIME = '2026-11-04T07:00:00+01:00';

  const planOutput = (rationale: string) => ({
    exercises: [
      {
        exercise_id: repsExercise.id,
        sets: [{ weight_kg: 20, reps: 10, duration_s: null, warmup: false }],
        target_rir: 1,
      },
    ],
    rationale,
  });

  // No `doStream`: a call of the `fast` model fails the test.
  const planner = (...answers: unknown[]) =>
    new MockLanguageModelV4({
      doGenerate: answers.map((answer) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(answer) }],
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage,
        warnings: [],
      })),
    });

  const request = (threadId: string, value: string, workout: Record<string, unknown>) => ({
    threadId,
    message: userMessage(value),
    localTime: LOCAL_TIME,
    workout,
  });

  const planProposals = () =>
    db()
      .select({ status: pendingProposals.status, input: pendingProposals.input })
      .from(pendingProposals)
      .orderBy(asc(pendingProposals.id));

  beforeEach(async () => {
    await push(token, [
      upsert('equipment_items', { id: newId(), type: 'dumbbells', props: { max_kg: 40 } }),
      upsert('equipment_items', {
        id: newId(),
        type: 'bench',
        props: { incline: true, decline: false },
      }),
    ]);
  });

  it('plans without the fast model and stores the card like a tool call', async () => {
    const model = planner(planOutput('Pierwszy plan.'));
    const threadId = newId();
    const { status, stream } = await chat(
      model,
      request(threadId, 'Zaproponuj trening', { date: DATE, time_min: 45, wellbeing: 4 }),
    );

    expect(status).toBe(200);
    expect(model.doStreamCalls).toHaveLength(0);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(stream).toContain('Pierwszy plan.');
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain('time available: 45 min');

    const [said, answer] = await threadMessages(threadId);
    expect(said?.role).toBe('user');
    expect(answer?.role).toBe('assistant');
    expect(answer?.parts).toMatchObject([
      { type: 'step-start' },
      {
        type: 'tool-propose_workout',
        state: 'output-available',
        input: { date: DATE, time_min: 45, wellbeing: 4 },
        output: { status: 'pending', date: DATE, changes: [] },
      },
    ]);
    expect(await planProposals()).toMatchObject([
      { status: 'pending', input: { date: DATE, checkin: { time_min: 45, wellbeing: 4 } } },
    ]);
  });

  it('makes a new plan for the same answers, which the fast model once declined', async () => {
    const model = planner(planOutput('Pierwszy plan.'), planOutput('Drugi plan.'));
    const threadId = newId();
    const workout = { date: DATE, time_min: 45, wellbeing: 4 };
    await chat(model, request(threadId, 'Zaproponuj trening', workout));
    const { stream } = await chat(model, request(threadId, 'Zaproponuj trening', workout));

    expect(stream).toContain('Drugi plan.');
    expect(model.doGenerateCalls).toHaveLength(2);
    expect((await planProposals()).map((row) => row.status)).toEqual(['rejected', 'pending']);
  });

  it('keeps the check-in and starts from the last plan on a regeneration', async () => {
    const model = planner(planOutput('Pierwszy plan.'), planOutput('Drugi plan.'));
    const threadId = newId();
    await chat(model, request(threadId, 'Zaproponuj', { date: DATE, time_min: 45 }));
    await chat(model, request(threadId, 'Inny', { date: DATE, change_request: 'Inny' }));

    const sent = JSON.stringify(model.doGenerateCalls[1]?.prompt);
    expect(sent).toContain('time available: 45 min');
    expect(sent).toContain('Pierwszy plan.');
    expect(sent).toContain('The athlete asks for this change: Inny');
  });

  it('shows the fast model the card as its own call in a later turn', async () => {
    const threadId = newId();
    await chat(
      planner(planOutput('Pierwszy plan.')),
      request(threadId, 'Zaproponuj', { date: DATE }),
    );

    const model = new MockLanguageModelV4({ doStream: [step('stop', ...text('t1', 'Dobrze.'))] });
    const { stream } = await chat(model, {
      threadId,
      message: userMessage('dzięki'),
      localTime: LOCAL_TIME,
    });

    expect(stream).toContain('Dobrze.');
    const prompt = JSON.stringify(model.doStreamCalls[0]?.prompt);
    expect(prompt).toContain('"toolName":"propose_workout"');
    expect(prompt).toContain('tool-result');
    expect(prompt).toContain('Pierwszy plan.');
  });

  it('fails the turn when the plan can not be made, and stores no card', async () => {
    const model = planner({ exercises: [], rationale: '' });
    const threadId = newId();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { status, stream } = await chat(model, request(threadId, 'Plan', { date: DATE }));
    consoleError.mockRestore();

    expect(status).toBe(200);
    // The client stops showing the call as running before it shows the error.
    expect(stream.indexOf('tool-output-error')).toBeGreaterThan(-1);
    expect(stream.indexOf('tool-output-error')).toBeLessThan(stream.indexOf('model_error'));
    expect((await threadMessages(threadId)).map((row) => row.role)).toEqual(['user']);
    expect(await planProposals()).toEqual([]);
  });

  it('rejects a malformed date before storing anything', async () => {
    const model = planner();
    const threadId = newId();
    const { status } = await chat(model, request(threadId, 'Plan', { date: 'jutro' }));

    expect(status).toBe(400);
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await threadMessages(threadId)).toEqual([]);
  });

  it('asks for the planner, not the fast model, to have a key', async () => {
    const asked: string[] = [];
    const app = new Hono<AppEnv>()
      .use(async (c, next) => {
        c.set('db', db());
        await next();
      })
      .route(
        '/',
        createChatRoutes((_env, setting) => {
          asked.push(setting.model);
          throw new ProviderUnavailable(setting.provider);
        }),
      );
    const threadId = newId();
    const response = await app.request(
      '/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request(threadId, 'Plan', { date: DATE })),
      },
      env,
    );

    expect(response.status).toBe(409);
    expect(asked).toEqual(['claude-sonnet-5-5']);
    expect(await threadMessages(threadId)).toEqual([]);
  });
});

describe('agent chat', () => {
  it('runs a tool call and stores the thread with both messages', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        step('tool-calls', {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'log_sets',
          input: JSON.stringify({
            exercise_id: repsExercise.id,
            sets: [
              { weight_kg: 24, reps: 10 },
              { weight_kg: 24, reps: 10, rir: 0 },
            ],
          }),
        }),
        step('stop', ...text('t1', 'Zapisane: 2 serie.')),
      ],
    });
    const threadId = newId();
    const { status, stream } = await chat(model, {
      threadId,
      message: userMessage(`${repsExercise.name_pl} 24 kg 2x10, ostatnia na zero`),
      localTime: NOW,
    });

    expect(status).toBe(200);
    expect(stream).toContain('Zapisane: 2 serie.');
    const logged = await db()
      .select()
      .from(sets)
      .where(eq(sets.exercise_id, repsExercise.id))
      .orderBy(asc(sets.position));
    expect(
      logged.map(({ status, weight_kg, reps, rir }) => ({ status, weight_kg, reps, rir })),
    ).toEqual([
      { status: 'done', weight_kg: 24, reps: 10, rir: null },
      { status: 'done', weight_kg: 24, reps: 10, rir: 0 },
    ]);
    expect(
      await db().select({ date: threads.date }).from(threads).where(eq(threads.id, threadId)),
    ).toEqual([{ date: '2026-10-31' }]);

    // The second model call gets the tool result; the answer keeps the call and the text.
    expect(model.doStreamCalls).toHaveLength(2);
    expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain('"tool-result"');
    const stored = await threadMessages(threadId);
    expect(stored.map(({ role }) => role)).toEqual(['user', 'assistant']);
    expect(stored[1]?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool-log_sets', state: 'output-available' }),
        expect.objectContaining({ type: 'text', text: 'Zapisane: 2 serie.' }),
      ]),
    );
  });

  it('ends the turn on a proposed workout, whose card is the answer', async () => {
    const plan = {
      exercises: [
        {
          // Needs no equipment.
          exercise_id: timedExercise.id,
          sets: [{ weight_kg: 0, reps: null, duration_s: 45, warmup: false }],
          target_rir: null,
        },
      ],
      rationale: 'Mało czasu.',
    };
    const model = new MockLanguageModelV4({
      doStream: step('tool-calls', {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'propose_workout',
        input: JSON.stringify({ time_min: 20 }),
      }),
      doGenerate: {
        content: [{ type: 'text', text: JSON.stringify(plan) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      },
    });
    const threadId = newId();
    const { status } = await chat(model, {
      threadId,
      message: userMessage('Zaproponuj trening, mam 20 minut'),
      localTime: NOW,
    });

    expect(status).toBe(200);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doGenerateCalls).toHaveLength(1);
    const stored = await threadMessages(threadId);
    expect(stored[1]?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool-propose_workout',
          state: 'output-available',
          output: expect.objectContaining({ status: 'pending', plan }),
        }),
      ]),
    );
    expect(await db().select().from(sets)).toEqual([]);
  });

  it('lets the model explain a workout that could not be proposed', async () => {
    const failing = vi.spyOn(console, 'error').mockImplementation(() => {});
    const model = new MockLanguageModelV4({
      doStream: [
        step('tool-calls', {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'propose_workout',
          input: JSON.stringify({}),
        }),
        step('stop', ...text('t1', 'Nie udało się ułożyć planu.')),
      ],
      doGenerate: async () => {
        throw new Error('model down');
      },
    });
    const { stream } = await chat(model, {
      threadId: newId(),
      message: userMessage('Zaproponuj trening'),
      localTime: NOW,
    });

    expect(model.doStreamCalls).toHaveLength(2);
    expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain('planner_failed');
    expect(stream).toContain('Nie udało się ułożyć planu.');
    failing.mockRestore();
  });

  it('sends the rules, catalog and context, cached for Anthropic', async () => {
    const model = new MockLanguageModelV4({ doStream: step('stop', ...text('t1', 'Cześć!')) });
    await chat(model, { threadId: newId(), message: userMessage('Cześć'), localTime: NOW });

    const [stable, current, user] = model.doStreamCalls[0]?.prompt ?? [];
    expect(stable).toMatchObject({
      role: 'system',
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    });
    expect(stable?.content).toContain(`${repsExercise.id} | ${repsExercise.name_pl}`);
    expect(current).toMatchObject({ role: 'system' });
    expect(current?.content).toContain(`Now: ${NOW} (Saturday, local time).`);
    expect(current).not.toHaveProperty('providerOptions.anthropic');
    expect(user).toMatchObject({ role: 'user' });
    expect(model.doStreamCalls[0]?.tools?.map((tool) => tool.name)).toContain('log_sets');
  });

  it('continues the thread from the stored messages', async () => {
    const threadId = newId();
    const first = new MockLanguageModelV4({ doStream: step('stop', ...text('t1', 'Ile serii?')) });
    await chat(first, { threadId, message: userMessage('Wiosłowanie 20 kg'), localTime: NOW });
    const second = new MockLanguageModelV4({ doStream: step('stop', ...text('t1', 'Zapisane.')) });
    await chat(second, { threadId, message: userMessage('3x12'), localTime: NOW });

    const prompt = second.doStreamCalls[0]?.prompt.filter(({ role }) => role !== 'system');
    expect(prompt?.map(({ role }) => role)).toEqual(['user', 'assistant', 'user']);
    expect((await threadMessages(threadId)).map(({ role }) => role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
  });

  it('rejects a provider without a key before storing anything', async () => {
    const threadId = newId();
    const response = await call('/api/agent/chat', {
      method: 'POST',
      token,
      json: { threadId, message: userMessage('Cześć'), localTime: NOW },
      env: {
        ANTHROPIC_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
        GOOGLE_GENERATIVE_AI_API_KEY: undefined,
      },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'provider_unavailable', provider: 'anthropic' });
    expect(await threadMessages(threadId)).toEqual([]);
  });

  it('accepts only typed text from the user', async () => {
    const model = new MockLanguageModelV4({ doStream: step('stop') });
    const message = { ...userMessage('x'), parts: [{ type: 'tool-log_sets', input: {} }] };
    const { status } = await chat(model, { threadId: newId(), message, localTime: NOW });
    expect(status).toBe(400);
    expect(model.doStreamCalls).toHaveLength(0);
  });
});

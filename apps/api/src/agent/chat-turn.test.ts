import { ATHLETE_PROFILE_ID, newId, type ProposalToolOutput } from '@liftwise/core';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createDevice, db, push, repsExercise, upsert } from '../../test/helpers';
import { confirmProposal, done, pushDay } from '../../test/tools';
import type { AppEnv } from '../app-env';
import { messages, pendingProposals, sets, threads, workouts } from '../db/schema';
import { createChatRoutes } from './chat';

// What a turn does around the tools (§6.6), on replayed model streams.

const NOW = '2026-10-31T18:00:00+01:00';

type StreamPart =
  Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer P>
    ? P
    : never;

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

const step = (finish: 'stop' | 'tool-calls', ...parts: StreamPart[]) => ({
  stream: convertArrayToReadableStream<StreamPart>([
    { type: 'stream-start', warnings: [] },
    ...parts,
    { type: 'finish', finishReason: { unified: finish, raw: finish }, usage },
  ]),
});

const answer = (delta: string) =>
  step(
    'stop',
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta },
    { type: 'text-end', id: 't' },
  );

const toolCall = (toolName: string, input: unknown, toolCallId = 'call-1') =>
  step('tool-calls', { type: 'tool-call', toolCallId, toolName, input: JSON.stringify(input) });

async function chat(model: MockLanguageModelV4, threadId: string, text: string, localTime = NOW) {
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
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId,
        message: { id: newId(), role: 'user', parts: [{ type: 'text', text }] },
        localTime,
      }),
    },
    env,
    ctx,
  );
  const stream = await response.text();
  await waitOnExecutionContext(ctx);
  return { status: response.status, stream };
}

const threadMessages = (threadId: string) =>
  db()
    .select({ role: messages.role, parts: messages.parts })
    .from(messages)
    .where(eq(messages.thread_id, threadId))
    .orderBy(asc(messages.created_at), asc(messages.id));

const promptOf = (model: MockLanguageModelV4, index = 0) =>
  JSON.stringify(model.doStreamCalls[index]?.prompt);

// The part of a stored assistant message of one tool.
const toolPart = (parts: unknown[] | undefined, name: string) =>
  parts?.find((part) => (part as { type: string }).type === `tool-${name}`) as
    | { state: string; output?: unknown; errorText?: string }
    | undefined;

const log = {
  exercise_id: repsExercise.id,
  sets: [{ weight_kg: 24, reps: 10 }],
};

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

describe('a tool call the handler refuses', () => {
  it('goes back to the model and the turn goes on, with nothing written', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        toolCall('log_sets', { ...log, date: '2026-11-01' }),
        answer('Nie mogę zapisać jutra.'),
      ],
    });
    const threadId = newId();

    const { status, stream } = await chat(model, threadId, 'Zapisz na jutro');

    expect(status).toBe(200);
    expect(stream).toContain('Nie mogę zapisać jutra.');
    expect(promptOf(model, 1)).toContain('future_date');
    expect(await db().select().from(sets)).toEqual([]);
    const stored = await threadMessages(threadId);
    expect(toolPart(stored[1]?.parts, 'log_sets')).toMatchObject({
      state: 'output-available',
      output: { error: 'future_date' },
    });
  });
});

describe('a tool call the handler never sees', () => {
  it.each([
    ['breaks the input schema', 'log_sets', { ...log, sets: [{ weight_kg: -1, reps: 10 }] }],
    ['names an unknown tool', 'drop_database', {}],
    [
      'names the internal tool',
      'propose_plan',
      {
        date: '2026-11-01',
        checkin: null,
        plan: {
          exercises: [
            {
              exercise_id: repsExercise.id,
              sets: [{ weight_kg: 20, reps: 10, duration_s: null, warmup: false }],
              target_rir: 1,
            },
          ],
          rationale: 'Plan.',
        },
      },
    ],
  ])('%s: the model is told, nothing runs, the thread goes on', async (_case, name, input) => {
    const model = new MockLanguageModelV4({
      doStream: [toolCall(name, input), answer('Nie wyszło.')],
    });
    const threadId = newId();

    const { stream } = await chat(model, threadId, 'Zrób to');

    expect(stream).toContain('Nie wyszło.');
    expect(model.doStreamCalls).toHaveLength(2);
    expect(promptOf(model, 1)).toContain('"error-text"');
    expect(await db().select().from(sets)).toEqual([]);
    expect(await db().select().from(pendingProposals)).toEqual([]);

    // The stored failed call doesn't break the context of the next turn.
    const next = new MockLanguageModelV4({ doStream: answer('Dobrze.') });
    expect((await chat(next, threadId, 'A teraz?')).stream).toContain('Dobrze.');
    expect(next.doStreamCalls).toHaveLength(1);
    expect(promptOf(next)).toContain('Zrób to');
  });
});

describe('a failing model', () => {
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  it('keeps what the user said and the thread can go on', async () => {
    const spy = quiet();
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error('model down');
      },
    });
    const threadId = newId();

    const { status, stream } = await chat(model, threadId, 'Wyciskanie 24 kg');

    expect(status).toBe(200);
    expect(stream).toContain('model_error');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    expect((await threadMessages(threadId)).map(({ role }) => role)).toEqual(['user']);

    const next = new MockLanguageModelV4({ doStream: answer('Już działam.') });
    await chat(next, threadId, 'Halo?');
    expect(promptOf(next)).toContain('Wyciskanie 24 kg');
    expect((await threadMessages(threadId)).map(({ role }) => role)).toEqual([
      'user',
      'user',
      'assistant',
    ]);
  });

  it('after a write: the change stays and its card is stored, so it can be undone', async () => {
    const spy = quiet();
    const calls = [toolCall('log_sets', log)];
    const model = new MockLanguageModelV4({
      doStream: async () => {
        const next = calls.shift();
        if (!next) throw new Error('model down');
        return next;
      },
    });
    const threadId = newId();

    const { stream } = await chat(model, threadId, 'Wyciskanie 24 kg 10');

    expect(stream).toContain('model_error');
    spy.mockRestore();
    expect(await db().select().from(sets)).toHaveLength(1);
    const [, stored] = await threadMessages(threadId);
    const part = toolPart(stored?.parts, 'log_sets');
    expect(part?.state).toBe('output-available');
    expect(part?.output).toMatchObject({ groupId: expect.any(String) });
  });
});

it('stops a turn after 8 model calls (§6.6)', async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => toolCall('get_profile', {}, newId()),
  });
  const threadId = newId();

  const { status } = await chat(model, threadId, 'Sprawdzaj w kółko');

  expect(status).toBe(200);
  expect(model.doStreamCalls).toHaveLength(8);
  const [, stored] = await threadMessages(threadId);
  const parts = (stored?.parts ?? []) as { type: string }[];
  expect(parts.filter((part) => part.type === 'tool-get_profile')).toHaveLength(8);
});

it('sends only the messages of the current thread (§5.9.5)', async () => {
  const [earlier, current] = [newId(), newId()];
  await chat(new MockLanguageModelV4({ doStream: answer('Wczoraj.') }), earlier, 'Stary wątek');
  const model = new MockLanguageModelV4({ doStream: answer('Dziś.') });

  await chat(model, current, 'Nowy wątek');

  expect(promptOf(model)).toContain('Nowy wątek');
  expect(promptOf(model)).not.toContain('Stary wątek');
  expect(promptOf(model)).not.toContain('Wczoraj.');
});

it('sends the profile, equipment and balance from the data, without archived exercises', async () => {
  await push(token, [
    upsert('athlete_profile', { id: ATHLETE_PROFILE_ID, content: 'Cel: siła, trening rano' }),
    upsert('equipment_items', { id: newId(), type: 'dumbbells', props: { max_kg: 40 } }),
    upsert('exercises', { ...repsExercise, archived: true }),
  ]);
  await pushDay(token, '2026-10-29', [done(), done()]);
  const model = new MockLanguageModelV4({ doStream: answer('Cześć.') });

  await chat(model, newId(), 'Cześć');

  const [stable, current] = model.doStreamCalls[0]?.prompt ?? [];
  expect(stable?.content).not.toContain(repsExercise.id);
  expect(current?.content).toContain('Athlete profile:\nCel: siła, trening rano');
  expect(current?.content).toContain('Equipment: adjustable dumbbells up to 40 kg.');
  expect(current?.content).toContain('- chest: 2 (target 10-20, under), last 2 d ago');
});

it('logs on the local day and time of the message, not the server clock', async () => {
  const localTime = '2026-11-01T00:30:00+01:00';
  const model = new MockLanguageModelV4({
    doStream: [toolCall('log_sets', log), answer('Zapisane.')],
  });
  const threadId = newId();

  await chat(model, threadId, 'Wyciskanie po północy', localTime);

  const [workout] = await db().select().from(workouts);
  expect(workout).toMatchObject({ date: '2026-11-01', started_at: localTime });
  expect((await db().select().from(sets))[0]?.performed_at).toBe(localTime);
  const thread = () => db().select().from(threads).where(eq(threads.id, threadId));
  expect(await thread()).toMatchObject([{ date: '2026-11-01' }]);

  // A later message keeps the thread on its day.
  const next = new MockLanguageModelV4({ doStream: answer('Tak.') });
  await chat(next, threadId, 'Jeszcze jedno', '2026-11-02T08:00:00+01:00');
  expect(await thread()).toMatchObject([{ date: '2026-11-01' }]);
});

it('a risky call waits for the tap, which needs no model and shows in the next turn', async () => {
  const {
    sets: [set],
  } = await pushDay(token, '2026-10-29', [done()]);
  const model = new MockLanguageModelV4({
    doStream: [toolCall('delete_sets', { set_ids: [set?.id] }), answer('Zatwierdź na karcie.')],
  });
  const threadId = newId();

  await chat(model, threadId, 'Usuń tę serię');

  const live = async () =>
    (
      await db()
        .select()
        .from(sets)
        .where(eq(sets.id, set?.id ?? ''))
    )[0]?.deleted_at;
  expect(await live()).toBeNull();
  const [, stored] = await threadMessages(threadId);
  const card = toolPart(stored?.parts, 'delete_sets')?.output as ProposalToolOutput;
  expect(card).toMatchObject({ status: 'pending', changes: [{ op: 'delete', id: set?.id }] });

  const response = await confirmProposal(token, card.proposalId);

  expect(response.status).toBe(200);
  const { groupId } = await response.json<ProposalToolOutput>();
  expect(await live()).toEqual(expect.any(String));
  expect(model.doStreamCalls).toHaveLength(2);

  const next = new MockLanguageModelV4({ doStream: answer('Usunięta.') });
  await chat(next, threadId, 'Usunięta?');
  expect(promptOf(next)).toContain('confirmed');
  expect(promptOf(next)).toContain(String(groupId));
});

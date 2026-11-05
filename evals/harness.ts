import { newId } from '@liftwise/core';
import { wrapLanguageModel, type LanguageModel } from 'ai';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { createDevice, db } from '../apps/api/test/helpers';
import type { AppEnv } from '../apps/api/src/app-env';
import { createChatRoutes } from '../apps/api/src/agent/chat';
import { messages } from '../apps/api/src/db/schema';
import { toolByName } from '../apps/api/src/tools';
import type { EvalCase } from './cases';
import { NOW, seedAthlete } from './fixtures';
import { noUsage, type CaseResult, type Usage } from './report';
import { score, type ToolCall, type Turn, type TurnExpectation } from './score';

// A case through the real chat route: the app's prompt, tools, handlers and message storage on a
// clean D1 (test/setup.ts). What the model did is read back from the stored assistant message.

export type Resolve = NonNullable<Parameters<typeof createChatRoutes>[0]>;

type Meter = Usage & { error?: string };

type ModelUsage = {
  inputTokens?: { total?: number; cacheRead?: number };
  outputTokens?: { total?: number };
};

function count(meter: Meter, usage: ModelUsage | undefined) {
  meter.steps += 1;
  meter.input += usage?.inputTokens?.total ?? 0;
  meter.cached += usage?.inputTokens?.cacheRead ?? 0;
  meter.output += usage?.outputTokens?.total ?? 0;
}

// The tokens and the failure of a model, without touching chat.ts.
export function metered(model: LanguageModel, meter: Meter): LanguageModel {
  const failed = (error: unknown) => {
    meter.error = (error instanceof Error ? error.message : String(error)).slice(0, 200);
  };
  return wrapLanguageModel({
    model: model as Parameters<typeof wrapLanguageModel>[0]['model'],
    middleware: {
      wrapGenerate: async ({ doGenerate }) => {
        try {
          const result = await doGenerate();
          count(meter, result.usage);
          return result;
        } catch (error) {
          failed(error);
          throw error;
        }
      },
      wrapStream: async ({ doStream }) => {
        try {
          const result = await doStream();
          return {
            ...result,
            stream: result.stream.pipeThrough(
              new TransformStream({
                transform(part, controller) {
                  if (part.type === 'finish') count(meter, part.usage);
                  if (part.type === 'error') failed(part.error);
                  controller.enqueue(part);
                },
              }),
            ),
          };
        } catch (error) {
          failed(error);
          throw error;
        }
      },
    },
  });
}

type StoredPart = {
  type: string;
  text?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function callOf(part: StoredPart): ToolCall {
  const tool = part.type.slice('tool-'.length);
  const output = part.output as { error?: string } | undefined;
  return {
    tool,
    risk: toolByName(tool)?.risk ?? 'read',
    input: part.input,
    output: part.output,
    error: part.state === 'output-error' ? (part.errorText ?? 'output-error') : output?.error,
  };
}

async function runTurn(resolve: Resolve, threadId: string, say: string): Promise<Turn> {
  const app = new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set('db', db());
      await next();
    })
    .route('/', createChatRoutes(resolve));
  const ctx = createExecutionContext();
  const response = await app.request(
    '/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId,
        message: { id: newId(), role: 'user', parts: [{ type: 'text', text: say }] },
        localTime: NOW,
      }),
    },
    env,
    ctx,
  );
  const stream = await response.text();
  await waitOnExecutionContext(ctx);

  const stored = await db()
    .select({ role: messages.role, parts: messages.parts })
    .from(messages)
    .where(eq(messages.thread_id, threadId))
    .orderBy(asc(messages.created_at), asc(messages.id));
  const last = stored.at(-1);
  // A rejected request stored nothing: the last message is the previous turn's.
  const parts =
    response.status === 200 && last?.role === 'assistant' ? (last.parts as StoredPart[]) : [];
  return {
    calls: parts.filter((part) => part.type.startsWith('tool-')).map(callOf),
    reply: parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join(' ')
      .trim(),
    modelError:
      response.status !== 200
        ? `HTTP ${response.status}: ${stream.slice(0, 200)}`
        : stream.includes('"type":"error"')
          ? 'model_error'
          : undefined,
  };
}

export const startResult = (
  evalCase: EvalCase,
  models: CaseResult['models'],
  run = 1,
): CaseResult => ({ id: evalCase.id, group: evalCase.group, run, models, turns: [] });

// Runs a case into `result`, which the test has already handed to the reporter: a case that times
// out keeps the turns it finished. A turn that fails ends the case: the next one would continue a
// conversation that went elsewhere.
export async function runCase(
  evalCase: EvalCase,
  result: CaseResult,
  resolverFor: (expected: TurnExpectation, previous: Turn[], meter: Meter) => Resolve,
): Promise<void> {
  const { provider, fast, planner } = result.models;
  const { token } = await createDevice();
  await seedAthlete(token, {
    fast: { provider, model: fast },
    planner: { provider, model: planner },
  });
  await evalCase.fixture?.(token);

  const threadId = newId();
  const turns: Turn[] = [];
  for (const { say, expect: expected } of evalCase.turns) {
    const meter: Meter = noUsage();
    const started = Date.now();
    const turn = await runTurn(resolverFor(expected, turns, meter), threadId, say);
    const scored = score(turn, expected, turns);
    // An API error in a turn that failed says nothing about the agent, also when the app made it a
    // tool error (`planner_failed`). In a turn that passed, it was a retry that got through.
    const modelError = scored.length > 0 ? (meter.error ?? turn.modelError) : undefined;
    const problems = modelError ? [`model error: ${modelError}`] : scored;
    const { error: _error, ...usage } = meter;
    turns.push(turn);
    result.turns.push({
      say,
      reply: turn.reply,
      calls: turn.calls.map(({ tool, input, output, error }) => ({ tool, input, output, error })),
      problems,
      modelError,
      usage,
      ms: Date.now() - started,
    });
    if (problems.length > 0) break;
  }
}

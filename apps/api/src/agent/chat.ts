import { balanceSnapshot, idSchema, newId, timestampSchema, type Message } from '@liftwise/core';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type StopCondition,
  type ToolSet,
  type UIMessage,
} from 'ai';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import type { Db } from '../db';
import { messages, threads } from '../db/schema';
import { apiError, readJson } from '../http';
import { applyWrites, type Write } from '../sync/write';
import { agentTools } from '../tools';
import { balanceSets, balanceSettings, catalog, equipment, profile } from '../tools/data';
import type { ToolContext } from '../tools/registry';
import { systemMessages } from './prompt';
import { modelSettings, ProviderUnavailable, resolveModel } from './providers';

// One agent turn (§6.5, §6.6): the user's message is stored, the model runs with the tools over
// the current thread only, and the answer streams back as UI message chunks; the assistant
// message is stored when the stream ends. Clients pull afterwards for the data and messages.

// Model calls per turn: a lookup, a write and the answer leave room for a question or a retry.
const MAX_STEPS = 8;

// A proposed workout ends the turn: the plan card is the answer, another step would only cost CPU
// and tokens. A failed call goes on, so the model can explain it.
const planProposed: StopCondition<ToolSet> = ({ steps }) =>
  steps
    .at(-1)
    ?.toolResults.some(
      ({ toolName, output }) =>
        toolName === 'propose_workout' &&
        (output as { error?: string } | null)?.error === undefined,
    ) ?? false;

// Turns this isolate has served: 1 is a cold isolate. Logged with the steps, next to the CPU time
// of the invocation in Workers Logs (§9).
let isolateTurns = 0;

const chatSchema = z.object({
  threadId: idSchema,
  // Typed text only; tool results never come from the client.
  message: z.object({
    id: idSchema,
    role: z.literal('user'),
    parts: z
      .array(z.object({ type: z.literal('text'), text: z.string().trim().min(1).max(4000) }))
      .min(1),
  }),
  role: z.enum(['fast', 'planner']).default('fast'),
  // When the user wrote it, in their time zone: the day and the time sets are logged with.
  localTime: timestampSchema,
});

async function threadMessages(db: Db, threadId: string): Promise<UIMessage[]> {
  const rows = await db
    .select({ id: messages.id, role: messages.role, parts: messages.parts })
    .from(messages)
    .where(and(eq(messages.thread_id, threadId), isNull(messages.deleted_at)))
    .orderBy(asc(messages.created_at), asc(messages.id));
  return rows as UIMessage[];
}

const messageWrite = (threadId: string, message: Omit<Message, 'thread_id'>): Write => ({
  groupId: newId(),
  entity: 'messages',
  op: 'upsert',
  row: { ...message, thread_id: threadId },
});

// Tests pass a mock model; the app resolves the provider of the role's setting.
export function createChatRoutes(resolve = resolveModel) {
  return new Hono<AppEnv>().post('/', async (c) => {
    const body = await readJson(c, chatSchema);
    if (!body) return apiError(c, 400, 'invalid_request');
    const db = c.var.db;
    const { threadId, localTime } = body;
    const today = localTime.slice(0, 10);
    const isolateTurn = ++isolateTurns;

    const models = await modelSettings(db, c.env);
    let resolved: ReturnType<typeof resolveModel>;
    try {
      resolved = resolve(c.env, models[body.role]);
    } catch (error) {
      if (!(error instanceof ProviderUnavailable)) throw error;
      return c.json({ error: 'provider_unavailable', provider: error.provider }, 409);
    }

    // Stored first, so a failing model never loses what the user said.
    const [thread] = await db
      .select({ id: threads.id })
      .from(threads)
      .where(eq(threads.id, threadId));
    const userMessage = messageWrite(threadId, body.message);
    await applyWrites(db, { actor: 'user', threadId }, [
      ...(thread
        ? []
        : [
            {
              groupId: userMessage.groupId,
              entity: 'threads',
              op: 'upsert',
              row: { id: threadId, date: today, workout_id: null },
            } satisfies Write,
          ]),
      userMessage,
    ]);

    const [conversation, exercises, items, profileText, balance, sets] = await Promise.all([
      threadMessages(db, threadId),
      catalog(db),
      equipment(db),
      profile(db),
      balanceSettings(db),
      balanceSets(db, today),
    ]);
    const ctx: ToolContext = {
      db,
      threadId,
      today,
      now: localTime,
      planner: () => resolve(c.env, models.planner).model,
    };
    const tools = agentTools(ctx);
    const result = streamText({
      model: resolved.model,
      instructions: systemMessages({
        provider: resolved.provider,
        localTime,
        today,
        catalog: exercises,
        equipment: items,
        profile: profileText,
        balance: balanceSnapshot({ sets, exercises, balance, today }),
      }),
      messages: await convertToModelMessages(conversation, {
        tools,
        ignoreIncompleteToolCalls: true,
      }),
      tools,
      stopWhen: [stepCountIs(MAX_STEPS), planProposed],
    });

    // The Worker stays alive until the answer is stored, even if the client went away.
    let stored!: () => void;
    c.executionCtx.waitUntil(new Promise<void>((done) => (stored = done)));
    const assistantId = newId();
    const stream = toUIMessageStream({
      // The UI needs a tool call's input only once it is complete; each input delta would make
      // the stored message (built from this stream) and the client re-parse it all (LW-15).
      stream: result.stream.pipeThrough(
        new TransformStream({
          transform(part, controller) {
            if (part.type !== 'tool-input-delta') controller.enqueue(part);
          },
        }),
      ),
      tools,
      originalMessages: conversation,
      generateMessageId: () => assistantId,
      onEnd: async ({ responseMessage }) => {
        try {
          const steps = responseMessage.parts.filter((part) => part.type === 'step-start').length;
          console.log(JSON.stringify({ chatTurn: { isolateTurn, steps } }));
          if (responseMessage.parts.length === 0) return;
          const { id, parts } = responseMessage;
          await applyWrites(db, { actor: 'agent', threadId }, [
            messageWrite(threadId, { id, role: 'assistant', parts: parts as Message['parts'] }),
          ]);
        } finally {
          stored();
        }
      },
      onError: (error) => {
        console.error(error);
        return 'model_error';
      },
    });
    return createUIMessageStreamResponse({ stream });
  });
}

export const chatRoutes = createChatRoutes();

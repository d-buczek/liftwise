import { newId } from '@liftwise/core';
import { UNREACHABLE } from '../api/client';
import type { LiftWiseDb, QueuedPrompt } from '../db/database';
import { chatFailure, chatTransport, localTimestamp, type ChatFailure } from './chat';

// The offline prompt queue (§5.9.8, D20): a prompt said without the network waits on the device
// with the time it was said and goes to the agent when the server is reachable again, oldest
// first, so "zmień ostatnią serię" runs after the sets it refers to. The answers come back with
// the sync, as change cards and questions in the thread of that day.

// `sentId`: the id of a live message whose request failed, which the server may have got.
export async function enqueuePrompt(
  db: LiftWiseDb,
  threadId: string,
  text: string,
  { now = new Date(), sentId }: { now?: Date; sentId?: string } = {},
): Promise<QueuedPrompt> {
  const prompt = {
    id: sentId ?? newId(),
    threadId,
    text,
    localTime: localTimestamp(now),
    status: 'pending' as const,
    error: null,
    tries: sentId ? 1 : 0,
  };
  const seq = await db.prompt_queue.add(prompt);
  return { ...prompt, seq };
}

export type SendResult = { sent: true } | { sent: false; failure: ChatFailure };
export type SendPrompt = (prompt: QueuedPrompt) => Promise<SendResult>;

// One queued prompt as a turn. The server stores the message before it answers, so once the
// response has started the prompt is the server's, even if the connection breaks during the
// answer: the Worker finishes the turn and stores it.
export async function sendPrompt(
  prompt: QueuedPrompt,
  token: () => string | null,
): Promise<SendResult> {
  let stream: ReadableStream<{ type: string }>;
  try {
    stream = await chatTransport(token, prompt.localTime).sendMessages({
      trigger: 'submit-message',
      chatId: prompt.threadId,
      messageId: undefined,
      messages: [{ id: prompt.id, role: 'user', parts: [{ type: 'text', text: prompt.text }] }],
      abortSignal: undefined,
    });
  } catch (error) {
    return { sent: false, failure: chatFailure(error as Error) };
  }
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === 'error') {
        void reader.cancel().catch(() => undefined);
        return { sent: false, failure: { code: 'model_error' } };
      }
    }
  } catch {
    // The answer broke off; it reaches the thread with the next sync.
  }
  return { sent: true };
}

// Why a run stopped: nothing left, a prompt waits for the user, or the server can't be reached.
export type QueueRun = 'empty' | 'failed' | 'unreachable';

// Sends the queue in order and stops at the first prompt that didn't go through. Call it after a
// sync: a prompt sent before without an answer is dropped when the mirror already has its
// message, so a lost response doesn't log the sets twice.
export async function processQueue(db: LiftWiseDb, send: SendPrompt): Promise<QueueRun> {
  for (;;) {
    const head = await db.prompt_queue.orderBy('seq').first();
    if (!head) return 'empty';
    if (head.status === 'failed') return 'failed';
    if (head.tries > 0 && (await db.messages.get(head.id))) {
      await db.prompt_queue.delete(head.seq);
      continue;
    }
    await db.prompt_queue.update(head.seq, { tries: head.tries + 1 });
    const result = await send({ ...head, tries: head.tries + 1 });
    if (result.sent) {
      await db.prompt_queue.delete(head.seq);
      continue;
    }
    if (result.failure.code === UNREACHABLE) return 'unreachable';
    await db.prompt_queue.update(head.seq, { status: 'failed', error: result.failure });
    return 'failed';
  }
}

// The user tried again after fixing the cause (a model setting, the provider): a fresh request.
export async function retryPrompt(db: LiftWiseDb, seq: number) {
  await db.prompt_queue.update(seq, { status: 'pending', error: null, tries: 0 });
}

export async function removePrompt(db: LiftWiseDb, seq: number) {
  await db.prompt_queue.delete(seq);
}

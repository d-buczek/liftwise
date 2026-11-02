import { newId, type SyncRow } from '@liftwise/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { db, type QueuedPrompt } from '../db/database';
import { resetDb } from '../testing';
import { localTimestamp } from './chat';
import {
  enqueuePrompt,
  processQueue,
  removePrompt,
  retryPrompt,
  sendPrompt,
  type SendPrompt,
} from './queue';

const threadId = newId();

beforeEach(resetDb);
afterEach(() => vi.unstubAllGlobals());

const sent = { sent: true } as const;
const failed = (code: string) => ({ sent: false, failure: { code } }) as const;

// The server stored the message: it came back with a pull.
async function pulledMessage(id: string) {
  const message: SyncRow<'messages'> = {
    id,
    thread_id: threadId,
    role: 'user',
    parts: [{ type: 'text', text: 'wyciskanie 24 kg 4x10' }],
    created_at: '2026-11-01T17:00:00.000Z',
    updated_at: '2026-11-01T17:00:00.000Z',
    deleted_at: null,
    seq: 1,
  };
  await db.messages.put(message);
}

describe('enqueuePrompt', () => {
  it('keeps the prompt with the local time it was said', async () => {
    const now = new Date('2026-11-01T17:05:00Z');
    const prompt = await enqueuePrompt(db, threadId, 'wyciskanie 24 kg 4x10', { now });
    expect(await db.prompt_queue.toArray()).toEqual([
      {
        seq: prompt.seq,
        id: prompt.id,
        threadId,
        text: 'wyciskanie 24 kg 4x10',
        localTime: localTimestamp(now),
        status: 'pending',
        error: null,
        tries: 0,
      },
    ]);
  });

  it('keeps the id of a live message that never got an answer, as tried once', async () => {
    const sentId = newId();
    const prompt = await enqueuePrompt(db, threadId, 'wyciskanie 24 kg 4x10', { sentId });
    expect(prompt).toMatchObject({ id: sentId, tries: 1 });

    // The server did get it: not sent again.
    await pulledMessage(sentId);
    const send = vi.fn<SendPrompt>(async () => sent);
    expect(await processQueue(db, send)).toBe('empty');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('processQueue', () => {
  it('sends the prompts in the order they were said and empties the queue', async () => {
    const first = await enqueuePrompt(db, threadId, 'wyciskanie 24 kg 4x10');
    const second = await enqueuePrompt(db, threadId, 'zmień ostatnią serię na 22 kg');
    const send = vi.fn<SendPrompt>(async () => sent);

    expect(await processQueue(db, send)).toBe('empty');
    expect(send.mock.calls.map(([prompt]) => [prompt.id, prompt.localTime])).toEqual([
      [first.id, first.localTime],
      [second.id, second.localTime],
    ]);
    expect(await db.prompt_queue.count()).toBe(0);
  });

  it('keeps the queue when the server is unreachable and tries again later', async () => {
    const first = await enqueuePrompt(db, threadId, 'wyciskanie 24 kg 4x10');
    await enqueuePrompt(db, threadId, 'wiosłowanie 20 kg 3x12');
    const send = vi.fn<SendPrompt>(async () => failed('unreachable'));

    expect(await processQueue(db, send)).toBe('unreachable');
    expect(send).toHaveBeenCalledTimes(1);
    const [head] = await db.prompt_queue.orderBy('seq').toArray();
    expect(head).toMatchObject({ id: first.id, status: 'pending', tries: 1 });

    send.mockImplementation(async () => sent);
    expect(await processQueue(db, send)).toBe('empty');
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('drops a prompt the server already has instead of sending it twice', async () => {
    const lost = await enqueuePrompt(db, threadId, 'wyciskanie 24 kg 4x10');
    const next = await enqueuePrompt(db, threadId, 'wiosłowanie 20 kg 3x12');
    await processQueue(db, async () => failed('unreachable'));
    await pulledMessage(lost.id);

    const send = vi.fn<SendPrompt>(async () => sent);
    expect(await processQueue(db, send)).toBe('empty');
    expect(send.mock.calls.map(([prompt]) => prompt.id)).toEqual([next.id]);
  });

  it('sends a prompt never tried before even if the mirror has a message with its id', async () => {
    const prompt = await enqueuePrompt(db, threadId, 'wyciskanie 24 kg 4x10');
    await pulledMessage(prompt.id);
    const send = vi.fn<SendPrompt>(async () => sent);
    await processQueue(db, send);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('stops at a failed prompt until the user retries or removes it', async () => {
    const first = await enqueuePrompt(db, threadId, 'wyciskanie 24 kg 4x10');
    const second = await enqueuePrompt(db, threadId, 'wiosłowanie 20 kg 3x12');
    const send = vi.fn<SendPrompt>(async () => ({
      sent: false,
      failure: { code: 'provider_unavailable', provider: 'openai' },
    }));

    expect(await processQueue(db, send)).toBe('failed');
    expect(await processQueue(db, send)).toBe('failed');
    expect(send).toHaveBeenCalledTimes(1);
    expect(await db.prompt_queue.orderBy('seq').toArray()).toMatchObject([
      {
        id: first.id,
        status: 'failed',
        error: { code: 'provider_unavailable', provider: 'openai' },
      },
      { id: second.id, status: 'pending', tries: 0 },
    ]);

    // A model error leaves the message on the server: a retry still sends it.
    await pulledMessage(first.id);
    await retryPrompt(db, first.seq);
    send.mockImplementation(async () => sent);
    expect(await processQueue(db, send)).toBe('empty');
    expect(send.mock.calls.slice(1).map(([prompt]) => prompt.id)).toEqual([first.id, second.id]);
  });

  it('goes on with the next prompt after one is removed', async () => {
    const first = await enqueuePrompt(db, threadId, 'wyciskanie 24 kg 4x10');
    await enqueuePrompt(db, threadId, 'wiosłowanie 20 kg 3x12');
    await processQueue(db, async () => failed('model_error'));
    await removePrompt(db, first.seq);

    const send = vi.fn<SendPrompt>(async () => sent);
    expect(await processQueue(db, send)).toBe('empty');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('sendPrompt', () => {
  const prompt: QueuedPrompt = {
    seq: 1,
    id: newId(),
    threadId,
    text: 'wyciskanie 24 kg 4x10',
    localTime: '2026-11-01T18:05:00+01:00',
    status: 'pending',
    error: null,
    tries: 1,
  };
  const events = (...chunks: object[]) =>
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('');
  const sse = (body: string | ReadableStream) =>
    new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

  function stubFetch(respond: () => Promise<Response>) {
    const mock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(respond);
    vi.stubGlobal('fetch', mock);
    return mock;
  }

  it('posts the message with the time it was said and reads the answer to the end', async () => {
    const fetch = stubFetch(async () =>
      sse(events({ type: 'start' }, { type: 'text-start', id: 't' }, { type: 'finish' })),
    );
    expect(await sendPrompt(prompt, () => 'token')).toEqual({ sent: true });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('/api/agent/chat');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token');
    expect(JSON.parse(init?.body as string)).toEqual({
      threadId,
      message: { id: prompt.id, role: 'user', parts: [{ type: 'text', text: prompt.text }] },
      localTime: prompt.localTime,
    });
  });

  it('reports an error of the model in the stream', async () => {
    stubFetch(async () =>
      sse(events({ type: 'start' }, { type: 'error', errorText: 'model_error' })),
    );
    expect(await sendPrompt(prompt, () => 'token')).toEqual({
      sent: false,
      failure: { code: 'model_error' },
    });
  });

  it("reports the API's error and a request that never got through", async () => {
    stubFetch(
      async () =>
        new Response(JSON.stringify({ error: 'provider_unavailable', provider: 'gemini' }), {
          status: 409,
        }),
    );
    expect(await sendPrompt(prompt, () => 'token')).toEqual({
      sent: false,
      failure: { code: 'provider_unavailable', provider: 'gemini' },
    });

    stubFetch(async () => Promise.reject(new TypeError('Failed to fetch')));
    expect(await sendPrompt(prompt, () => 'token')).toEqual({
      sent: false,
      failure: { code: 'unreachable' },
    });
  });

  it('counts a prompt as sent once the answer has started, even if it breaks off', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(events({ type: 'start' })));
        controller.error(new TypeError('network error'));
      },
    });
    stubFetch(async () => sse(body));
    expect(await sendPrompt(prompt, () => 'token')).toEqual({ sent: true });
  });
});

import { newId } from '@liftwise/core';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { db } from '../db/database';
import { resetDb } from '../testing';
import { useAuthStore } from './auth';
import { usePromptQueueStore } from './promptQueue';

const pulled = { changes: [], seq: 0, hasMore: false };

function mockServer() {
  const turns: string[] = [];
  vi.stubGlobal('fetch', async (input: string) => {
    if (!input.includes('/api/agent/chat')) {
      return new Response(JSON.stringify(pulled), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    turns.push(input);
    return new Response('data: [DONE]\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });
  return turns;
}

beforeEach(async () => {
  await resetDb();
  setActivePinia(createPinia());
  useAuthStore().device = { id: 'device', deviceId: newId(), token: 'token' };
});
afterEach(() => vi.unstubAllGlobals());

const queueEmptied = () => vi.waitFor(async () => expect(await db.prompt_queue.count()).toBe(0));

// Long enough for the sync to finish and the queue to send what it would send.
const settled = () => new Promise((resolve) => setTimeout(resolve, 50));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

it('a prompt queued during a live turn runs by itself after that turn ends', async () => {
  const turns = mockServer();
  const queue = usePromptQueueStore();
  queue.start();

  const live = deferred();
  const running = queue.runTurn(() => live.promise, vi.fn());
  expect(queue.liveTurn).toBe(true);

  await queue.enqueue(newId(), 'Zaproponuj trening');
  await settled();
  expect(turns).toHaveLength(0);
  expect(await db.prompt_queue.count()).toBe(1);

  live.resolve();
  await running;
  expect(queue.liveTurn).toBe(false);
  await queueEmptied();
  expect(turns).toHaveLength(1);
});

it('a failed live turn releases the queue too', async () => {
  const turns = mockServer();
  const queue = usePromptQueueStore();
  queue.start();

  const live = deferred();
  const running = queue.runTurn(() => live.promise, vi.fn());
  await queue.enqueue(newId(), 'Zaproponuj trening');
  await settled();
  expect(turns).toHaveLength(0);

  live.reject(new Error('broken stream'));
  await expect(running).rejects.toThrow('broken stream');
  expect(queue.liveTurn).toBe(false);
  await queueEmptied();
  expect(turns).toHaveLength(1);
});

it('stops the live turn, and nothing once it ended', async () => {
  mockServer();
  const queue = usePromptQueueStore();
  const stop = vi.fn<() => void>();

  const live = deferred();
  const running = queue.runTurn(() => live.promise, stop);
  queue.stopTurn();
  expect(stop).toHaveBeenCalledOnce();

  live.resolve();
  await running;
  queue.stopTurn();
  expect(stop).toHaveBeenCalledOnce();
});

it('runs a queued prompt after a sync when no turn is live', async () => {
  const turns = mockServer();
  const queue = usePromptQueueStore();
  queue.start();

  await queue.enqueue(newId(), 'Zaproponuj trening');
  await queueEmptied();
  expect(turns).toHaveLength(1);
});

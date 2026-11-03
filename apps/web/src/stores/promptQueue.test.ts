import { newId } from '@liftwise/core';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { db } from '../db/database';
import { resetDb } from '../testing';
import { useAuthStore } from './auth';
import { usePromptQueueStore } from './promptQueue';
import { useSyncStore } from './sync';

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

it('a prompt queued during a live turn waits for the end of that turn', async () => {
  const turns = mockServer();
  const queue = usePromptQueueStore();
  const sync = useSyncStore();
  queue.start();

  queue.liveTurn = true;
  await queue.enqueue(newId(), 'Zaproponuj trening');
  await settled();
  expect(turns).toHaveLength(0);
  expect(await db.prompt_queue.count()).toBe(1);

  queue.liveTurn = false;
  await sync.sync();
  await queueEmptied();
  expect(turns).toHaveLength(1);
});

it('runs a queued prompt after a sync when no turn is live', async () => {
  const turns = mockServer();
  const queue = usePromptQueueStore();
  queue.start();

  await queue.enqueue(newId(), 'Zaproponuj trening');
  await queueEmptied();
  expect(turns).toHaveLength(1);
});

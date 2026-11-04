import { defineStore } from 'pinia';
import { ref } from 'vue';
import { enqueuePrompt, processQueue, removePrompt, retryPrompt, sendPrompt } from '../agent/queue';
import { useLiveQuery } from '../composables/liveQuery';
import { db } from '../db/database';
import { useAuthStore } from './auth';
import { useSyncStore } from './sync';

// The "Do przetworzenia" queue (§5.9.8). It runs after every successful sync (the network came
// back, return to the app, every minute), so the mirror is current when a prompt is checked; a
// new prompt, a retry or a removal asks for a sync first.
export const usePromptQueueStore = defineStore('promptQueue', () => {
  const auth = useAuthStore();
  const sync = useSyncStore();
  const prompts = useLiveQuery(() => db.prompt_queue.orderBy('seq').toArray(), []);
  // The prompt being sent now.
  const sending = ref<number | null>(null);
  // A turn is running from the agent page: a prompt sent now would run next to it and see its message
  // without an answer. It lives here because it outlives the page: leaving through the menu unmounts
  // the page while the request goes on.
  const liveTurn = ref(false);
  let stopLiveTurn: (() => unknown) | null = null;

  async function runTurn(turn: () => Promise<void>, stop: () => unknown) {
    liveTurn.value = true;
    stopLiveTurn = stop;
    try {
      await turn();
    } finally {
      liveTurn.value = false;
      stopLiveTurn = null;
      // The turn's writes and its stored messages; a prompt queued during the turn goes after them.
      void sync.sync();
    }
  }

  function stopTurn() {
    stopLiveTurn?.();
  }

  let running = false;
  let again = false;
  async function process() {
    if (!auth.token || liveTurn.value) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await processQueue(db, async (prompt) => {
          sending.value = prompt.seq;
          try {
            const result = await sendPrompt(prompt, () => auth.token);
            // The answer, its writes and the stored messages.
            if (result.sent) void sync.sync();
            return result;
          } finally {
            sending.value = null;
          }
        });
      } while (again && auth.token);
    } catch (caught) {
      console.error(caught);
    } finally {
      running = false;
    }
  }

  async function enqueue(threadId: string, text: string, sent?: { id: string; at: Date }) {
    await enqueuePrompt(db, threadId, text, { now: sent?.at, sentId: sent?.id });
    void sync.sync();
  }

  async function retry(seq: number) {
    await retryPrompt(db, seq);
    void sync.sync();
  }

  // The next prompt may be waiting behind it.
  async function remove(seq: number) {
    await removePrompt(db, seq);
    void sync.sync();
  }

  let started = false;
  function start() {
    if (started) return;
    started = true;
    sync.onSynced(() => void process());
  }

  return { prompts, sending, liveTurn, runTurn, stopTurn, enqueue, retry, remove, start };
});

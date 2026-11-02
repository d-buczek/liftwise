import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { ApiError } from '../api/client';
import { useLiveQuery } from '../composables/liveQuery';
import { db } from '../db/database';
import { onLocalChange } from '../db/mutate';
import { syncOnce } from '../sync/engine';
import { useAuthStore } from './auth';

const SYNC_INTERVAL_MS = 60_000;
// Groups the writes of a quick series of taps into one push.
const AFTER_WRITE_MS = 1_000;

export type SyncStatus = 'offline' | 'syncing' | 'error' | 'synced' | 'never';

// Runs sync on start, when the network comes back, on return to the app, every minute in the
// foreground and shortly after a local write (§6.4).
export const useSyncStore = defineStore('sync', () => {
  const auth = useAuthStore();
  const online = ref(navigator.onLine);
  const running = ref(false);
  // Error code of the last run: an API code or `unreachable`.
  const error = ref<string | null>(null);
  const pending = useLiveQuery(() => db.outbox.count(), 0);
  const state = useLiveQuery(() => db.sync_state.get('pull'), undefined);
  const syncedAt = computed(() => state.value?.syncedAt ?? null);

  const status = computed<SyncStatus>(() => {
    if (!online.value) return 'offline';
    if (running.value) return 'syncing';
    if (error.value) return 'error';
    return syncedAt.value ? 'synced' : 'never';
  });

  // Called after each sync the server answered: it is reachable and the mirror is current.
  const syncedListeners: (() => void)[] = [];
  function onSynced(listener: () => void) {
    syncedListeners.push(listener);
  }

  let again = false;
  async function sync() {
    if (!auth.token) return;
    if (running.value) {
      again = true;
      return;
    }
    running.value = true;
    let answered = false;
    try {
      do {
        again = false;
        await syncOnce(db, auth.token);
        error.value = null;
      } while (again && auth.token);
      answered = true;
    } catch (caught) {
      // A rejected mutation stays in the outbox and is reported, but the pull went through.
      answered = caught instanceof ApiError && caught.status === 400;
      if (caught instanceof ApiError && caught.status === 401) {
        // Revoked: back to pairing (the app watches the token).
        error.value = null;
        await auth.forget();
      } else {
        error.value = caught instanceof ApiError ? caught.code : 'unknown';
        if (!(caught instanceof ApiError)) console.error(caught);
      }
    } finally {
      running.value = false;
    }
    if (answered) for (const listener of syncedListeners) listener();
  }

  let started = false;
  function start() {
    if (started) return;
    started = true;
    window.addEventListener('online', () => {
      online.value = true;
      void sync();
    });
    window.addEventListener('offline', () => (online.value = false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void sync();
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') void sync();
    }, SYNC_INTERVAL_MS);

    let timer: ReturnType<typeof setTimeout> | undefined;
    onLocalChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void sync(), AFTER_WRITE_MS);
    });
    watch(
      () => auth.token,
      (token) => {
        if (token) void sync();
      },
      { immediate: true },
    );
  }

  return { online, pending, syncedAt, error, status, sync, onSynced, start };
});

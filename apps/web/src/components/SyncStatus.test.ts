import { newId } from '@liftwise/core';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { db } from '../db/database';
import { i18n } from '../i18n';
import { useAuthStore } from '../stores/auth';
import { useSyncStore } from '../stores/sync';
import { mockApi, resetDb } from '../testing';
import SyncStatus from './SyncStatus.vue';

enableAutoUnmount(afterEach);

let pinia: ReturnType<typeof createPinia>;

beforeEach(async () => {
  await resetDb();
  pinia = createPinia();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 5, 18, 30));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const syncedAt = (at: Date) =>
  db.sync_state.put({ id: 'pull', seq: 1, syncedAt: at.toISOString() });

function outbox(count: number) {
  return db.outbox.bulkAdd(
    Array.from({ length: count }, () => ({
      entity: 'sets',
      entityId: newId(),
      mutation: {},
    })) as never,
  );
}

function status() {
  const store = useSyncStore(pinia);
  const wrapper = mount(SyncStatus, { global: { plugins: [i18n, pinia] } });
  const item = wrapper.find('ion-item');
  return {
    wrapper,
    store,
    item,
    state: () => wrapper.find('.lw-sync__state').text(),
    pending: () => wrapper.findAll('ion-label p')[1]?.text(),
    error: () => wrapper.find('.lw-sync__error'),
    disabled: () => (item.element as Element & { disabled?: boolean }).disabled,
  };
}

it('before the first sync says so and that nothing waits', () => {
  const { state, pending, error, disabled } = status();
  expect(state()).toBe('Jeszcze nie zsynchronizowano');
  expect(pending()).toBe('Wszystko wysłane');
  expect(error().exists()).toBe(false);
  expect(disabled()).toBe(false);
});

it('synced today shows the time', async () => {
  await syncedAt(new Date(2026, 10, 5, 18, 5));
  const { state } = status();
  await vi.waitFor(() => expect(state()).toBe('Zsynchronizowano 18:05'));
});

it('synced on an earlier day also shows the date, also at the same hour', async () => {
  await syncedAt(new Date(2026, 10, 4, 18, 30));
  const { state } = status();
  await vi.waitFor(() => expect(state()).toBe('Zsynchronizowano 4 lis, 18:30'));
});

it.each([
  [1, '1 zmiana czeka na wysłanie'],
  [2, '2 zmiany czekają na wysłanie'],
  [5, '5 zmian czeka na wysłanie'],
  [22, '22 zmiany czekają na wysłanie'],
])('counts %i queued changes in Polish', async (count, text) => {
  await outbox(count);
  const { pending } = status();
  await vi.waitFor(() => expect(pending()).toBe(text));
});

it('follows the outbox while shown', async () => {
  const { pending } = status();
  await vi.waitFor(() => expect(pending()).toBe('Wszystko wysłane'));
  await outbox(1);
  await vi.waitFor(() => expect(pending()).toBe('1 zmiana czeka na wysłanie'));
  await db.outbox.clear();
  await vi.waitFor(() => expect(pending()).toBe('Wszystko wysłane'));
});

it('offline: says so, cannot be tapped and keeps the count', async () => {
  await outbox(2);
  const { wrapper, store, state, pending, disabled } = status();
  store.online = false;
  await vi.waitFor(() => expect(pending()).toBe('2 zmiany czekają na wysłanie'));
  expect(state()).toBe('Offline');
  expect(disabled()).toBe(true);
  expect(wrapper.find('ion-item').attributes('aria-label')).toBe('Offline. Synchronizuj teraz');
});

it('offline hides the error of the last run: the state already explains it', async () => {
  const { wrapper, store, error } = status();
  store.error = 'unreachable';
  store.online = false;
  await wrapper.vm.$nextTick();
  expect(error().exists()).toBe(false);
});

it.each([
  ['unreachable', 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.'],
  [
    'invalid_mutation',
    'Serwer odrzucił zmianę zapisaną na tym urządzeniu. Pozostałe zmiany czekają za nią.',
  ],
  ['never_heard_of_it', 'Nieoczekiwany błąd serwera. Spróbuj ponownie.'],
])('error %s says what to do, also after an earlier sync', async (code, message) => {
  await syncedAt(new Date(2026, 10, 5, 18, 5));
  const { wrapper, store, state, error } = status();
  await vi.waitFor(() => expect(state()).toContain('Zsynchronizowano'));
  store.error = code;
  await wrapper.vm.$nextTick();
  expect(state()).toBe('Synchronizacja nie powiodła się');
  expect(error().text()).toBe(message);
});

it('a tap syncs: the state runs through "Synchronizacja…" to the time of the sync', async () => {
  useAuthStore(pinia).device = { id: 'device', deviceId: newId(), token: 'token' };
  let answer: (response: Response) => void = () => undefined;
  const fetch = vi.fn<() => Promise<Response>>(() => new Promise((resolve) => (answer = resolve)));
  vi.stubGlobal('fetch', fetch);
  const { wrapper, item, state, disabled } = status();
  await item.trigger('click');
  await wrapper.vm.$nextTick();
  await vi.waitFor(() => expect(state()).toBe('Synchronizacja…'));
  expect(disabled()).toBe(false);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  answer(
    new Response(JSON.stringify({ changes: [], seq: 3, hasMore: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  await vi.waitFor(() => expect(state()).toBe('Zsynchronizowano 18:30'));
});

it('a failed sync after a tap shows the error', async () => {
  useAuthStore(pinia).device = { id: 'device', deviceId: newId(), token: 'token' };
  mockApi(() => ({ status: 500, body: { error: 'boom' } }));
  const { item, state, error } = status();
  await item.trigger('click');
  await vi.waitFor(() => expect(state()).toBe('Synchronizacja nie powiodła się'));
  expect(error().text()).toBe('Nieoczekiwany błąd serwera. Spróbuj ponownie.');
});

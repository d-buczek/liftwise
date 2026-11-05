import { newId } from '@liftwise/core';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { db, type QueuedPrompt } from '../db/database';
import { i18n } from '../i18n';
import { usePromptQueueStore } from '../stores/promptQueue';
import { useSyncStore } from '../stores/sync';
import { resetDb } from '../testing';
import { today } from '../workout/calendar';
import PromptQueue from './PromptQueue.vue';

enableAutoUnmount(afterEach);

let pinia: ReturnType<typeof createPinia>;

beforeEach(async () => {
  await resetDb();
  pinia = createPinia();
});

function queued(fields: Partial<QueuedPrompt> = {}) {
  return db.prompt_queue.add({
    id: newId(),
    threadId: newId(),
    text: 'wyciskanie 24 kg 4x10',
    localTime: `${today()}T18:05:00+01:00`,
    status: 'pending',
    error: null,
    tries: 0,
    ...fields,
  });
}

const failed = (code: string, provider?: string): Partial<QueuedPrompt> => ({
  status: 'failed',
  error: provider ? { code, provider } : { code },
});

// Mounted with `count` prompts already read from the mirror.
async function view(count = 1) {
  const sync = useSyncStore(pinia);
  const queue = usePromptQueueStore(pinia);
  const wrapper = mount(PromptQueue, { global: { plugins: [i18n, pinia] } });
  const items = () => wrapper.findAll('.lw-queue__item');
  await vi.waitFor(() => expect(items()).toHaveLength(count));
  // Ionic's hosts hide their textContent in the test DOM, so buttons are found by their markup.
  const button = (label: string, index = 0) =>
    items()
      [index]?.findAll('ion-button')
      .find((candidate) => candidate.html().includes(label));
  return {
    wrapper,
    sync,
    queue,
    items,
    button,
    meta: (index = 0) => items()[index]?.find('.lw-queue__meta').text().replace(/\s+/g, ' '),
    alert: (index = 0) => items()[index]?.find('[role="alert"]'),
  };
}

it('shows nothing while the queue is empty, then each prompt as it comes and goes', async () => {
  const { wrapper, items } = await view(0);
  expect(wrapper.find('section').exists()).toBe(false);
  const seq = await queued();
  await vi.waitFor(() => expect(items()).toHaveLength(1));
  expect(wrapper.find('h2').text()).toBe('Do przetworzenia');
  expect(items()[0]?.find('.lw-queue__text').text()).toBe('wyciskanie 24 kg 4x10');
  await db.prompt_queue.delete(seq);
  await vi.waitFor(() => expect(wrapper.find('section').exists()).toBe(false));
});

it('lists the prompts oldest first, with the time they were said', async () => {
  await queued({ text: 'pierwszy', localTime: '2025-03-01T07:40:00+01:00' });
  await queued({ text: 'drugi' });
  const { items, meta } = await view(2);
  expect(items().map((item) => item.find('.lw-queue__text').text())).toEqual(['pierwszy', 'drugi']);
  // Another day has its date, today only the time.
  expect(meta(0)).toContain('1 marca · 07:40');
  expect(meta(1)).toMatch(/^18:05 ·/);
});

describe('the state of a prompt', () => {
  it('with the server reachable waits for its turn', async () => {
    await queued();
    expect((await view()).meta()).toContain('czeka na swoją kolej');
  });

  it('offline waits for the network', async () => {
    await queued();
    const { wrapper, sync, meta } = await view();
    sync.online = false;
    await wrapper.vm.$nextTick();
    expect(meta()).toContain('czeka na sieć');
  });

  it('with a network but no server says it will try again by itself', async () => {
    await queued();
    const { wrapper, sync, meta } = await view();
    sync.error = 'unreachable';
    await wrapper.vm.$nextTick();
    expect(meta()).toContain('nie mogę połączyć się z serwerem, ponowię sam');
  });

  it('another sync error does not blame the connection', async () => {
    await queued();
    const { wrapper, sync, meta } = await view();
    sync.error = 'invalid_mutation';
    await wrapper.vm.$nextTick();
    expect(meta()).toContain('czeka na swoją kolej');
  });

  it('being sent says so for that prompt only, and that one cannot be deleted', async () => {
    const first = await queued();
    await queued();
    const { wrapper, queue, sync, meta, button } = await view(2);
    sync.online = false;
    queue.sending = first;
    await wrapper.vm.$nextTick();
    expect(meta(0)).toContain('wysyłam…');
    expect(meta(1)).toContain('czeka na sieć');
    const disabled = (index: number) =>
      (button('Usuń', index)?.element as (Element & { disabled?: boolean }) | undefined)?.disabled;
    expect(disabled(0)).toBe(true);
    expect(disabled(1)).toBe(false);
  });

  it('failed stays failed offline, since only the user moves it on', async () => {
    await queued(failed('model_error'));
    const { wrapper, sync, meta } = await view();
    sync.online = false;
    await wrapper.vm.$nextTick();
    expect(meta()).toContain('nie udało się');
  });
});

describe('a failed prompt', () => {
  it.each([
    ['model_error', 'Model nie odpowiedział poprawnie. Spróbuj ponownie albo wybierz inny model.'],
    ['invalid_request', 'Serwer nie przyjął wiadomości. Skróć ją i spróbuj ponownie.'],
    ['unauthorized', 'Token jest nieprawidłowy albo to urządzenie zostało odwołane.'],
    ['never_heard_of_it', 'Nieoczekiwany błąd serwera. Spróbuj ponownie.'],
  ])('%s says what to do', async (code, message) => {
    await queued(failed(code));
    const { alert, button } = await view();
    expect(alert()?.text()).toBe(message);
    expect(button('Modele')).toBeUndefined();
  });

  it('a missing provider key names the provider and links to the models', async () => {
    await queued(failed('provider_unavailable', 'google'));
    const { alert, button } = await view();
    expect(alert()?.text()).toBe(
      'Gemini nie ma klucza API na serwerze. Wybierz innego dostawcę w ustawieniach modeli.',
    );
    expect(button('Modele')?.element.getAttribute('routerlink')).toBe('/settings/models');
  });

  it('"Spróbuj ponownie" makes it a fresh request and asks for a sync', async () => {
    const seq = await queued({ ...failed('model_error'), tries: 2 });
    const { sync, button, alert, meta } = await view();
    const run = vi.fn<() => Promise<void>>(async () => undefined);
    sync.sync = run as never;
    await button('Spróbuj ponownie')?.trigger('click');
    await vi.waitFor(() => expect(button('Spróbuj ponownie')).toBeUndefined());
    expect(alert()?.exists()).toBe(false);
    expect(meta()).toContain('czeka na swoją kolej');
    expect(await db.prompt_queue.get(seq)).toMatchObject({
      status: 'pending',
      error: null,
      tries: 0,
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
});

it('a waiting prompt has no retry, only "Usuń", which takes it out and asks for a sync', async () => {
  const seq = await queued({ text: 'do usunięcia' });
  await queued({ text: 'zostaje' });
  const { sync, button, items } = await view(2);
  const run = vi.fn<() => Promise<void>>(async () => undefined);
  sync.sync = run as never;
  expect(button('Spróbuj ponownie')).toBeUndefined();
  await button('Usuń', 0)?.trigger('click');
  await vi.waitFor(() => expect(items()).toHaveLength(1));
  expect(items()[0]?.find('.lw-queue__text').text()).toBe('zostaje');
  expect(await db.prompt_queue.get(seq)).toBeUndefined();
  expect(run).toHaveBeenCalledTimes(1);
});

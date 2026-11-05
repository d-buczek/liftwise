import type { ChangeView, ProposalToolOutput, WriteToolOutput } from '@liftwise/core';
import { alertController, toastController } from '@ionic/vue';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vite-plus/test';
import { undoneGroups } from '../agent/actions';
import { i18n } from '../i18n';
import { useAuthStore } from '../stores/auth';
import { useSyncStore } from '../stores/sync';
import { mockApi } from '../testing';
import ChangeCard from './ChangeCard.vue';

enableAutoUnmount(afterEach);

const EXERCISE = 'bench-press';
const names = new Map([[EXERCISE, 'Wyciskanie hantli']]);

function setFields(fields: Record<string, unknown> = {}) {
  return {
    exercise_id: EXERCISE,
    weight_kg: 24,
    reps: 10,
    duration_s: null,
    status: 'done',
    warmup: false,
    ...fields,
  };
}

function change(entity: ChangeView['entity'], fields: Partial<ChangeView> = {}): ChangeView {
  return { entity, id: crypto.randomUUID(), op: 'create', before: null, after: null, ...fields };
}

const loggedSet = (fields: Record<string, unknown> = {}) =>
  change('sets', { after: setFields(fields) });

const pending = (changes = [loggedSet()]): ProposalToolOutput => ({
  proposalId: 'p1',
  status: 'pending',
  changes,
});

const write = (changes: ChangeView[], groupId: string | null = 'g1'): WriteToolOutput => ({
  groupId,
  changes,
});

let pinia: ReturnType<typeof createPinia>;
let toasts: string[];
let sync: Mock<() => Promise<void>>;

beforeEach(() => {
  pinia = createPinia();
  undoneGroups.clear();
  toasts = [];
  vi.spyOn(toastController, 'create').mockImplementation(async (options) => {
    toasts.push(options.message as string);
    return { present: async () => {} } as never;
  });
  // The token the actions send, and the sync that brings the card's new state.
  const store = useSyncStore(pinia);
  sync = vi.fn<() => Promise<void>>(async () => undefined);
  store.sync = sync as never;
  useAuthStore(pinia).device = { id: 'device', deviceId: 'd1', token: 'token' };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function card(output: WriteToolOutput | ProposalToolOutput, ready = true) {
  const wrapper = mount(ChangeCard, {
    global: { plugins: [i18n, pinia] },
    props: { output, exerciseNames: names, ready },
  });
  // Ionic's hosts hide their textContent in the test DOM, so buttons are found by their markup.
  const button = (label: string) =>
    wrapper.findAll('ion-button').find((candidate) => candidate.html().includes(label));
  const tap = (label: string) => {
    const found = button(label);
    if (!found) throw new Error(`no button "${label}"`);
    return found.trigger('click');
  };
  const disabled = (label: string) =>
    (button(label)?.element as (Element & { disabled?: boolean }) | undefined)?.disabled;
  const title = () => wrapper.find('.lw-change__title').text();
  const status = () => wrapper.find('.lw-change__status');
  const lines = () => wrapper.findAll('.lw-change__lines li');
  const note = () => wrapper.find('.lw-change__note');
  return { wrapper, button, tap, disabled, title, status, lines, note };
}

describe('what the card says', () => {
  it('a write counts what happened and lists each set, without a status', () => {
    const { title, status, lines } = card(
      write([loggedSet(), loggedSet({ weight_kg: 22.5, reps: 12 })]),
    );
    expect(title()).toBe('Zapisano 2 serie');
    expect(status().exists()).toBe(false);
    expect(lines().map((line) => line.text())).toEqual([
      'Wyciskanie hantli · 24 kg × 10',
      'Wyciskanie hantli · 22,5 kg × 12',
    ]);
  });

  it('an edit shows the values before and after', () => {
    const edit = change('sets', {
      op: 'update',
      before: setFields(),
      after: setFields({ weight_kg: 26, reps: 8 }),
    });
    expect(
      card(write([edit]))
        .lines()[0]
        ?.text(),
    ).toBe('Wyciskanie hantli · 24 kg × 10 → 26 kg × 8');
  });

  it('an edit that leaves the load alone shows it once', () => {
    const edit = change('sets', {
      op: 'update',
      before: setFields({ rir: 1 }),
      after: setFields({ rir: 2 }),
    });
    expect(
      card(write([edit]))
        .lines()[0]
        ?.text(),
    ).toBe('Wyciskanie hantli · 24 kg × 10');
  });

  it('tags a warm-up and a planned set', () => {
    const planned = loggedSet({ warmup: true, status: 'planned', weight_kg: 10, reps: 12 });
    expect(
      card(write([planned]))
        .lines()[0]
        ?.text(),
    ).toBe('Wyciskanie hantli · 10 kg × 12 · rozgrzewka · plan');
  });

  it('a deleted set keeps its last values, struck through', () => {
    const deleted = change('sets', { op: 'delete', before: setFields(), after: null });
    const { title, lines } = card(write([deleted, loggedSet()]));
    expect(title()).toBe('Usunięto 1 serię · zapisano 1 serię');
    expect(lines()[0]?.text()).toBe('Wyciskanie hantli · 24 kg × 10');
    expect(lines()[0]?.classes()).toContain('is-deleted');
    expect(lines()[1]?.classes()).not.toContain('is-deleted');
  });

  it('a timed set reads in seconds', () => {
    const plank = loggedSet({ weight_kg: 0, reps: null, duration_s: 45 });
    expect(
      card(write([plank]))
        .lines()[0]
        ?.text(),
    ).toBe('Wyciskanie hantli · 0 kg × 45 s');
  });

  it('a set of an exercise no longer in the catalog still reads', () => {
    const orphan = loggedSet({ exercise_id: 'gone' });
    expect(
      card(write([orphan]))
        .lines()[0]
        ?.text(),
    ).toBe('Ćwiczenie usunięte z katalogu · 24 kg × 10');
  });

  it.each([
    ['workouts', { date: '2026-11-01' }, 'Dodano trening', 'Niedziela, 1 listopada'],
    ['exercises', { name_pl: 'Plank' }, 'Dodano ćwiczenie', 'Plank'],
    ['athlete_profile', { content: 'Cel: siła' }, 'Zmieniono profil zawodnika', 'Cel: siła'],
    ['settings', { key: 'balance' }, 'Zmieniono ustawienia', 'Balans'],
  ] as const)('a change of %s reads', (entity, after, title, line) => {
    const view = card(write([change(entity, { after })]));
    expect(view.title()).toBe(title);
    expect(view.lines().map((row) => row.text())).toEqual([line]);
  });
});

describe('a proposal', () => {
  it('waits for a decision, in the wording of a proposal, with no undo', () => {
    const { status, title, button } = card(
      pending([loggedSet({ status: 'planned' }), loggedSet()]),
    );
    expect(status().text()).toBe('Do zatwierdzenia');
    expect(title()).toBe('Plan 1 serii · zapis 1 serii');
    expect(button('Zatwierdź')).toBeDefined();
    expect(button('Odrzuć')).toBeDefined();
    expect(button('Cofnij')).toBeUndefined();
  });

  it.each([
    ['Zatwierdź', 'confirm'],
    ['Odrzuć', 'reject'],
  ])('"%s" asks the server to %s it and then syncs', async (label, action) => {
    const fetch = mockApi(() => ({ status: 200, body: { status: 'confirmed', changes: [] } }));
    const { tap } = card(pending());
    await tap(label);
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [path, init] = fetch.mock.calls[0]!;
    expect(path).toBe(`/api/agent/proposals/p1/${action}`);
    expect(init?.method).toBe('POST');
    expect(toasts).toEqual([]);
  });

  it('cannot be decided before the turn is over', () => {
    const { disabled } = card(pending(), false);
    expect(disabled('Zatwierdź')).toBe(true);
    expect(disabled('Odrzuć')).toBe(true);
  });

  it('holds its buttons while the request runs and gives them back', async () => {
    let answer: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
    );
    const { wrapper, tap, disabled } = card(pending());
    expect(disabled('Zatwierdź')).toBe(false);
    await tap('Zatwierdź');
    await wrapper.vm.$nextTick();
    expect(disabled('Zatwierdź')).toBe(true);
    expect(disabled('Odrzuć')).toBe(true);
    answer(new Response('{}', { status: 200 }));
    await vi.waitFor(() => expect(disabled('Zatwierdź')).toBe(false));
  });

  it('out of date: says so, stays pending and does not sync', async () => {
    mockApi(() => ({ status: 409, body: { error: 'stale' } }));
    const { tap, disabled, status } = card(pending());
    await tap('Zatwierdź');
    await vi.waitFor(() =>
      expect(toasts).toEqual(['Dane zmieniły się od tej propozycji. Poproś agenta o nową.']),
    );
    expect(sync).not.toHaveBeenCalled();
    expect(status().text()).toBe('Do zatwierdzenia');
    await vi.waitFor(() => expect(disabled('Zatwierdź')).toBe(false));
  });

  it('decided on another device: no error, the sync shows how', async () => {
    mockApi(() => ({ status: 409, body: { error: 'not_pending' } }));
    const { tap } = card(pending());
    await tap('Odrzuć');
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
    expect(toasts).toEqual([]);
  });

  it('without the server: says what to do', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    const { tap } = card(pending());
    await tap('Zatwierdź');
    await vi.waitFor(() =>
      expect(toasts).toEqual(['Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.']),
    );
    expect(sync).not.toHaveBeenCalled();
  });

  it('confirmed: can be undone, without the decision buttons', () => {
    const { status, button } = card({ ...pending(), status: 'confirmed', groupId: 'g1' });
    expect(status().text()).toBe('Zatwierdzone');
    expect(button('Cofnij')).toBeDefined();
    expect(button('Zatwierdź')).toBeUndefined();
  });

  it('rejected: nothing left to do', () => {
    const { status, wrapper } = card({ ...pending(), status: 'rejected' });
    expect(status().text()).toBe('Odrzucone');
    expect(wrapper.findAll('ion-button')).toHaveLength(0);
  });
});

describe('undo', () => {
  it('a write that changed nothing has no undo', () => {
    expect(card(write([loggedSet()], null)).button('Cofnij')).toBeUndefined();
  });

  it('asks the server, marks the card undone and syncs', async () => {
    const fetch = mockApi(() => ({ status: 200, body: { groupId: 'g2' } }));
    const { tap, button, note } = card(write([loggedSet()]));
    await tap('Cofnij');
    await vi.waitFor(() => expect(note().exists()).toBe(true));
    expect(note().text()).toBe('Cofnięte');
    expect(button('Cofnij')).toBeUndefined();
    expect(sync).toHaveBeenCalledTimes(1);
    const [path, init] = fetch.mock.calls[0]!;
    expect(path).toBe('/api/changes/g1/undo');
    expect(JSON.parse(init?.body as string)).toEqual({ confirm: false });
    await vi.waitFor(() => expect(toasts).toEqual(['Cofnięto zmianę.']));
  });

  it('a group already undone on this device shows that from the start', () => {
    undoneGroups.add('g1');
    const { note, button } = card(write([loggedSet()]));
    expect(note().text()).toBe('Cofnięte');
    expect(button('Cofnij')).toBeUndefined();
  });

  it('undone on another device counts as undone', async () => {
    mockApi(() => ({ status: 409, body: { error: 'already_undone' } }));
    const { tap, note } = card(write([loggedSet()]));
    await tap('Cofnij');
    await vi.waitFor(() => expect(note().exists()).toBe(true));
  });

  it('a failure keeps "Cofnij" and says why', async () => {
    mockApi(() => ({ status: 404, body: { error: 'not_found' } }));
    const { tap, button, note, disabled } = card(write([loggedSet()]));
    await tap('Cofnij');
    await vi.waitFor(() =>
      expect(toasts).toEqual(['Serwer nie ma już tego wpisu. Odśwież dane synchronizacją.']),
    );
    expect(note().exists()).toBe(false);
    expect(button('Cofnij')).toBeDefined();
    expect(sync).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(disabled('Cofnij')).toBe(false));
  });

  describe('when the records changed afterwards', () => {
    function conflictOnce() {
      let conflicts = 1;
      return mockApi(() =>
        conflicts-- > 0
          ? { status: 409, body: { error: 'conflict' } }
          : { status: 200, body: { groupId: 'g2' } },
      );
    }

    function answerAlert(role: string) {
      return vi.spyOn(alertController, 'create').mockResolvedValue({
        present: async () => {},
        onDidDismiss: async () => ({ role }),
      } as never);
    }

    it('undoes only after a confirmation', async () => {
      const fetch = conflictOnce();
      const alert = answerAlert('confirm');
      const { tap, note } = card(write([loggedSet()]));
      await tap('Cofnij');
      await vi.waitFor(() => expect(note().exists()).toBe(true));
      expect(alert).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls.map(([, init]) => JSON.parse(init?.body as string))).toEqual([
        { confirm: false },
        { confirm: true },
      ]);
    });

    it('stays as it was when the user cancels', async () => {
      const fetch = conflictOnce();
      const alert = answerAlert('cancel');
      const { tap, note, button, disabled } = card(write([loggedSet()]));
      await tap('Cofnij');
      await vi.waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(disabled('Cofnij')).toBe(false));
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(note().exists()).toBe(false);
      expect(button('Cofnij')).toBeDefined();
      expect(sync).not.toHaveBeenCalled();
    });
  });
});

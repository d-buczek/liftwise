import type { PlanToolOutput, WorkoutPlan } from '@liftwise/core';
import { toastController } from '@ionic/vue';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vite-plus/test';
import { undoneGroups } from '../agent/actions';
import { i18n } from '../i18n';
import { useAuthStore } from '../stores/auth';
import { useSyncStore } from '../stores/sync';
import { mockApi } from '../testing';
import PlanCard from './PlanCard.vue';

enableAutoUnmount(afterEach);

type PlannedExercise = WorkoutPlan['exercises'][number];
type PlannedSet = PlannedExercise['sets'][number];

const reps = (weight_kg: number, count: number, warmup = false): PlannedSet => ({
  weight_kg,
  reps: count,
  duration_s: null,
  warmup,
});
const timed = (duration_s: number): PlannedSet => ({
  weight_kg: 0,
  reps: null,
  duration_s,
  warmup: false,
});

const names = new Map([
  ['press', 'Wyciskanie hantli'],
  ['plank', 'Plank'],
  ['pushup', 'Pompki'],
]);

function plan(exercises: PlannedExercise[]): WorkoutPlan {
  return { exercises, rationale: 'Klatka odpoczęła, więc dziś ciężej.' };
}

const press: PlannedExercise = {
  exercise_id: 'press',
  sets: [reps(10, 12, true), reps(24, 10), reps(24, 10), reps(24, 9)],
  target_rir: 1,
};

function output(fields: Partial<PlanToolOutput> = {}): PlanToolOutput {
  return {
    proposalId: 'p1',
    status: 'pending',
    changes: [],
    date: '2026-11-01',
    plan: plan([press]),
    replaces: 0,
    ...fields,
  };
}

let pinia: ReturnType<typeof createPinia>;
let sync: Mock<() => Promise<void>>;

beforeEach(() => {
  pinia = createPinia();
  undoneGroups.clear();
  vi.spyOn(toastController, 'create').mockResolvedValue({ present: async () => {} } as never);
  const store = useSyncStore(pinia);
  sync = vi.fn<() => Promise<void>>(async () => undefined);
  store.sync = sync as never;
  useAuthStore(pinia).device = { id: 'device', deviceId: 'd1', token: 'token' };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function card(
  given: PlanToolOutput,
  { ready = true, regenerate }: { ready?: boolean; regenerate?: (date: string) => void } = {},
) {
  const wrapper = mount(PlanCard, {
    global: { plugins: [i18n, pinia] },
    props: { output: given, exerciseNames: names, ready, regenerate },
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
  const details = (index = 0) =>
    wrapper
      .findAll('.lw-plan__lines li')
      [index]?.findAll('span')
      .map((span) => span.text().replace(/\s+/g, ' '));
  const notes = () => wrapper.findAll('.lw-plan__note').map((note) => note.text());
  return { wrapper, button, tap, disabled, details, notes };
}

describe('what the card says', () => {
  it('shows the day, the exercises with their load and the reason', () => {
    const { wrapper, details } = card(output());
    expect(wrapper.find('.lw-plan__status').text()).toBe('Propozycja treningu');
    expect(wrapper.find('.lw-plan__title').text()).toBe('Niedziela, 1 listopada');
    expect(details()).toEqual([
      'Wyciskanie hantli',
      'Rozgrzewka: 10 kg × 12',
      '24 kg × 10, 10, 9 · cel RIR 1',
    ]);
    expect(wrapper.find('.lw-plan__rationale').text()).toBe('Klatka odpoczęła, więc dziś ciężej.');
  });

  it('groups changing weights in a session, with a decimal comma', () => {
    const drop = { exercise_id: 'press', sets: [reps(24, 10), reps(22.5, 12)], target_rir: null };
    expect(card(output({ plan: plan([drop]) })).details()).toEqual([
      'Wyciskanie hantli',
      '24 kg × 10; 22,5 kg × 12',
    ]);
  });

  it('reads a bodyweight and a timed exercise without a weight', () => {
    const { details } = card(
      output({
        plan: plan([
          { exercise_id: 'pushup', sets: [reps(0, 15), reps(0, 12)], target_rir: null },
          { exercise_id: 'plank', sets: [timed(50), timed(45)], target_rir: null },
        ]),
      }),
    );
    expect(details(0)).toEqual(['Pompki', '15, 12 powt.']);
    expect(details(1)).toEqual(['Plank', '50, 45 s']);
  });

  it.each([
    [0, 'cel RIR 0'],
    [4, 'cel RIR 4+'],
  ])('target RIR %i reads "%s"', (target_rir, text) => {
    const exercise = { exercise_id: 'press', sets: [reps(24, 10)], target_rir };
    expect(card(output({ plan: plan([exercise]) })).details()).toEqual([
      'Wyciskanie hantli',
      `24 kg × 10 · ${text}`,
    ]);
  });

  it('warm-up sets alone show no working line and no RIR', () => {
    const warmup = { exercise_id: 'press', sets: [reps(10, 12, true)], target_rir: 1 };
    expect(card(output({ plan: plan([warmup]) })).details()).toEqual([
      'Wyciskanie hantli',
      'Rozgrzewka: 10 kg × 12',
    ]);
  });

  it('an exercise no longer in the catalog still reads', () => {
    const orphan = { exercise_id: 'gone', sets: [reps(24, 10)], target_rir: null };
    expect(card(output({ plan: plan([orphan]) })).details()?.[0]).toBe(
      'Ćwiczenie usunięte z katalogu',
    );
  });

  it.each([
    [1, 'Zastąpi 1 zaplanowaną serię'],
    [3, 'Zastąpi 3 zaplanowane serie'],
    [5, 'Zastąpi 5 zaplanowanych serii'],
  ])('warns that %i planned sets get replaced', (replaces, text) => {
    expect(card(output({ replaces })).notes()).toEqual([text]);
  });
});

describe('a pending plan', () => {
  it('"Akceptuj" confirms the proposal and syncs', async () => {
    const fetch = mockApi(() => ({ status: 200, body: { status: 'confirmed', changes: [] } }));
    const { tap } = card(output());
    await tap('Akceptuj');
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
    const [path, init] = fetch.mock.calls[0]!;
    expect(path).toBe('/api/agent/proposals/p1/confirm');
    expect(init?.method).toBe('POST');
  });

  it('"Wygeneruj ponownie" asks for another plan of the day, without touching this one', async () => {
    const fetch = mockApi(() => ({ status: 200 }));
    const regenerate = vi.fn<(date: string) => void>();
    const { tap, notes } = card(output(), { regenerate });
    expect(notes()).toEqual(['Chcesz coś zmienić? Napisz to poniżej.']);
    await tap('Wygeneruj ponownie');
    expect(regenerate).toHaveBeenCalledExactlyOnceWith('2026-11-01');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('an earlier thread can only accept: no regenerate, no hint to write', () => {
    const { button, notes } = card(output());
    expect(button('Wygeneruj ponownie')).toBeUndefined();
    expect(notes()).toEqual([]);
    expect(button('Akceptuj')).toBeDefined();
  });

  it('waits for the end of the turn', () => {
    const { disabled } = card(output(), {
      ready: false,
      regenerate: vi.fn<(date: string) => void>(),
    });
    expect(disabled('Akceptuj')).toBe(true);
    expect(disabled('Wygeneruj ponownie')).toBe(true);
  });

  it('holds its buttons while the request runs and gives them back', async () => {
    let answer: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
    );
    const { wrapper, tap, disabled } = card(output(), {
      regenerate: vi.fn<(date: string) => void>(),
    });
    expect(disabled('Akceptuj')).toBe(false);
    await tap('Akceptuj');
    await wrapper.vm.$nextTick();
    expect(disabled('Akceptuj')).toBe(true);
    expect(disabled('Wygeneruj ponownie')).toBe(true);
    answer(new Response('{}', { status: 200 }));
    await vi.waitFor(() => expect(disabled('Akceptuj')).toBe(false));
  });
});

describe('a decided plan', () => {
  const confirmed = (groupId?: string) => output({ status: 'confirmed', groupId, replaces: 2 });

  it('confirmed: says so and opens its day, the pending actions are gone', () => {
    const { wrapper, button, notes } = card(confirmed('g1'), {
      regenerate: vi.fn<(date: string) => void>(),
    });
    expect(wrapper.find('.lw-plan__status').text()).toBe('Zaakceptowana');
    expect(button('Otwórz dzień')?.element.getAttribute('routerlink')).toBe('/calendar/2026-11-01');
    expect(button('Akceptuj')).toBeUndefined();
    expect(button('Wygeneruj ponownie')).toBeUndefined();
    expect(notes()).toEqual([]);
  });

  it('"Cofnij" undoes its group, then the card says it is undone', async () => {
    const fetch = mockApi(() => ({ status: 200, body: { groupId: 'g2' } }));
    const { wrapper, tap, button, notes } = card(confirmed('g1'));
    await tap('Cofnij');
    await vi.waitFor(() => expect(notes()).toEqual(['Cofnięte']));
    expect(button('Cofnij')).toBeUndefined();
    expect(button('Otwórz dzień')).toBeDefined();
    expect(fetch.mock.calls[0]![0]).toBe('/api/changes/g1/undo');
    expect(sync).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.lw-plan__status').text()).toBe('Zaakceptowana');
  });

  it('confirmed without a group has nothing to undo', () => {
    expect(card(confirmed()).button('Cofnij')).toBeUndefined();
  });

  it('replaced by a newer plan: no actions, still readable', () => {
    const { wrapper } = card(output({ status: 'rejected', replaces: 2 }));
    expect(wrapper.find('.lw-plan__status').text()).toBe('Zastąpiona nowszą');
    expect(wrapper.findAll('ion-button')).toHaveLength(0);
    expect(wrapper.find('.lw-plan__note').exists()).toBe(false);
    expect(wrapper.find('.lw-plan__rationale').text()).not.toBe('');
  });
});

import {
  movementPatternSchema,
  muscleGroupSchema,
  newId,
  SETTING_IDS,
  DEFAULT_BALANCE_SETTINGS,
  type Exercise,
  type WorkoutSet,
} from '@liftwise/core';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { db } from '../db/database';
import { i18n } from '../i18n';
import { makeExercise, makeSet, resetDb } from '../testing';
import WeekSummary from './WeekSummary.vue';

enableAutoUnmount(afterEach);

const STAMP = '2026-10-01T10:00:00.000Z';
const syncFields = { created_at: STAMP, updated_at: STAMP, deleted_at: null, seq: 1 };

// Wednesday: the week is 2–8 November.
const NOW = new Date(2026, 10, 4, 12);
const THIS_MONTH = '2026-11';

beforeEach(async () => {
  await resetDb();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function catalogued(fields: Record<string, unknown> = {}) {
  const exercise = makeExercise(fields);
  await db.exercises.put({ ...exercise, ...syncFields });
  return exercise;
}

// A workout of the day with one set row per entry, 24 kg × 10 unless overridden.
async function trained(date: string, exercise: Exercise, sets: Partial<WorkoutSet>[]) {
  const workout_id = newId();
  await db.workouts.put({
    id: workout_id,
    date,
    started_at: null,
    ended_at: null,
    checkin: null,
    rationale: null,
    note: '',
    label_id: null,
    ...syncFields,
  });
  await db.sets.bulkPut(
    sets.map((fields, position) => ({
      ...makeSet({ workout_id, exercise_id: exercise.id, position, weight_kg: 24, ...fields }),
      ...syncFields,
    })),
  );
  return workout_id;
}

function summary(month = THIS_MONTH) {
  const wrapper = mount(WeekSummary, {
    global: {
      plugins: [i18n],
      stubs: {
        // Renders the sheet's content in place of Ionic's overlay, when open.
        IonModal: {
          props: ['isOpen'],
          emits: ['didDismiss'],
          template: '<div v-if="isOpen" class="sheet"><slot /></div>',
        },
      },
    },
    props: { month },
  });
  const heads = () => wrapper.findAll('.lw-week__head ion-button');
  const disabled = (button: { element: Element }) =>
    (button.element as Element & { disabled?: boolean }).disabled;
  return {
    wrapper,
    title: () => wrapper.find('.lw-week__title').text(),
    label: () => wrapper.find('section').attributes('aria-label'),
    empty: () => wrapper.find('.lw-week__empty'),
    stats: () => wrapper.findAll('dd').map((value) => value.text()),
    groups: () => wrapper.findAll('.lw-week__group'),
    group: (heading: string) =>
      wrapper.findAll('.lw-week__group').find((group) => group.find('h3').text() === heading),
    previous: () => heads()[0]!.trigger('click'),
    next: () => heads()[1]!.trigger('click'),
    nextDisabled: () => disabled(heads()[1]!),
  };
}

describe('the shown week', () => {
  it('a week with no workouts says so, with no numbers', async () => {
    const view = summary();
    expect(view.title()).toBe('Ten tydzień, 2 lis – 8 lis');
    expect(view.label()).toBe('Podsumowanie tygodnia 2 lis – 8 lis');
    await vi.waitFor(() =>
      expect(view.empty().text()).toBe('W tym tygodniu nie ma zrobionych treningów.'),
    );
    expect(view.stats()).toEqual([]);
    expect(view.wrapper.find('.lw-week__open').exists()).toBe(false);
  });

  it('another month starts at its last week, also when that reaches into the next month', () => {
    expect(summary('2026-09').title()).toBe('Tydzień 28 wrz – 4 paź');
  });

  it('a later month leaves "next" off', () => {
    expect(summary('2027-01').nextDisabled()).toBe(true);
  });

  it('‹ and › step by a week, up to this week', async () => {
    const view = summary();
    expect(view.nextDisabled()).toBe(true);
    await view.previous();
    expect(view.title()).toBe('Tydzień 26 paź – 1 lis');
    expect(view.nextDisabled()).toBe(false);
    await view.previous();
    expect(view.title()).toBe('Tydzień 19 paź – 25 paź');
    await view.next();
    await view.next();
    expect(view.title()).toBe('Ten tydzień, 2 lis – 8 lis');
    expect(view.nextDisabled()).toBe(true);
  });

  it('a new month replaces the stepped week', async () => {
    const view = summary();
    await view.previous();
    await view.wrapper.setProps({ month: '2026-08' } as never);
    expect(view.title()).toBe('Tydzień 31 sie – 6 wrz');
    await view.wrapper.setProps({ month: THIS_MONTH } as never);
    expect(view.title()).toBe('Ten tydzień, 2 lis – 8 lis');
  });
});

describe('the numbers of a week', () => {
  it('count workouts and working sets of that week only', async () => {
    const press = await catalogued();
    await trained('2026-10-27', press, [{}, {}, {}, {}]);
    await trained('2026-11-02', press, [
      { weight_kg: 10, reps: 12, warmup: true },
      { reps: 9 },
      { reps: 9 },
    ]);
    await trained('2026-11-04', press, [{ reps: 9 }, { status: 'planned', performed_at: null }]);
    const view = summary();
    await vi.waitFor(() => expect(view.stats()).toEqual(['2', '3', '0']));

    await view.previous();
    await vi.waitFor(() => expect(view.stats()).toEqual(['1', '4', '0']));
  });

  it('leave out deleted sets and workouts', async () => {
    const press = await catalogued();
    await trained('2026-11-02', press, [{}, {}]);
    const removed = await trained('2026-11-03', press, [{}]);
    await db.workouts.update(removed, { deleted_at: STAMP });
    const tombstone = (await db.sets.toArray()).find((row) => row.position === 1);
    await db.sets.update(tombstone!.id, { deleted_at: STAMP });
    const view = summary();
    await vi.waitFor(() => expect(view.stats()).toEqual(['1', '1', '0']));
  });

  it('a week without working sets counts as empty, even with warm-ups or a plan', async () => {
    const press = await catalogued();
    await trained('2026-10-27', press, [{}]);
    await trained('2026-11-03', press, [
      { weight_kg: 10, warmup: true },
      { status: 'planned', performed_at: null },
    ]);
    const view = summary();
    // Stepping to the week with a set shows the mirror has been read.
    await view.previous();
    await vi.waitFor(() => expect(view.stats()).toEqual(['1', '1', '0']));
    await view.next();
    expect(view.empty().text()).toBe('W tym tygodniu nie ma zrobionych treningów.');
    expect(view.stats()).toEqual([]);
  });

  it('a first workout is a baseline: no record, no groups for it', async () => {
    const press = await catalogued();
    await trained('2026-11-03', press, [{ reps: 12 }]);
    const view = summary();
    await vi.waitFor(() => expect(view.stats()).toEqual(['1', '1', '0']));
    expect(view.group('Rekordy')).toBeUndefined();
    expect(view.group('Stoi w miejscu')).toBeUndefined();
  });

  it('one row of records per exercise, with its reps and e1RM', async () => {
    const press = await catalogued();
    await trained('2026-10-27', press, [{ reps: 10 }]);
    await trained('2026-11-03', press, [{ reps: 12 }]);
    const view = summary();
    await vi.waitFor(() => expect(view.stats()).toEqual(['1', '1', '1']));
    const row = view.group('Rekordy')?.find('li');
    expect(row?.text()).toContain('Wyciskanie hantli');
    expect(row?.find('.lw-week__value').text()).toBe('24 kg × 12, e1RM 33,6 kg');
  });

  it('a record later beaten that week shows only the standing one', async () => {
    const press = await catalogued();
    await trained('2026-10-27', press, [{ reps: 10 }]);
    await trained('2026-11-02', press, [{ reps: 11 }]);
    await trained('2026-11-04', press, [{ reps: 12 }]);
    const view = summary();
    await vi.waitFor(() => expect(view.stats()).toEqual(['2', '2', '1']));
    expect(view.group('Rekordy')?.find('.lw-week__value').text()).toBe('24 kg × 12, e1RM 33,6 kg');
  });

  it('names a stalled exercise with a hint', async () => {
    const press = await catalogued();
    await trained('2026-10-21', press, [{ reps: 10 }, { reps: 10 }]);
    await trained('2026-10-28', press, [{ reps: 9 }, { reps: 9 }]);
    await trained('2026-11-03', press, [{ reps: 8 }, { reps: 8 }]);
    const view = summary();
    await vi.waitFor(() => expect(view.stats()).toEqual(['1', '2', '0']));
    const stalled = view.group('Stoi w miejscu');
    expect(stalled?.text()).toContain('Wyciskanie hantli');
    expect(stalled?.text()).toContain('Ten sam ciężar od 3 treningów');
  });

  it('lists what got no set, and only that', async () => {
    const press = await catalogued();
    await trained('2026-11-03', press, [{}]);
    const view = summary();
    await vi.waitFor(() => expect(view.stats()).toEqual(['1', '1', '0']));
    const [muscles, patterns] = view.group('Bez serii w tym tygodniu')!.findAll('p');
    expect(muscles?.text()).toMatch(/^Partie: najszersze, /);
    expect(muscles?.text()).not.toContain('klatka');
    expect(patterns?.text()).toMatch(/^Wzorce: wyciskanie pionowe, /);
    expect(patterns?.text()).not.toContain('wyciskanie poziome');
    // A single-joint marker, not a pattern to balance.
    expect(patterns?.text()).not.toContain('izolacja');
  });

  it('with everything trained there is no list of gaps', async () => {
    const everything = await catalogued({
      primary_muscles: muscleGroupSchema.options,
      patterns: movementPatternSchema.options,
    });
    await trained('2026-11-03', everything, [{}]);
    const view = summary();
    await vi.waitFor(() => expect(view.stats()).toEqual(['1', '1', '0']));
    expect(view.group('Bez serii w tym tygodniu')).toBeUndefined();
  });

  it('does not claim an empty week before the first read of the mirror', async () => {
    const press = await catalogued();
    await trained('2026-11-03', press, [{}]);
    const view = summary();
    expect(view.empty().exists()).toBe(false);
  });
});

describe('the sheet of hard sets', () => {
  async function opened(sets: Partial<WorkoutSet>[], fields: Record<string, unknown> = {}) {
    const press = await catalogued({ secondary_muscles: ['triceps'], ...fields });
    await trained('2026-11-03', press, sets);
    const view = summary();
    await vi.waitFor(() => expect(view.wrapper.find('.lw-week__open').exists()).toBe(true));
    expect(view.wrapper.find('.sheet').exists()).toBe(false);
    await view.wrapper.find('.lw-week__open').trigger('click');
    const meter = (name: string) =>
      view.wrapper
        .findAll('.lw-week__muscle')
        .find((row) => row.find('span').text() === name)
        ?.find('[role="img"]')
        .attributes('aria-label');
    return { view, meter };
  }

  it('counts a primary muscle as 1 and a secondary as 0,5, against the range', async () => {
    const { meter } = await opened([{}, {}, {}]);
    expect(meter('Klatka')).toBe('3 serie, zakres 10–20: za mało');
    expect(meter('Triceps')).toBe('1,5 serii, zakres 10–20: za mało');
    expect(meter('Łydki')).toBe('0 serii, zakres 10–20: za mało');
  });

  it('uses the saved ranges: above one is too much, inside one is fine', async () => {
    await db.settings.put({
      id: SETTING_IDS.balance,
      key: 'balance',
      value: {
        weekly_sets: {
          ...DEFAULT_BALANCE_SETTINGS.weekly_sets,
          chest: { min: 1, max: 2 },
          triceps: { min: 1, max: 2 },
        },
      },
      ...syncFields,
    });
    const { meter } = await opened([{}, {}, {}]);
    expect(meter('Klatka')).toBe('3 serie, zakres 1–2: za dużo');
    expect(meter('Triceps')).toBe('1,5 serii, zakres 1–2: w normie');
  });

  it('"Zamknij" closes it', async () => {
    const { view } = await opened([{}]);
    const close = view.wrapper
      .findAll('ion-buttons ion-button')
      .find((button) => button.html().includes('Zamknij'));
    await close?.trigger('click');
    expect(view.wrapper.find('.sheet').exists()).toBe(false);
  });
});

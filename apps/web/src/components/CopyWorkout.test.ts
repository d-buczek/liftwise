import {
  newId,
  workoutSchema,
  type Exercise,
  type WorkoutLabel,
  type WorkoutSet,
} from '@liftwise/core';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { applyLocal } from '../db/mutate';
import { i18n } from '../i18n';
import { makeExercise, makeSet, resetDb } from '../testing';
import { copyDay, type CopyResult } from '../workout/actions';
import { dayData } from '../workout/queries';
import CopyWorkout from './CopyWorkout.vue';

// The real action with a spy on it, to wait for every copy a double tap started.
vi.mock('../workout/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workout/actions')>();
  return { ...actual, copyDay: vi.fn<typeof actual.copyDay>(actual.copyDay) };
});

enableAutoUnmount(afterEach);

beforeEach(resetDb);

const TARGET = '2026-11-05';
const press = makeExercise({ name_pl: 'Wyciskanie' });

function makeLabel(name: string, fields: Partial<WorkoutLabel> = {}): WorkoutLabel {
  return { id: newId(), name, color: 'teal', archived: false, ...fields };
}

async function seedLabel(label: WorkoutLabel) {
  await applyLocal([{ op: 'upsert', entity: 'workout_labels', row: label }]);
  return label;
}

async function seedDay(
  date: string,
  sets: Partial<WorkoutSet>[],
  options: { labelId?: string; exercise?: Exercise | null } = {},
) {
  const exercise = options.exercise === undefined ? press : options.exercise;
  const workout = workoutSchema.parse({ id: newId(), date, label_id: options.labelId ?? null });
  await applyLocal([
    ...(exercise ? [{ op: 'upsert' as const, entity: 'exercises' as const, row: exercise }] : []),
    { op: 'upsert', entity: 'workouts', row: workout },
    ...sets.map((fields, position) => ({
      op: 'upsert' as const,
      entity: 'sets' as const,
      row: makeSet({
        workout_id: workout.id,
        exercise_id: exercise?.id ?? newId(),
        position,
        ...fields,
      }),
    })),
  ]);
}

function picker(props: { light?: boolean; targetDate?: string } = {}) {
  const wrapper = mount(CopyWorkout, {
    global: { plugins: [i18n] },
    props: { targetDate: props.targetDate ?? TARGET, light: props.light ?? false },
  });
  const submit = () => wrapper.find('.lw-copy__submit');
  // The default source appears once the history is read.
  const ready = () => vi.waitFor(() => expect(submit().exists()).toBe(true));
  const preview = () =>
    wrapper
      .findAll('ion-label')
      .filter((label) => label.find('h3').exists())
      .map((label) => [label.find('h3').text(), label.find('.lw-copy__sets').text()]);
  // A day's label reads "środa, 28 października, …".
  const day = (date: string) => {
    const label = new Date(`${date}T12:00:00`).toLocaleDateString('pl', {
      day: 'numeric',
      month: 'long',
    });
    return wrapper
      .findAll('.lw-month__day')
      .find((button) => button.attributes('aria-label')?.includes(`, ${label}`))!;
  };
  const selected = () =>
    wrapper
      .findAll('.lw-month__day')
      .filter((button) => button.attributes('aria-selected') === 'true')
      .map((button) => button.text());
  const setLight = async (checked: boolean) => {
    const toggle = wrapper.find('ion-toggle').element as HTMLIonToggleElement;
    toggle.checked = checked;
    toggle.dispatchEvent(new CustomEvent('ionChange'));
    await flushPromises();
  };
  const copied = () => vi.waitFor(() => expect(wrapper.emitted('done')).toBeTruthy());
  return { wrapper, submit, ready, preview, day, selected, setLight, copied };
}

it('with nothing before the target day it says so and offers no copy', async () => {
  await seedDay(TARGET, [{}]);
  await seedDay('2026-11-20', [{}]);
  const { wrapper, submit } = picker();
  await vi.waitFor(() => expect(wrapper.text()).toContain('Nie ma jeszcze treningu'));
  expect(submit().exists()).toBe(false);
  expect(wrapper.find('.lw-month').exists()).toBe(false);
});

it('starts on the last workout before the target, in that month, and previews its sets', async () => {
  await seedDay('2026-10-10', [{ weight_kg: 10 }]);
  await seedDay('2026-10-28', [
    { weight_kg: 22.5, reps: 8 },
    { weight_kg: 22.5, reps: 7 },
  ]);
  await seedDay('2026-11-20', [{ weight_kg: 50 }]);

  const { wrapper, submit, ready, preview, selected } = picker();
  await ready();

  expect(wrapper.find('.lw-month__title').text()).toBe('październik 2026');
  expect(selected()).toEqual(['28']);
  expect(preview()).toEqual([['Wyciskanie', '22,5 kg × 8, 22,5 kg × 7']]);
  expect(submit().text()).toBe('Kopiuj na 5 listopada');
});

it('previews only the done sets of a day that has them, and planned ones of a day that has none', async () => {
  await seedDay('2026-10-20', [
    { status: 'planned', weight_kg: 10 },
    { status: 'planned', weight_kg: 12.5 },
  ]);
  await seedDay('2026-10-28', [{ weight_kg: 20 }, { status: 'planned', weight_kg: 30 }]);

  const { ready, preview, day } = picker();
  await ready();
  expect(preview()).toEqual([['Wyciskanie', '20 kg × 10']]);

  await day('2026-10-20').trigger('click');
  expect(preview()).toEqual([['Wyciskanie', '10 kg × 10, 12,5 kg × 10']]);
});

it('a timed set previews its seconds, and an exercise gone from the catalog its stand-in name', async () => {
  await seedDay('2026-10-28', [{ weight_kg: 0, reps: null, duration_s: 45 }], { exercise: null });
  const { ready, preview } = picker();
  await ready();
  expect(preview()).toEqual([['Ćwiczenie usunięte z katalogu', '0 kg × 45 s']]);
});

it('only days before the target with sets can be picked', async () => {
  await seedDay('2026-10-28', [{}]);
  await seedDay(TARGET, [{}]);
  const { wrapper, ready, day } = picker();
  await ready();

  const off = (date: string) => (day(date).element as HTMLButtonElement).disabled;
  expect(off('2026-10-28')).toBe(false);
  expect(off('2026-10-27')).toBe(true);

  await wrapper.find('ion-button[aria-label="Następny miesiąc"]').trigger('click');
  await flushPromises();
  expect(off(TARGET)).toBe(true);
});

it('copies the chosen day to the target as planned sets and reports it to the parent', async () => {
  await seedDay('2026-10-20', [{ weight_kg: 10, reps: 12 }]);
  await seedDay('2026-10-28', [{ weight_kg: 20 }]);
  const { wrapper, submit, ready, day, copied } = picker();
  await ready();
  await day('2026-10-20').trigger('click');

  await submit().trigger('click');
  await copied();

  const [[sourceDate, copy]] = wrapper.emitted('done') as [[string, CopyResult]];
  expect(sourceDate).toBe('2026-10-20');
  expect(copy.sets).toMatchObject([{ status: 'planned', weight_kg: 10, reps: 12 }]);
  expect(copy.created?.date).toBe(TARGET);
  const target = await dayData(TARGET);
  expect(target.sets.map((set) => set.id)).toEqual([copy.sets[0]!.id]);
});

it('the light switch changes the title and the preview, and the copy matches the preview', async () => {
  await seedDay('2026-10-28', [{ weight_kg: 20 }, { weight_kg: 20 }, { weight_kg: 20 }]);
  const { wrapper, submit, ready, preview, setLight, copied } = picker();
  await ready();
  expect(wrapper.find('ion-title').text()).toBe('Kopiuj trening');
  expect(preview()).toEqual([['Wyciskanie', '20 kg × 10, 20 kg × 10, 20 kg × 10']]);

  await setLight(true);
  expect(wrapper.find('ion-title').text()).toBe('Kopiuj jako lżejszy');
  expect(preview()).toEqual([['Wyciskanie', '17,5 kg × 10, 17,5 kg × 10']]);

  await submit().trigger('click');
  await copied();
  const target = await dayData(TARGET);
  expect(target.sets.map((set) => set.weight_kg)).toEqual([17.5, 17.5]);
});

it('opened as "lżejszy" it starts lighter and can be switched back', async () => {
  await seedDay('2026-10-28', [{ weight_kg: 20 }, { weight_kg: 20 }]);
  const { ready, preview, setLight } = picker({ light: true });
  await ready();
  expect(preview()).toEqual([['Wyciskanie', '17,5 kg × 10']]);

  await setLight(false);
  expect(preview()).toEqual([['Wyciskanie', '20 kg × 10, 20 kg × 10']]);
});

it('"Ostatni A" picks the last day with that label, turning to its month', async () => {
  const a = await seedLabel(makeLabel('A'));
  await seedDay('2026-09-01', [{ weight_kg: 10 }], { labelId: a.id });
  await seedDay('2026-09-15', [{ weight_kg: 12.5 }], { labelId: a.id });
  await seedDay('2026-10-28', [{ weight_kg: 20 }]);

  const { wrapper, ready, preview, selected } = picker();
  await ready();
  const chip = wrapper.find('.lw-copy__last-option');
  expect(chip.attributes('aria-label')).toBe('Ostatni trening A, 15 września');
  expect(chip.attributes('aria-pressed')).toBe('false');

  await chip.trigger('click');
  expect(chip.attributes('aria-pressed')).toBe('true');
  expect(wrapper.find('.lw-month__title').text()).toBe('wrzesień 2026');
  expect(selected()).toEqual(['15 A']);
  expect(preview()).toEqual([['Wyciskanie', '12,5 kg × 10']]);
});

it('offers no shortcut for an archived label or one used only from the target day on', async () => {
  const archived = await seedLabel(makeLabel('Stary', { archived: true }));
  const later = await seedLabel(makeLabel('Potem'));
  await seedDay('2026-10-28', [{}], { labelId: archived.id });
  await seedDay(TARGET, [{}], { labelId: later.id });

  const { wrapper, ready } = picker();
  await ready();
  expect(wrapper.find('.lw-copy__last').exists()).toBe(false);
});

it('an archived label on the source day still shows on the calendar, but is not inherited', async () => {
  const archived = await seedLabel(makeLabel('Stary', { archived: true }));
  await seedDay('2026-10-28', [{}], { labelId: archived.id });

  const { wrapper, submit, ready, day, copied } = picker();
  await ready();
  expect(day('2026-10-28').text()).toContain('Stary');

  await submit().trigger('click');
  await copied();
  const [[, copy]] = wrapper.emitted('done') as [[string, CopyResult]];
  expect(copy.created?.label_id).toBeNull();
});

// Bug: CopyWorkout.vue:98 has no `busy` guard, so a tap before the disabled render copies again.
it.fails('a second tap before the button renders disabled does not copy again', async () => {
  await seedDay('2026-10-28', [{}]);
  const { submit, ready } = picker();
  await ready();
  vi.mocked(copyDay).mockClear();

  await submit().trigger('click');
  await submit().trigger('click');
  await Promise.all(vi.mocked(copyDay).mock.results.map((result) => result.value));

  expect((await dayData(TARGET)).sets).toHaveLength(1);
});

it('"Anuluj" closes without copying', async () => {
  await seedDay('2026-10-28', [{}]);
  const { wrapper, ready } = picker();
  await ready();
  await wrapper.find('ion-buttons ion-button').trigger('click');
  expect(wrapper.emitted('close')).toHaveLength(1);
  expect(wrapper.emitted('done')).toBeUndefined();
  expect((await dayData(TARGET)).sets).toEqual([]);
});

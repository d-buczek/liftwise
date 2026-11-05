import { newId, workoutSchema, type Exercise } from '@liftwise/core';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { applyLocal, type LocalChange } from '../db/mutate';
import { i18n } from '../i18n';
import { makeExercise, makeSet, resetDb } from '../testing';
import ExercisePicker from './ExercisePicker.vue';

enableAutoUnmount(afterEach);

beforeEach(resetDb);

async function seed(exercises: Exercise[], done: Exercise[] = []) {
  const workout = workoutSchema.parse({ id: newId(), date: '2026-10-01' });
  const changes: LocalChange[] = [
    ...exercises.map((row) => ({ op: 'upsert' as const, entity: 'exercises' as const, row })),
    { op: 'upsert', entity: 'workouts', row: workout },
    ...done.map((exercise) => ({
      op: 'upsert' as const,
      entity: 'sets' as const,
      row: makeSet({ workout_id: workout.id, exercise_id: exercise.id }),
    })),
  ];
  await applyLocal(changes);
}

function picker(props: { swapFor?: Exercise | null; exclude?: string[] } = {}) {
  const wrapper = mount(ExercisePicker, { global: { plugins: [i18n] }, props });
  // Sections in order, each with the names on offer.
  const sections = () => {
    const lists = wrapper.findAll('ion-list');
    return wrapper
      .findAll('h2')
      .map((heading, i) => [heading.text(), lists[i]!.findAll('h3').map((name) => name.text())]);
  };
  const search = async (text: string) => {
    const bar = wrapper.find('ion-searchbar').element as HTMLIonSearchbarElement;
    bar.value = text;
    bar.dispatchEvent(new CustomEvent('ionInput'));
    await flushPromises();
  };
  const item = (name: string) =>
    wrapper.findAll('ion-item').find((candidate) => candidate.find('h3').text() === name)!;
  // The first sections appear once the catalog is read.
  const loaded = () => vi.waitFor(() => expect(wrapper.find('h2').exists()).toBe(true));
  return { wrapper, sections, search, item, loaded };
}

it('shows recent exercises first, then the rest by name, then what the equipment lacks', async () => {
  const recent = makeExercise({ name_pl: 'Zakroki' });
  await seed(
    [
      makeExercise({ name_pl: 'Wyciskanie' }),
      recent,
      makeExercise({ name_pl: 'Biceps' }),
      makeExercise({ name_pl: 'Ławka', requires: ['bench'] }),
    ],
    [recent],
  );
  const { sections, loaded } = picker();
  await loaded();
  expect(sections()).toEqual([
    ['Ostatnio robione', ['Zakroki']],
    ['Wszystkie', ['Biceps', 'Wyciskanie']],
    ['Wymaga sprzętu spoza profilu', ['Ławka']],
  ]);
});

it('does not offer archived exercises or those the day already has', async () => {
  const own = makeExercise({ name_pl: 'Własne' });
  await seed([
    own,
    makeExercise({ name_pl: 'Archiwalne', archived: true }),
    makeExercise({ name_pl: 'Wolne' }),
  ]);
  const { sections, loaded } = picker({ exclude: [own.id] });
  await loaded();
  expect(sections()).toEqual([['Wszystkie', ['Wolne']]]);
});

it('a tap gives the whole exercise, and each row names its muscles', async () => {
  const exercise = makeExercise({ primary_muscles: ['chest', 'triceps'] });
  await seed([exercise]);
  const { wrapper, item, loaded } = picker();
  await loaded();
  expect(item(exercise.name_pl).find('p').text()).toBe('klatka, triceps');

  await item(exercise.name_pl).trigger('click');
  const [[picked]] = wrapper.emitted('pick') as [[Exercise]];
  expect(picked).toMatchObject(exercise);
});

it('filters by what was typed, and says so when nothing matches', async () => {
  await seed([
    makeExercise({ name_pl: 'Wyciskanie hantli' }),
    makeExercise({ name_pl: 'Wiosłowanie', aliases: ['row'] }),
  ]);
  const { wrapper, sections, search, loaded } = picker();
  await loaded();

  await search('row');
  expect(sections()).toEqual([['Wszystkie', ['Wiosłowanie']]]);

  await search('xyz');
  expect(sections()).toEqual([]);
  expect(wrapper.find('.lw-picker__empty').text()).toBe('Żadne ćwiczenie nie pasuje do „xyz”.');
});

it('a swap names the exercise, puts similar ones first and keeps to its measure', async () => {
  const swapped = makeExercise({ name_pl: 'Wyciskanie' });
  await seed([
    swapped,
    makeExercise({ name_pl: 'Rozpiętki' }),
    makeExercise({ name_pl: 'Biceps', primary_muscles: ['biceps'], patterns: ['isolation'] }),
    makeExercise({
      name_pl: 'Deska',
      measure: 'time',
      rep_range: undefined,
      time_range_s: { min: 30, max: 60 },
    }),
  ]);
  const { wrapper, sections, loaded } = picker({ swapFor: swapped });
  await loaded();
  expect(wrapper.find('ion-title').text()).toBe('Zamień: Wyciskanie');
  expect(sections()).toEqual([
    ['Podobne', ['Rozpiętki']],
    ['Wszystkie', ['Biceps']],
  ]);
});

it('does not claim that nothing matches before the catalog has been read', async () => {
  await seed([makeExercise()]);
  const { wrapper } = picker();
  expect(wrapper.find('.lw-picker__empty').exists()).toBe(false);
});

it('"Anuluj" closes without picking', async () => {
  await seed([makeExercise()]);
  const { wrapper, loaded } = picker();
  await loaded();
  await wrapper.find('ion-buttons ion-button').trigger('click');
  expect(wrapper.emitted('close')).toHaveLength(1);
  expect(wrapper.emitted('pick')).toBeUndefined();
});

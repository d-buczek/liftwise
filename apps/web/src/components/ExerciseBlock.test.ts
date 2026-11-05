import type { Exercise, WorkoutSet } from '@liftwise/core';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { i18n } from '../i18n';
import { makeExercise, makeSet } from '../testing';
import ExerciseBlock from './ExerciseBlock.vue';

enableAutoUnmount(afterEach);

type Props = {
  exercise?: Exercise | undefined;
  sets?: WorkoutSet[];
  hint?: string | null;
  openable?: boolean;
};

function block(props: Props = {}) {
  const wrapper = mount(ExerciseBlock, {
    global: { plugins: [i18n] },
    props: {
      exercise: 'exercise' in props ? props.exercise : makeExercise({ name_pl: 'Wyciskanie' }),
      sets: props.sets ?? [],
      hint: props.hint ?? null,
      openable: props.openable ?? false,
    },
  });
  const tiles = () => wrapper.findAll('.lw-tile:not(.is-add)');
  // What a tile shows: the weight and the reps or seconds.
  const shown = (index: number) =>
    ['.lw-tile__weight', '.lw-tile__value'].map((part) => tiles()[index]!.find(part).text());
  const notes = () => wrapper.findAll('.lw-block__note').map((note) => note.text());
  return { wrapper, tiles, shown, notes };
}

it('a done set reads as done with a check mark, a planned one as planned without it', () => {
  const { tiles, shown } = block({
    sets: [
      makeSet({ weight_kg: 22.5, reps: 10 }),
      makeSet({ status: 'planned', weight_kg: 31.25, reps: 8 }),
    ],
  });
  expect(tiles()[0]!.attributes('aria-label')).toBe('Seria 1: 22,5 kg × 10, zrobiona');
  expect(shown(0)).toEqual(['22,5kg', '× 10']);
  expect(tiles()[0]!.find('.lw-tile__check').exists()).toBe(true);

  expect(tiles()[1]!.attributes('aria-label')).toBe('Seria 2: 31,25 kg × 8, zaplanowana');
  expect(tiles()[1]!.find('.lw-tile__check').exists()).toBe(false);
});

it('a timed set shows its seconds, also at bodyweight, not reps', () => {
  const { tiles, shown } = block({
    exercise: makeExercise({
      measure: 'time',
      rep_range: undefined,
      time_range_s: { min: 30, max: 60 },
    }),
    sets: [makeSet({ weight_kg: 0, reps: null, duration_s: 45 })],
  });
  expect(tiles()[0]!.attributes('aria-label')).toBe('Seria 1: 0 kg × 45 s, zrobiona');
  expect(shown(0)).toEqual(['0kg', '45 s']);
});

it('a warm-up carries its tag and says so to a screen reader', () => {
  const { tiles } = block({ sets: [makeSet({ warmup: true }), makeSet()] });
  expect(tiles()[0]!.text()).toContain('rozgrz.');
  expect(tiles()[0]!.attributes('aria-label')).toBe('Seria 1: 20 kg × 10, zrobiona, rozgrzewka');
  expect(tiles()[1]!.text()).not.toContain('rozgrz.');
});

it('a tile gives its own set to edit and the last tile asks for a new set', async () => {
  const sets = [makeSet(), makeSet({ status: 'planned' })];
  const { wrapper, tiles } = block({ sets });
  await tiles()[1]!.trigger('click');
  expect(wrapper.emitted('editSet')).toEqual([[sets[1]]]);

  await wrapper.find('.lw-tile.is-add').trigger('click');
  expect(wrapper.emitted('addSet')).toHaveLength(1);
});

it('the target RIR comes from the first planned set that has one', () => {
  const { notes } = block({
    sets: [
      makeSet({ rir: 3 }),
      makeSet({ status: 'planned', rir: null }),
      makeSet({ status: 'planned', rir: 1 }),
      makeSet({ status: 'planned', rir: 2 }),
    ],
  });
  expect(notes()).toEqual(['Cel: RIR 1']);
});

it.each([
  [0, 'Cel: RIR 0'],
  [4, 'Cel: RIR 4+'],
])('a planned RIR of %i shows as a target', (rir, text) => {
  const { notes } = block({ sets: [makeSet({ status: 'planned', rir })] });
  expect(notes()).toEqual([text]);
});

it('the RIR of a done set is not a target', () => {
  const { notes } = block({ sets: [makeSet({ rir: 1 }), makeSet({ status: 'planned' })] });
  expect(notes()).toEqual([]);
});

it('shows the setup note above the target', () => {
  const { notes } = block({
    exercise: makeExercise({ note: 'Ławka na 3' }),
    sets: [makeSet({ status: 'planned', rir: 1 })],
  });
  expect(notes()).toEqual(['Ławka na 3', 'Cel: RIR 1']);
});

it('an exercise gone from the catalog keeps its sets under a stand-in name', () => {
  const { wrapper, tiles } = block({ exercise: undefined, sets: [makeSet()], openable: true });
  const name = wrapper.find('.lw-block__open');
  expect(name.text()).toBe('Ćwiczenie usunięte z katalogu');
  expect(name.attributes('aria-label')).toBe('Trening: Ćwiczenie usunięte z katalogu');
  expect(tiles()).toHaveLength(1);
});

it('with openable the name opens the workout; without it the name is plain text', async () => {
  const openable = block({ openable: true });
  await openable.wrapper.find('.lw-block__name button').trigger('click');
  expect(openable.wrapper.emitted('open')).toHaveLength(1);

  const plain = block({ openable: false });
  expect(plain.wrapper.find('.lw-block__name').text()).toBe('Wyciskanie');
  expect(plain.wrapper.find('.lw-block__name button').exists()).toBe(false);
});

it('the hint chip applies the hint, and with no hint there is no chip', async () => {
  const { wrapper } = block({ hint: '↑ 22,5 kg × 8' });
  const chip = wrapper.find('.lw-hint');
  expect(chip.text()).toBe('↑ 22,5 kg × 8');
  expect(chip.attributes('aria-label')).toBe('Zastosuj podpowiedź: ↑ 22,5 kg × 8');
  await chip.trigger('click');
  expect(wrapper.emitted('applyHint')).toHaveLength(1);

  expect(block().wrapper.find('.lw-hint').exists()).toBe(false);
});

it('the more button asks for the actions of this exercise', async () => {
  const { wrapper } = block();
  await wrapper.find('.lw-block__more').trigger('click');
  expect(wrapper.emitted('actions')).toHaveLength(1);
});

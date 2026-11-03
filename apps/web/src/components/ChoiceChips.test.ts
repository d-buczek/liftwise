import { mount } from '@vue/test-utils';
import { expect, it } from 'vite-plus/test';
import ChoiceChips from './ChoiceChips.vue';

const options = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
];

function chips(modelValue: number | null, clearTo?: number | null) {
  const updates: unknown[] = [];
  const wrapper = mount(ChoiceChips, {
    props: {
      label: 'Samopoczucie',
      options,
      modelValue,
      clearTo,
      'onUpdate:modelValue': (value: unknown) => updates.push(value),
    },
  });
  const tap = (index: number) => wrapper.findAll('button')[index]!.trigger('click');
  return { tap, updates };
}

it('tapping a chip chooses it', async () => {
  const { tap, updates } = chips(null, null);
  await tap(1);
  expect(updates).toEqual([2]);
});

it('tapping the chosen chip clears an optional answer', async () => {
  const { tap, updates } = chips(2, null);
  await tap(1);
  expect(updates).toEqual([null]);
});

it('without clearTo the chosen chip stays', async () => {
  const { tap, updates } = chips(2);
  await tap(1);
  expect(updates).toEqual([]);
});

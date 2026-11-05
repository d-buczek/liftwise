import type { MuscleGroup, Range } from '@liftwise/core';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { i18n } from '../i18n';
import BalanceRangeEditor from './BalanceRangeEditor.vue';

enableAutoUnmount(afterEach);

function editor(range: Range, group: MuscleGroup = 'chest') {
  const wrapper = mount(BalanceRangeEditor, {
    global: { plugins: [i18n] },
    props: { group, range },
  });
  const steppers = wrapper.findAll('.lw-stepper');
  const step = (bound: 'min' | 'max', direction: 1 | -1) =>
    steppers[bound === 'min' ? 0 : 1]!.findAll('.lw-stepper__button')[
      direction === 1 ? 1 : 0
    ]!.trigger('click');
  const shown = () => wrapper.findAll('output').map((output) => output.text());
  const button = (text: string) =>
    wrapper.findAll('ion-button').find((candidate) => candidate.text() === text)!;
  return { wrapper, step, shown, button };
}

const defaultButton = 'Domyślnie 10–20';

it('saves the changed bounds and leaves the range it was given as it was', async () => {
  const range = { min: 12, max: 16 };
  const { wrapper, step, shown, button } = editor(range);
  await step('min', 1);
  await step('max', -1);
  expect(shown()).toEqual(['13', '15']);

  await button('Zapisz').trigger('click');
  expect(wrapper.emitted('save')).toEqual([[{ min: 13, max: 15 }]]);
  expect(range).toEqual({ min: 12, max: 16 });
});

it('a bound moved past the other takes it along, so the range never turns over', async () => {
  const { step, shown } = editor({ min: 12, max: 12 });
  await step('min', 1);
  expect(shown()).toEqual(['13', '13']);
  await step('max', -1);
  await step('max', -1);
  expect(shown()).toEqual(['11', '11']);
});

it('stops at 0 sets and at the limit of 40', async () => {
  const { step, shown } = editor({ min: 0, max: 40 });
  await step('min', -1);
  await step('max', 1);
  expect(shown()).toEqual(['0', '40']);
});

it('the default button restores 10–20, which then goes out with "Zapisz"', async () => {
  const { wrapper, shown, button } = editor({ min: 4, max: 6 }, 'calves');
  expect(wrapper.find('ion-title').text()).toBe('Łydki');

  await button(defaultButton).trigger('click');
  expect(shown()).toEqual(['10', '20']);
  await button('Zapisz').trigger('click');
  expect(wrapper.emitted('save')).toEqual([[{ min: 10, max: 20 }]]);
});

it('the default button is off only while both bounds are at the default', async () => {
  const { step, button } = editor({ min: 10, max: 20 });
  const isOff = () => (button(defaultButton).element as HTMLIonButtonElement).disabled;
  expect(isOff()).toBe(true);

  await step('max', 1);
  expect(isOff()).toBe(false);
});

it('"Anuluj" closes without saving what was changed', async () => {
  const { wrapper, step, button } = editor({ min: 12, max: 16 });
  await step('min', 1);
  await button('Anuluj').trigger('click');
  expect(wrapper.emitted('close')).toHaveLength(1);
  expect(wrapper.emitted('save')).toBeUndefined();
});

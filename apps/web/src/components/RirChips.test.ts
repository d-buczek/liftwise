import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { i18n } from '../i18n';
import RirChips from './RirChips.vue';

enableAutoUnmount(afterEach);

function chipsFor(value: number | null) {
  const updates: (number | null)[] = [];
  const wrapper = mount(RirChips, {
    global: { plugins: [i18n] },
    props: {
      modelValue: value,
      'onUpdate:modelValue': (next: number | null) => updates.push(next),
    },
  });
  const chips = wrapper.findAll('[role="radio"]');
  const chosen = chips.filter((chip) => chip.attributes('aria-checked') === 'true');
  return { chips, chosen: chosen.map((chip) => chip.text()), updates };
}

it('offers 0 to 4, the last one reading "4+", with nothing chosen when there is no answer', () => {
  const { chips, chosen } = chipsFor(null);
  expect(chips.map((chip) => chip.text())).toEqual(['0', '1', '2', '3', '4+']);
  expect(chosen).toEqual([]);
});

it('RIR 0 is an answer: its chip shows as chosen and a tap on it clears the answer', async () => {
  const { chips, chosen, updates } = chipsFor(0);
  expect(chosen).toEqual(['0']);
  await chips[0]!.trigger('click');
  expect(updates).toEqual([null]);
});

it('a tap on another chip chooses that value, the "4+" chip giving 4', async () => {
  const { chips, updates } = chipsFor(2);
  await chips[3]!.trigger('click');
  await chips[4]!.trigger('click');
  expect(updates).toEqual([3, 4]);
});

it('with no answer a tap on 0 chooses 0 rather than clearing', async () => {
  const { chips, updates } = chipsFor(null);
  await chips[0]!.trigger('click');
  expect(updates).toEqual([0]);
});

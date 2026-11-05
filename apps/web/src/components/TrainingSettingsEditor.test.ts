import type { TrainingSettings } from '@liftwise/core';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { i18n } from '../i18n';
import TrainingSettingsEditor from './TrainingSettingsEditor.vue';

enableAutoUnmount(afterEach);

const settings: TrainingSettings = {
  rest_seconds: 120,
  target_rir: { min: 1, max: 2 },
  weight_step_kg: 1.25,
};

function editor(fields: Partial<TrainingSettings> = {}) {
  const given = { ...settings, ...fields };
  const wrapper = mount(TrainingSettingsEditor, {
    global: { plugins: [i18n] },
    props: { settings: given },
  });
  const stepper = (label: string) =>
    wrapper.findAll('.lw-stepper').find((item) => item.attributes('aria-label') === label)!;
  const step = (label: string, direction: 1 | -1) =>
    stepper(label).findAll('.lw-stepper__button')[direction === 1 ? 1 : 0]!.trigger('click');
  const value = (label: string) => stepper(label).find('output').text();
  const chips = () => wrapper.findAll('.lw-choice__chip');
  const button = (text: string) =>
    wrapper.findAll('ion-button').find((candidate) => candidate.text() === text)!;
  const save = async () => {
    await button('Zapisz').trigger('click');
    return wrapper.emitted<[TrainingSettings]>('save')?.at(-1)?.[0];
  };
  return { wrapper, given, step, value, chips, button, save };
}

const REST = 'Domyślna przerwa';
const RIR_MIN = 'Od';
const RIR_MAX = 'Do';

it('saves every change together', async () => {
  const { step, chips, save } = editor();
  await step(REST, 1);
  await step(RIR_MAX, 1);
  await chips()
    .find((chip) => chip.text() === '2,5')!
    .trigger('click');
  expect(await save()).toEqual({
    rest_seconds: 135,
    target_rir: { min: 1, max: 3 },
    weight_step_kg: 2.5,
  });
});

it('changes nothing in the settings it was given until the parent saves them', async () => {
  const { given, step, save } = editor();
  await step(RIR_MIN, 1);
  await step(RIR_MIN, 1);
  await save();
  expect(given).toEqual(settings);
});

it('a RIR bound moved past the other takes it along', async () => {
  const { step, value, save } = editor({ target_rir: { min: 2, max: 2 } });
  await step(RIR_MIN, 1);
  expect([value(RIR_MIN), value(RIR_MAX)]).toEqual(['3', '3']);
  await step(RIR_MAX, -1);
  await step(RIR_MAX, -1);
  expect([value(RIR_MIN), value(RIR_MAX)]).toEqual(['1', '1']);
  expect((await save())?.target_rir).toEqual({ min: 1, max: 1 });
});

it('the target RIR stops at 0 and at 4, which reads "4+"', async () => {
  const { step, value, save } = editor({ target_rir: { min: 0, max: 4 } });
  expect(value(RIR_MAX)).toBe('4+');
  await step(RIR_MIN, -1);
  await step(RIR_MAX, 1);
  expect((await save())?.target_rir).toEqual({ min: 0, max: 4 });
});

it('the rest reads as a clock and at 0 as no timer, never going below', async () => {
  const { step, value, save } = editor({ rest_seconds: 15 });
  expect(value(REST)).toBe('0:15');
  await step(REST, -1);
  expect(value(REST)).toBe('bez timera');
  await step(REST, -1);
  expect((await save())?.rest_seconds).toBe(0);
});

it('an uncommon current step is on offer and chosen, among the others in order', () => {
  const { chips } = editor({ weight_step_kg: 1.75 });
  expect(chips().map((chip) => chip.text())).toEqual(['0,5', '1', '1,25', '1,75', '2', '2,5']);
  expect(
    chips()
      .filter((chip) => chip.attributes('aria-checked') === 'true')
      .map((chip) => chip.text()),
  ).toEqual(['1,75']);
});

it('"Anuluj" closes without saving what was changed', async () => {
  const { wrapper, step, button } = editor();
  await step(REST, 1);
  await button('Anuluj').trigger('click');
  expect(wrapper.emitted('close')).toHaveLength(1);
  expect(wrapper.emitted('save')).toBeUndefined();
});

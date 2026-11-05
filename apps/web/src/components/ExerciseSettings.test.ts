import type { Exercise } from '@liftwise/core';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { i18n } from '../i18n';
import { makeExercise } from '../testing';
import ExerciseSettings from './ExerciseSettings.vue';

enableAutoUnmount(afterEach);

function settings(fields: Record<string, unknown> = {}) {
  const exercise = makeExercise({ note: 'Ławka na 3', rest_seconds: 90, ...fields });
  const wrapper = mount(ExerciseSettings, {
    global: { plugins: [i18n] },
    props: {
      exercise,
      training: { rest_seconds: 120, target_rir: { min: 1, max: 2 }, weight_step_kg: 1.25 },
    },
  });
  const typeNote = async (text: string) => {
    const note = wrapper.find('ion-textarea').element as HTMLIonTextareaElement;
    note.value = text;
    note.dispatchEvent(new CustomEvent('ionInput'));
    await flushPromises();
  };
  const chips = () => wrapper.findAll('.lw-choice__chip');
  const chip = (text: string) => chips().find((candidate) => candidate.text() === text)!;
  const chosen = () =>
    chips()
      .filter((candidate) => candidate.attributes('aria-checked') === 'true')
      .map((candidate) => candidate.text());
  const stepRest = (direction: 1 | -1) =>
    wrapper.findAll('.lw-stepper__button')[direction === 1 ? 1 : 0]!.trigger('click');
  const rest = () => wrapper.find('output').text();
  const button = (text: string) =>
    wrapper.findAll('ion-button').find((candidate) => candidate.text() === text)!;
  const save = async () => {
    await button('Zapisz').trigger('click');
    return wrapper.emitted<[Exercise]>('save')?.at(-1)?.[0];
  };
  return { wrapper, exercise, typeNote, chips, chip, chosen, stepRest, rest, button, save };
}

it('saves the whole exercise with only the three settings changed', async () => {
  const { exercise, typeNote, chip, stepRest, save } = settings();
  await typeNote('Chwyt neutralny');
  await chip('2,5').trigger('click');
  await stepRest(1);
  expect(await save()).toEqual({
    ...exercise,
    note: 'Chwyt neutralny',
    weight_step_kg: 2.5,
    rest_seconds: 105,
  });
});

it('the note is trimmed, and a blank one is no note', async () => {
  const { typeNote, save } = settings();
  await typeNote('  Ławka na 3 ');
  expect((await save())?.note).toBe('Ławka na 3');
  await typeNote('   ');
  expect((await save())?.note).toBeNull();
});

it('without an own step the default chip is chosen and names the training step', async () => {
  const { chosen, save } = settings({ weight_step_kg: null });
  expect(chosen()).toEqual(['domyślny (1,25)']);
  expect((await save())?.weight_step_kg).toBeNull();
});

it('an own step can go back to the default', async () => {
  const { chosen, chip, save } = settings({ weight_step_kg: 2 });
  expect(chosen()).toEqual(['2']);
  await chip('domyślny (1,25)').trigger('click');
  expect((await save())?.weight_step_kg).toBeNull();
});

it('an uncommon own step is on offer and stays so after choosing another', async () => {
  const { chips, chip, chosen } = settings({ weight_step_kg: 0.75 });
  const offered = ['domyślny (1,25)', '0,5', '0,75', '1', '1,25', '2', '2,5'];
  expect(chips().map((item) => item.text())).toEqual(offered);
  expect(chosen()).toEqual(['0,75']);

  await chip('1').trigger('click');
  expect(chosen()).toEqual(['1']);
  expect(chips().map((item) => item.text())).toEqual(offered);
});

it('a rest stepped to 0 reads as no timer, stays there and is saved as 0', async () => {
  const { stepRest, rest, save } = settings({ rest_seconds: 15 });
  expect(rest()).toBe('0:15');
  await stepRest(-1);
  expect(rest()).toBe('bez timera');
  await stepRest(-1);
  expect((await save())?.rest_seconds).toBe(0);
  await stepRest(1);
  expect(rest()).toBe('0:15');
});

it('"Anuluj" closes without saving what was changed', async () => {
  const { wrapper, typeNote, button } = settings();
  await typeNote('Inna');
  await button('Anuluj').trigger('click');
  expect(wrapper.emitted('close')).toHaveLength(1);
  expect(wrapper.emitted('save')).toBeUndefined();
});

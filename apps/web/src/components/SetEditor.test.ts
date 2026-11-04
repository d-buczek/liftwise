import type { WorkoutSet } from '@liftwise/core';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { i18n } from '../i18n';
import { makeExercise, makeSet } from '../testing';
import SetEditor from './SetEditor.vue';

enableAutoUnmount(afterEach);

async function typing(text: string) {
  const wrapper = mount(SetEditor, {
    attachTo: document.body,
    global: { plugins: [i18n] },
    props: { set: makeSet({ weight_kg: 33 }), exercise: makeExercise(), stepKg: 1.25 },
  });
  await wrapper.find('.lw-stepper__typed').trigger('click');
  await flushPromises();
  const input = wrapper.find<HTMLInputElement>('.lw-stepper__input');
  await input.setValue(text);
  return { wrapper, input };
}

it('"Zapisz" with the field open saves the typed weight', async () => {
  const { wrapper, input } = await typing('30');
  // A press on the button blurs the field before its click.
  input.element.blur();
  await flushPromises();
  await wrapper.find('.lw-set-editor__save').trigger('click');
  const [[saved]] = wrapper.emitted('save') as [[WorkoutSet]];
  expect(saved.weight_kg).toBe(30);
});

it('a weight that does not parse holds back "Zapisz", also before the button renders disabled', async () => {
  const { wrapper } = await typing('12,3');
  await wrapper.find('.lw-set-editor__save').trigger('click');
  expect(wrapper.emitted('save')).toBeUndefined();
});

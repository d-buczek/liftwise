import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { i18n } from '../i18n';
import type { Draft } from '../workout/logging';
import SetLogger from './SetLogger.vue';

enableAutoUnmount(afterEach);

const draft: Draft = { weight_kg: 33, reps: 10, duration_s: null, warmup: false, rir: null };

async function typing(text: string) {
  const updates: Draft[] = [];
  const wrapper = mount(SetLogger, {
    attachTo: document.body,
    global: { plugins: [i18n] },
    props: {
      title: 'Seria 1',
      stepKg: 1.25,
      repeat: false,
      modelValue: draft,
      'onUpdate:modelValue': (value: Draft) => updates.push(value),
    },
  });
  await wrapper.find('.lw-stepper__typed').trigger('click');
  await flushPromises();
  const input = wrapper.find<HTMLInputElement>('.lw-stepper__input');
  await input.setValue(text);
  return { wrapper, input, updates };
}

it('"Zrobione" with the field open logs the typed weight', async () => {
  const { wrapper, input, updates } = await typing('30');
  // A press on the button blurs the field before its click.
  input.element.blur();
  await flushPromises();
  await wrapper.find('.lw-logger__done').trigger('click');
  expect(updates.at(-1)?.weight_kg).toBe(30);
  expect(wrapper.emitted('done')).toHaveLength(1);
});

it('a weight that does not parse holds back "Zrobione", also before the button renders disabled', async () => {
  const { wrapper, updates } = await typing('12,3');
  await wrapper.find('.lw-logger__done').trigger('click');
  expect(wrapper.emitted('done')).toBeUndefined();
  expect(updates).toEqual([]);
});

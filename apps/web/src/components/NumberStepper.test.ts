import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { i18n } from '../i18n';
import { parseWeightKg } from '../workout/day';
import NumberStepper from './NumberStepper.vue';

enableAutoUnmount(afterEach);

function stepper(
  props: { parse?: typeof parseWeightKg; value?: string } = { parse: parseWeightKg },
) {
  return mount(NumberStepper, {
    attachTo: document.body,
    global: { plugins: [i18n] },
    props: { label: 'Ciężar', value: '22,5', unit: 'kg', invalidText: 'Zły ciężar', ...props },
  });
}

type Stepper = ReturnType<typeof stepper>;

async function open(wrapper: Stepper) {
  await wrapper.find('.lw-stepper__typed').trigger('click');
  await flushPromises();
  return wrapper.find<HTMLInputElement>('.lw-stepper__input');
}

const isOpen = (wrapper: Stepper) => wrapper.find('.lw-stepper__input').exists();
const steps = (wrapper: Stepper, index: number) =>
  wrapper.findAll('.lw-stepper__button')[index]!.trigger('click');

it('without parse the value is plain text and only steps', async () => {
  const wrapper = stepper({});
  expect(wrapper.find('.lw-stepper__typed').exists()).toBe(false);
  expect(wrapper.find('output').text()).toBe('22,5kg');
  await steps(wrapper, 0);
  await steps(wrapper, 1);
  expect(wrapper.emitted('step')).toEqual([[-1], [1]]);
});

it('tapping the value opens the field with its text selected, ready to replace', async () => {
  const wrapper = stepper();
  const input = await open(wrapper);
  expect(input.element.value).toBe('22,5');
  expect(document.activeElement).toBe(input.element);
  expect([input.element.selectionStart, input.element.selectionEnd]).toEqual([0, 4]);
});

it('Enter applies the text and returns the focus to the value', async () => {
  const wrapper = stepper();
  const input = await open(wrapper);
  await input.setValue('30');
  await input.trigger('keydown', { key: 'Enter' });
  await flushPromises();
  expect(wrapper.emitted('enter')).toEqual([[30]]);
  expect(isOpen(wrapper)).toBe(false);
  expect(document.activeElement).toBe(wrapper.find('.lw-stepper__typed').element);
});

it('moving the focus away applies the text', async () => {
  const wrapper = stepper();
  const input = await open(wrapper);
  await input.setValue('13,75');
  input.element.blur();
  await flushPromises();
  expect(wrapper.emitted('enter')).toEqual([[13.75]]);
  expect(isOpen(wrapper)).toBe(false);
});

it('another window taking the focus leaves the half-typed text open', async () => {
  const wrapper = stepper();
  const input = await open(wrapper);
  await input.setValue('2');
  // The window's blur reaches the field while it stays the document's active element.
  await input.trigger('blur');
  expect(wrapper.emitted('enter')).toBeUndefined();
  expect(isOpen(wrapper)).toBe(true);
});

it('Esc keeps the old value and stays inside the field, so a sheet around it stays open', async () => {
  const wrapper = stepper();
  const input = await open(wrapper);
  await input.setValue('99');
  let reachedDocument = false;
  const listener = () => (reachedDocument = true);
  document.addEventListener('keydown', listener);
  await input.trigger('keydown', { key: 'Escape' });
  document.removeEventListener('keydown', listener);
  await flushPromises();
  expect(reachedDocument).toBe(false);
  expect(wrapper.emitted('enter')).toBeUndefined();
  expect(isOpen(wrapper)).toBe(false);
  expect(document.activeElement).toBe(wrapper.find('.lw-stepper__typed').element);
});

it('an empty field keeps the old value', async () => {
  const wrapper = stepper();
  const input = await open(wrapper);
  await input.setValue('  ');
  await input.trigger('keydown', { key: 'Enter' });
  expect(wrapper.emitted('enter')).toBeUndefined();
  expect(isOpen(wrapper)).toBe(false);
});

it('text that does not parse is flagged at once and explained after an attempt', async () => {
  const wrapper = stepper();
  const input = await open(wrapper);
  await input.setValue('12,3');
  expect(wrapper.emitted('update:invalid')).toEqual([[true]]);
  expect(wrapper.find('.lw-stepper__error').exists()).toBe(false);

  await input.trigger('keydown', { key: 'Enter' });
  expect(wrapper.emitted('enter')).toBeUndefined();
  expect(isOpen(wrapper)).toBe(true);
  expect(input.attributes('aria-invalid')).toBe('true');
  // On the label's line: nothing below it moves.
  expect(wrapper.findAll('.lw-stepper__label').map((label) => label.text())).toEqual([
    'Zły ciężar',
  ]);

  await input.setValue('12,25');
  expect(wrapper.emitted('update:invalid')?.at(-1)).toEqual([false]);
  expect(wrapper.find('.lw-stepper__error').exists()).toBe(false);
});

it('a step drops text that does not parse and counts from the last good value', async () => {
  const wrapper = stepper();
  const input = await open(wrapper);
  await input.setValue('12,3');
  await steps(wrapper, 1);
  expect(wrapper.emitted('step')).toEqual([[1]]);
  expect(wrapper.emitted('enter')).toBeUndefined();
  expect(wrapper.emitted('update:invalid')?.at(-1)).toEqual([false]);
  expect(isOpen(wrapper)).toBe(false);
});

it('a new value from outside closes the field', async () => {
  const wrapper = stepper();
  const input = await open(wrapper);
  await input.setValue('12,3');
  // The .vue shim of the .ts type check doesn't know the component's props.
  await wrapper.setProps({ value: '30' } as never);
  expect(isOpen(wrapper)).toBe(false);
  expect(wrapper.emitted('update:invalid')?.at(-1)).toEqual([false]);
  expect(wrapper.find('.lw-stepper__typed').text()).toBe('30kg');
});

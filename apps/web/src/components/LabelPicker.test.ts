import { newId, type WorkoutLabel } from '@liftwise/core';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { i18n } from '../i18n';
import LabelPicker from './LabelPicker.vue';

enableAutoUnmount(afterEach);

function makeLabel(name: string, fields: Partial<WorkoutLabel> = {}): WorkoutLabel {
  return { id: newId(), name, color: 'teal', archived: false, ...fields };
}

function picker(labels: WorkoutLabel[], current: string | null = null) {
  const wrapper = mount(LabelPicker, {
    global: { plugins: [i18n] },
    props: { labels, current },
  });
  const options = () => wrapper.findAll('[role="radiogroup"] [role="radio"]');
  const names = () => options().map((option) => option.text());
  const checked = () =>
    options()
      .filter((option) => option.attributes('aria-checked') === 'true')
      .map((option) => option.text());
  const button = (text: string) =>
    wrapper.findAll('ion-button').find((candidate) => candidate.text() === text)!;
  return { wrapper, options, names, checked, button };
}

const none = 'Bez etykiety';

it('offers the active labels and "Bez etykiety", which is chosen on a day without a label', () => {
  const { names, checked } = picker([makeLabel('A'), makeLabel('Stary', { archived: true })]);
  expect(names()).toEqual(['A', none]);
  expect(checked()).toEqual([none]);
});

it('an archived label on an old workout stays shown as chosen; other archived ones do not', () => {
  const old = makeLabel('Stary', { archived: true });
  const { names, checked } = picker(
    [makeLabel('A'), old, makeLabel('Inny', { archived: true })],
    old.id,
  );
  expect(names()).toEqual(['A', 'Stary', none]);
  expect(checked()).toEqual(['Stary']);
});

it('a tap gives the label id, and "Bez etykiety" gives null', async () => {
  const label = makeLabel('A');
  const { wrapper, options } = picker([label], label.id);
  await options()[0]!.trigger('click');
  await options()[1]!.trigger('click');
  expect(wrapper.emitted('pick')).toEqual([[label.id], [null]]);
});

it('says there are no labels only when there are none, archived ones counting', () => {
  const hint = 'Nie masz jeszcze etykiet.';
  expect(picker([]).wrapper.text()).toContain(hint);
  const archivedOnly = picker([makeLabel('Stary', { archived: true })]);
  expect(archivedOnly.wrapper.text()).not.toContain(hint);
  expect(archivedOnly.names()).toEqual([none]);
});

it('"Nowa etykieta" opens the editor in place and its label goes out as created', async () => {
  const { wrapper, button } = picker([makeLabel('A', { color: 'teal' })]);
  await button('Nowa etykieta').trigger('click');
  expect(wrapper.find('ion-title').text()).toBe('Nowa etykieta');

  const input = wrapper.find('ion-input').element as HTMLIonInputElement;
  input.value = 'B';
  input.dispatchEvent(new CustomEvent('ionInput'));
  await flushPromises();
  await button('Zapisz').trigger('click');

  const [[created]] = wrapper.emitted('create') as [[WorkoutLabel]];
  expect(created).toMatchObject({ name: 'B', color: 'violet', archived: false });
  expect(wrapper.emitted('pick')).toBeUndefined();
});

it('the editor checks a new name against every label it was given', async () => {
  const { wrapper, button } = picker([makeLabel('A')]);
  await button('Nowa etykieta').trigger('click');

  const input = wrapper.find('ion-input').element as HTMLIonInputElement;
  input.value = 'a';
  input.dispatchEvent(new CustomEvent('ionInput'));
  await flushPromises();
  await button('Zapisz').trigger('click');

  expect(wrapper.emitted('create')).toBeUndefined();
});

it('"Anuluj" in the editor returns to the picker; in the picker it closes', async () => {
  const { wrapper, names, button } = picker([makeLabel('A')]);
  await button('Nowa etykieta').trigger('click');
  await button('Anuluj').trigger('click');
  expect(wrapper.emitted('close')).toBeUndefined();
  expect(names()).toEqual(['A', none]);

  await button('Anuluj').trigger('click');
  expect(wrapper.emitted('close')).toHaveLength(1);
});

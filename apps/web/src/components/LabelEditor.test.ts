import { newId, type WorkoutLabel } from '@liftwise/core';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { i18n } from '../i18n';
import LabelEditor from './LabelEditor.vue';

enableAutoUnmount(afterEach);

function makeLabel(name: string, fields: Partial<WorkoutLabel> = {}): WorkoutLabel {
  return { id: newId(), name, color: 'teal', archived: false, ...fields };
}

function editor(label: WorkoutLabel | null, labels: WorkoutLabel[] = []) {
  const wrapper = mount(LabelEditor, {
    global: { plugins: [i18n] },
    props: { label, labels: label ? [label, ...labels] : labels },
  });
  const input = wrapper.find('ion-input');
  const type = async (text: string) => {
    const element = input.element as HTMLIonInputElement;
    element.value = text;
    element.dispatchEvent(new CustomEvent('ionInput'));
    await flushPromises();
  };
  const button = (text: string) =>
    wrapper.findAll('ion-button').find((candidate) => candidate.text() === text)!;
  const save = () => button('Zapisz').trigger('click');
  const saved = () => wrapper.emitted<[WorkoutLabel]>('save')?.at(-1)?.[0];
  const colors = () => wrapper.findAll('[role="radio"]');
  const chosenColor = () =>
    colors()
      .filter((color) => color.attributes('aria-checked') === 'true')
      .map((color) => color.attributes('aria-label'));
  const shownError = () =>
    input.classes().includes('ion-invalid')
      ? (input.element as HTMLIonInputElement).errorText
      : null;
  return { wrapper, input, type, button, save, saved, colors, chosenColor, shownError };
}

it('a new label gets the trimmed name, a new id, the first free color and is active', async () => {
  const taken = makeLabel('A', { color: 'teal' });
  const old = makeLabel('B', { color: 'violet', archived: true });
  const { type, save, saved, chosenColor } = editor(null, [taken, old]);
  // An archived label's color is free again.
  expect(chosenColor()).toEqual(['Fioletowy']);

  await type('  Push ');
  await save();

  expect(saved()).toMatchObject({ name: 'Push', color: 'violet', archived: false });
  expect(saved()?.id).not.toBe(taken.id);
  expect(saved()?.id).not.toBe(old.id);
});

it('a name of 6 characters, the most the field takes, is saved whole', async () => {
  const { wrapper, input, type, save, saved } = editor(null);
  expect((input.element as HTMLIonInputElement).maxlength).toBe(6);
  await type('Push12');
  await save();
  expect(saved()?.name).toBe('Push12');
  expect(wrapper.emitted('save')).toHaveLength(1);
});

it('an empty or blank name blocks saving, and the message waits for the first attempt', async () => {
  const { wrapper, type, save, shownError } = editor(null);
  expect(shownError()).toBeNull();

  await save();
  expect(shownError()).toBe('Wpisz nazwę etykiety.');

  await type('   ');
  await save();
  expect(shownError()).toBe('Wpisz nazwę etykiety.');
  expect(wrapper.emitted('save')).toBeUndefined();

  await type('A');
  expect(shownError()).toBeNull();
  await save();
  expect(wrapper.emitted('save')).toHaveLength(1);
});

it('Enter in the field saves, under the same check as the button', async () => {
  const { wrapper, input, type, shownError } = editor(null, [makeLabel('A')]);
  await input.trigger('keyup', { key: 'Enter' });
  expect(wrapper.emitted('save')).toBeUndefined();
  expect(shownError()).toBe('Wpisz nazwę etykiety.');

  await type('B');
  await input.trigger('keyup', { key: 'Enter' });
  expect(wrapper.emitted('save')).toHaveLength(1);
});

it.each(['PUSH', 'push', ' Push '])('%j is taken by the active label "Push"', async (name) => {
  const { wrapper, type, save, shownError } = editor(null, [makeLabel('Push')]);
  await type(name);
  await save();
  expect(wrapper.emitted('save')).toBeUndefined();
  expect(shownError()).toBe('Jest już etykieta o tej nazwie.');
});

it('the name of an archived label is free for a new one', async () => {
  const { type, save, saved } = editor(null, [makeLabel('Push', { archived: true })]);
  await type('push');
  await save();
  expect(saved()?.name).toBe('push');
});

it('editing keeps the id and color, and a label may change the case of its own name', async () => {
  const label = makeLabel('Push', { color: 'magenta' });
  const { save, saved, type, chosenColor } = editor(label, [makeLabel('B')]);
  expect(chosenColor()).toEqual(['Malinowy']);

  await type('PUSH');
  await save();
  expect(saved()).toEqual({ ...label, name: 'PUSH' });
});

it('a tapped color replaces the chosen one and goes out with the label', async () => {
  const { type, save, saved, colors, chosenColor } = editor(null);
  await colors()
    .find((color) => color.attributes('aria-label') === 'Zielony')!
    .trigger('click');
  expect(chosenColor()).toEqual(['Zielony']);

  await type('A');
  await save();
  expect(saved()?.color).toBe('green');
});

it('only an existing label has the archive switch, and it goes out with the label', async () => {
  expect(editor(null).wrapper.find('ion-toggle').exists()).toBe(false);

  const label = makeLabel('A');
  const { wrapper, save, saved } = editor(label);
  const toggle = wrapper.find('ion-toggle').element as HTMLIonToggleElement;
  toggle.checked = true;
  toggle.dispatchEvent(new CustomEvent('ionChange'));
  await flushPromises();
  await save();
  expect(saved()).toEqual({ ...label, archived: true });
});

it('an archived label may share a name, but cannot leave the archive while it does', async () => {
  const label = makeLabel('A', { archived: true });
  const { wrapper, save, saved, shownError } = editor(label, [makeLabel('a')]);

  await save();
  expect(saved()).toEqual(label);

  const toggle = wrapper.find('ion-toggle').element as HTMLIonToggleElement;
  toggle.checked = false;
  toggle.dispatchEvent(new CustomEvent('ionChange'));
  await flushPromises();
  await save();
  expect(wrapper.emitted('save')).toHaveLength(1);
  expect(shownError()).toBe('Jest już etykieta o tej nazwie.');
});

it('"Anuluj" closes without saving what was typed', async () => {
  const { wrapper, type, button } = editor(null);
  await type('A');
  await button('Anuluj').trigger('click');
  expect(wrapper.emitted('close')).toHaveLength(1);
  expect(wrapper.emitted('save')).toBeUndefined();
});

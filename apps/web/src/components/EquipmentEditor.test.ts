import { newId, type EquipmentItem } from '@liftwise/core';
import { alertController } from '@ionic/vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { db } from '../db/database';
import { applyLocal } from '../db/mutate';
import { i18n } from '../i18n';
import { dumbbells, resetDb } from '../testing';
import EquipmentEditor from './EquipmentEditor.vue';

// The real write with a spy on it, to wait for every save a double tap started.
vi.mock('../db/mutate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/mutate')>();
  return { ...actual, applyLocal: vi.fn<typeof actual.applyLocal>(actual.applyLocal) };
});

enableAutoUnmount(afterEach);

beforeEach(resetDb);

const bench = (fields: { incline?: boolean; decline?: boolean } = {}): EquipmentItem => ({
  id: newId(),
  type: 'bench',
  props: { incline: false, decline: false, ...fields },
});

function editor(item: EquipmentItem | null) {
  const wrapper = mount(EquipmentEditor, {
    global: { plugins: [i18n] },
    props: { item },
  });
  const button = (text: string) =>
    wrapper.findAll('ion-button').find((candidate) => candidate.text() === text);
  const input = () => wrapper.find('ion-input');
  const type = async (text: string) => {
    const element = input().element as HTMLIonInputElement;
    element.value = text;
    element.dispatchEvent(new CustomEvent('ionInput', { detail: { value: text } }));
    await flushPromises();
  };
  const toggle = async (label: string, checked: boolean) => {
    const element = wrapper
      .findAll('ion-toggle')
      .find((candidate) => candidate.text() === label)!.element;
    element.dispatchEvent(new CustomEvent('ionChange', { detail: { checked } }));
    await flushPromises();
  };
  const chooseType = async (value: string) => {
    const select = wrapper.find('ion-select').element as HTMLIonSelectElement;
    select.value = value;
    select.dispatchEvent(new CustomEvent('ionChange'));
    await flushPromises();
  };
  const tapSave = () => button('Zapisz')!.trigger('click');
  const save = async () => {
    await tapSave();
    await vi.waitFor(() => expect(wrapper.emitted('done')).toBeTruthy());
  };
  const invalid = () => input().classes().includes('ion-invalid');
  return { wrapper, button, input, type, toggle, chooseType, tapSave, save, invalid };
}

const stored = () => db.equipment_items.toArray();
const queued = () => db.outbox.toArray();

it('a new item starts as dumbbells; an empty limit is saved as none and queued for sync', async () => {
  const { wrapper, save } = editor(null);
  expect(wrapper.find('ion-title').text()).toBe('Dodaj sprzęt');
  await save();

  const rows = await stored();
  expect(rows).toMatchObject([{ type: 'dumbbells', props: { max_kg: null } }]);
  expect(await queued()).toMatchObject([{ entity: 'equipment_items', entityId: rows[0]!.id }]);
  expect(wrapper.emitted('done')).toHaveLength(1);
});

it('takes a Polish decimal comma', async () => {
  const { type, save } = editor(null);
  await type('32,5');
  await save();
  expect(await stored()).toMatchObject([{ props: { max_kg: 32.5 } }]);
});

it.each(['abc', '-5', '0', '32,3'])(
  'a limit of %j blocks saving and marks the field',
  async (text) => {
    const { wrapper, input, type, tapSave, invalid } = editor(null);
    expect(invalid()).toBe(false);

    await type(text);
    await tapSave();

    expect(invalid()).toBe(true);
    expect((input().element as HTMLIonInputElement).errorText).toBe(
      'Wpisz liczbę większą od zera, z krokiem 0,25.',
    );
    expect(wrapper.emitted('done')).toBeUndefined();
    expect(await stored()).toEqual([]);
    expect(await queued()).toEqual([]);
  },
);

it('saving works again once the text is corrected', async () => {
  const { wrapper, type, tapSave, save } = editor(null);
  await type('abc');
  await tapSave();
  await type('30');
  await save();
  expect(await stored()).toMatchObject([{ props: { max_kg: 30 } }]);
  expect(wrapper.emitted('done')).toHaveLength(1);
});

it('a tap while the sheet closes adds nothing either', async () => {
  const { tapSave, save } = editor(null);
  await tapSave();
  await save();
  await flushPromises();
  await tapSave();
  await flushPromises();
  expect(await db.equipment_items.count()).toBe(1);
});

it('a double tap on "Zapisz" adds one item', async () => {
  const { tapSave } = editor(null);
  vi.mocked(applyLocal).mockClear();

  await tapSave();
  await tapSave();
  await Promise.all(vi.mocked(applyLocal).mock.results.map((result) => result.value));

  expect(await stored()).toHaveLength(1);
});

it('Enter in the field saves', async () => {
  const { wrapper, input, type } = editor(null);
  await type('25');
  await input().trigger('keyup', { key: 'Enter' });
  await vi.waitFor(() => expect(wrapper.emitted('done')).toHaveLength(1));
  expect(await stored()).toMatchObject([{ props: { max_kg: 25 } }]);
});

it('editing shows the value with a comma, keeps the id and cannot change the type', async () => {
  const item = dumbbells(32.5);
  await applyLocal([{ op: 'upsert', entity: 'equipment_items', row: item }]);

  const { wrapper, input, type, save } = editor(item);
  expect(wrapper.find('ion-title').text()).toBe('Edytuj sprzęt');
  expect(wrapper.find('ion-select').exists()).toBe(false);
  expect((input().element as HTMLIonInputElement).value).toBe('32,5');

  await type('35');
  await save();
  expect(await stored()).toMatchObject([{ id: item.id, props: { max_kg: 35 } }]);
});

it('a changed type brings its own fields, drops the old mark and saves as that type', async () => {
  const { wrapper, type, toggle, chooseType, tapSave, save, invalid } = editor(null);
  await type('abc');
  await tapSave();
  expect(invalid()).toBe(true);

  await chooseType('bench');
  expect(wrapper.find('ion-input').exists()).toBe(false);
  expect(wrapper.findAll('ion-toggle')).toHaveLength(2);

  await toggle('Skos (oparcie pod kątem)', true);
  await save();
  expect(await stored()).toMatchObject([
    { type: 'bench', props: { incline: true, decline: false } },
  ]);
});

it('back on the first type its field starts over and carries no mark', async () => {
  const { input, type, chooseType, tapSave, invalid } = editor(null);
  await type('abc');
  await tapSave();

  await chooseType('bench');
  await chooseType('dumbbells');
  expect((input().element as HTMLIonInputElement).value).toBe('');
  expect(invalid()).toBe(false);
});

it('switching a toggle off on an existing bench is saved', async () => {
  const item = bench({ incline: true });
  const { wrapper, toggle, save } = editor(item);
  expect(
    wrapper.findAll('ion-toggle').map((row) => (row.element as HTMLIonToggleElement).checked),
  ).toEqual([true, false]);

  await toggle('Skos (oparcie pod kątem)', false);
  await save();
  expect(await stored()).toMatchObject([
    { id: item.id, props: { incline: false, decline: false } },
  ]);
});

it('"Anuluj" leaves without writing what was typed', async () => {
  const { wrapper, type, button } = editor(null);
  await type('30');
  await button('Anuluj')!.trigger('click');
  await flushPromises();
  expect(wrapper.emitted('done')).toHaveLength(1);
  expect(await stored()).toEqual([]);
});

function alertAnswers(role: string) {
  return vi.spyOn(alertController, 'create').mockResolvedValueOnce({
    present: async () => {},
    onDidDismiss: async () => ({ role }),
  } as unknown as HTMLIonAlertElement);
}

it('only an existing item can be deleted', () => {
  expect(editor(null).button('Usuń')).toBeUndefined();
  expect(editor(bench()).button('Usuń')).toBeDefined();
});

it('deleting asks first, names the item and removes it for every device', async () => {
  const item = bench();
  await applyLocal([{ op: 'upsert', entity: 'equipment_items', row: item }]);
  const create = alertAnswers('destructive');

  const { wrapper, button } = editor(item);
  await button('Usuń')!.trigger('click');
  await vi.waitFor(() => expect(wrapper.emitted('done')).toHaveLength(1));

  expect(create.mock.calls[0]![0].message).toBe(
    'Element „Ławka” zniknie z profilu sprzętu na wszystkich urządzeniach.',
  );
  const [row] = await stored();
  expect(row?.deleted_at).not.toBeNull();
  expect((await queued()).at(-1)?.mutation).toMatchObject({
    op: 'delete',
    entity: 'equipment_items',
    row: { id: item.id },
  });
});

it('a dismissed question keeps the item and the editor open', async () => {
  const item = bench();
  await applyLocal([{ op: 'upsert', entity: 'equipment_items', row: item }]);
  const create = alertAnswers('cancel');

  const { wrapper, button } = editor(item);
  await button('Usuń')!.trigger('click');
  await vi.waitFor(() => expect(create).toHaveBeenCalled());
  await flushPromises();

  expect(wrapper.emitted('done')).toBeUndefined();
  const [row] = await stored();
  expect(row?.deleted_at).toBeNull();
});

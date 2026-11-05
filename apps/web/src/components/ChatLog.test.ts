import {
  newId,
  type PlanToolOutput,
  type ProposalToolOutput,
  type WriteToolOutput,
} from '@liftwise/core';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import type { MessageItem, MessageView } from '../agent/messages';
import { db } from '../db/database';
import { i18n } from '../i18n';
import { makeExercise, resetDb } from '../testing';
import ChatLog from './ChatLog.vue';

enableAutoUnmount(afterEach);

const PRESS = newId();
const ROW = newId();

let pinia: ReturnType<typeof createPinia>;

beforeEach(async () => {
  await resetDb();
  pinia = createPinia();
});

const message = (
  role: MessageView['role'],
  items: MessageItem[],
  stored = true,
  id = crypto.randomUUID(),
): MessageView => ({ id, role, items, stored });

const text = (value: string): MessageItem => ({ kind: 'text', key: value, text: value });

const setChange = (exercise_id: string) => ({
  entity: 'sets' as const,
  id: crypto.randomUUID(),
  op: 'create' as const,
  before: null,
  after: {
    exercise_id,
    weight_kg: 24,
    reps: 10,
    duration_s: null,
    status: 'done',
    warmup: false,
  },
});

const change = (exercise_id: string): MessageItem => ({
  kind: 'change',
  key: 'change',
  output: { groupId: 'g1', changes: [setChange(exercise_id)] } satisfies WriteToolOutput,
});

const proposal: MessageItem = {
  kind: 'proposal',
  key: 'proposal',
  output: {
    proposalId: 'p1',
    status: 'pending',
    changes: [setChange('any')],
  } satisfies ProposalToolOutput,
};

const plan = (exercise_id = 'any'): MessageItem => ({
  kind: 'plan',
  key: 'plan',
  output: {
    proposalId: 'p2',
    status: 'pending',
    changes: [],
    date: '2026-11-01',
    replaces: 0,
    plan: {
      exercises: [
        {
          exercise_id,
          sets: [{ weight_kg: 24, reps: 10, duration_s: null, warmup: false }],
          target_rir: null,
        },
      ],
      rationale: 'Bo tak.',
    },
  } satisfies PlanToolOutput,
});

function log(
  messages: MessageView[],
  props: { busy?: boolean; regenerate?: (date: string) => void } = {},
) {
  const wrapper = mount(ChatLog, {
    global: { plugins: [i18n, pinia] },
    props: { messages, ...props },
  });
  // Ionic's hosts hide their textContent in the test DOM, so buttons are found by their markup.
  const button = (label: string) =>
    wrapper.findAll('ion-button').find((candidate) => candidate.html().includes(label));
  const disabled = (label: string) =>
    (button(label)?.element as (Element & { disabled?: boolean }) | undefined)?.disabled;
  return { wrapper, button, disabled };
}

async function catalogued(id: string, name: string, fields: Record<string, unknown> = {}) {
  const stamp = '2026-10-01T10:00:00.000Z';
  await db.exercises.put({
    ...makeExercise({ id, name_pl: name }),
    created_at: stamp,
    updated_at: stamp,
    deleted_at: null,
    seq: 1,
    ...fields,
  });
}

it('keeps the order of the messages and of the items in each, the user on the right', () => {
  const { wrapper } = log([
    message('user', [text('wyciskanie 24 kg 4x10')]),
    message('assistant', [text('Zapisuję.'), text('Gotowe.')]),
  ]);
  const messages = wrapper.findAll('.lw-chat__message');
  expect(messages.map((row) => row.classes('is-user'))).toEqual([true, false]);
  expect(wrapper.findAll('.lw-chat__text').map((row) => row.text())).toEqual([
    'wyciskanie 24 kg 4x10',
    'Zapisuję.',
    'Gotowe.',
  ]);
});

it('a running tool says what it is doing, a workout proposal in its own words', () => {
  const { wrapper } = log([
    message('assistant', [{ kind: 'working', key: 'a', planning: false }]),
    message('assistant', [{ kind: 'working', key: 'b', planning: true }]),
  ]);
  expect(wrapper.findAll('.lw-chat__working').map((row) => row.text())).toEqual([
    'Sprawdzam dane…',
    'Układam trening…',
  ]);
});

it('cards name exercises from the catalog, also one added later', async () => {
  await catalogued(PRESS, 'Wyciskanie hantli');
  const { wrapper } = log([message('assistant', [change(PRESS), change(ROW)])]);
  const lines = () => wrapper.findAll('.lw-change__lines li').map((line) => line.text());
  await vi.waitFor(() => expect(lines()[0]).toBe('Wyciskanie hantli · 24 kg × 10'));
  expect(lines()[1]).toBe('Ćwiczenie usunięte z katalogu · 24 kg × 10');
  await catalogued(ROW, 'Wiosłowanie');
  await vi.waitFor(() => expect(lines()[1]).toBe('Wiosłowanie · 24 kg × 10'));
});

it('a plan card names its exercises too, and a deleted one reads as deleted', async () => {
  await catalogued(PRESS, 'Wyciskanie hantli', { deleted_at: '2026-10-02T10:00:00.000Z' });
  await catalogued(ROW, 'Wiosłowanie');
  const { wrapper } = log([message('assistant', [plan(ROW)]), message('assistant', [plan(PRESS)])]);
  const names = () => wrapper.findAll('.lw-plan__name').map((name) => name.text());
  await vi.waitFor(() => expect(names()).toEqual(['Wiosłowanie', 'Ćwiczenie usunięte z katalogu']));
});

it.each([
  [true, false, false],
  [false, false, true],
  [true, true, true],
  [false, true, true],
])('stored %s, busy %s: decisions disabled %s', (stored, busy, expected) => {
  const { disabled } = log([message('assistant', [proposal, plan()], stored)], { busy });
  expect(disabled('Zatwierdź')).toBe(expected);
  expect(disabled('Akceptuj')).toBe(expected);
});

it('"Wygeneruj ponownie" reaches the caller where the conversation can go on', async () => {
  const regenerate = vi.fn<(date: string) => void>();
  const { button } = log([message('assistant', [plan()])], { regenerate });
  await button('Wygeneruj ponownie')?.trigger('click');
  expect(regenerate).toHaveBeenCalledExactlyOnceWith('2026-11-01');
});

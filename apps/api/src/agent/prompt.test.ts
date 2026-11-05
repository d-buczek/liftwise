import {
  balanceSnapshot,
  DEFAULT_BALANCE_SETTINGS,
  newId,
  seedCatalog,
  type EquipmentItem,
  type Exercise,
} from '@liftwise/core';
import { describe, expect, it } from 'vite-plus/test';
import { repsExercise } from '../../test/helpers';
import { agentTools } from '../tools';
import { toolContext } from '../../test/tools';
import { systemMessages, type PromptContext } from './prompt';

const TODAY = '2026-10-31';
const catalog = seedCatalog();

const dumbbells = (max_kg: number | null): EquipmentItem => ({
  id: newId(),
  type: 'dumbbells',
  props: { max_kg },
});

const bench = (incline: boolean, decline: boolean): EquipmentItem => ({
  id: newId(),
  type: 'bench',
  props: { incline, decline },
});

const balanceOf = (sets: Parameters<typeof balanceSnapshot>[0]['sets'] = []) =>
  balanceSnapshot({
    sets,
    exercises: catalog,
    balance: DEFAULT_BALANCE_SETTINGS,
    today: TODAY,
  });

const context = (fields: Partial<PromptContext> = {}): PromptContext => ({
  provider: 'anthropic',
  localTime: '2026-10-31T18:00:00+01:00',
  today: TODAY,
  catalog,
  equipment: [],
  profile: '',
  balance: balanceOf(),
  ...fields,
});

const messages = (fields: Partial<PromptContext> = {}) => {
  const [stable, current] = systemMessages(context(fields));
  return {
    stable: String(stable?.content),
    current: String(current?.content),
    all: [stable, current],
  };
};

describe('the stable part of the system prompt', () => {
  const named = (name_pl: string, fields: Partial<Exercise> = {}) =>
    ({ ...repsExercise, id: newId(), name_pl, aliases: [], ...fields }) as Exercise;

  const catalogLines = (exercises: Exercise[]) =>
    messages({ catalog: exercises })
      .stable.split('\n')
      .filter((line) => / \| (reps|time)$/.test(line));

  it('lists the catalog in Polish order, with aliases and the measure', () => {
    const last = named('Żuraw');
    const lines = catalogLines([
      last,
      named('Łódka', { measure: 'time' }),
      named('Zakroki', { aliases: ['wykroki', 'lunge'] }),
      named('Ćwiczenie'),
      named('Mostek'),
      named('Arnoldki'),
    ]);

    expect(lines.map((line) => line.split(' | ').slice(1).join(' | '))).toEqual([
      'Arnoldki | reps',
      'Ćwiczenie | reps',
      'Łódka | time',
      'Mostek | reps',
      'Zakroki (wykroki, lunge) | reps',
      'Żuraw | reps',
    ]);
    expect(lines.at(-1)).toBe(`- ${last.id} | Żuraw | reps`);
  });

  it('leaves out archived exercises', () => {
    const lines = catalogLines([named('Pompki'), named('Dipy', { archived: true })]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Pompki');
  });

  it('stays the same across turns, so its cache holds (§6.6)', () => {
    const a = messages();
    const b = messages({
      localTime: '2026-11-01T07:15:00+01:00',
      today: '2026-11-01',
      equipment: [dumbbells(30)],
      profile: 'Cel: siła',
      balance: balanceOf([
        {
          id: newId(),
          workout_id: newId(),
          exercise_id: repsExercise.id,
          position: 0,
          status: 'done',
          weight_kg: 20,
          reps: 10,
          duration_s: null,
          rir: 1,
          warmup: false,
          note: '',
          performed_at: '2026-10-30T18:00:00+01:00',
          source: 'manual',
          date: '2026-10-30',
        },
      ]),
    });
    expect(b.stable).toBe(a.stable);
    expect(b.current).not.toBe(a.current);
  });

  it('marks the cache breakpoint for Anthropic only', () => {
    const [stable, current] = messages({ provider: 'anthropic' }).all;
    expect(stable?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    expect(current?.providerOptions).toBeUndefined();
    for (const provider of ['openai', 'google'] as const) {
      expect(messages({ provider }).all[0]?.providerOptions).toBeUndefined();
    }
  });

  it('names only tools the model is offered', () => {
    const [rules = ''] = messages().stable.split('Exercise catalog');
    const fields = new Set(['duration_s', 'performed_at', 'change_request']);
    const named = [...new Set(rules.match(/\b[a-z]+(?:_[a-z]+)+\b/g))].filter(
      (word) => !fields.has(word),
    );
    expect(named.length).toBeGreaterThan(0);
    const offered = Object.keys(agentTools(toolContext()));
    expect(named.filter((name) => !offered.includes(name))).toEqual([]);
  });
});

describe('the context of the turn', () => {
  it('gives the local time with its weekday', () => {
    expect(messages().current).toContain('Now: 2026-10-31T18:00:00+01:00 (Saturday, local time).');
    // The weekday of the local date: 00:30 at UTC+1 is still the day before in UTC.
    expect(
      messages({ localTime: '2026-11-01T00:30:00+01:00', today: '2026-11-01' }).current,
    ).toContain('(Sunday, local time)');
  });

  it('sends the profile, or says it is empty', () => {
    expect(messages({ profile: '  Cel: siła\n' }).current).toContain(
      'Athlete profile:\nCel: siła\n\n',
    );
    expect(messages({ profile: ' \n ' }).current).toContain('Athlete profile:\n(empty)');
  });

  it.each([
    [[], 'none listed'],
    [[dumbbells(30)], 'adjustable dumbbells up to 30 kg'],
    [[dumbbells(null)], 'adjustable dumbbells'],
    [[bench(false, false)], 'bench'],
    [[dumbbells(40), bench(true, false)], 'adjustable dumbbells up to 40 kg; bench, incline'],
    [[bench(true, true)], 'bench, incline, decline'],
  ])('describes the equipment %#', (equipment, line) => {
    expect(messages({ equipment }).current).toContain(`Equipment: ${line}.\n`);
  });

  it('gives the hard sets per muscle group with their target and last training', () => {
    const { current } = messages({
      balance: {
        ...balanceOf(),
        muscles: [
          {
            group: 'chest',
            hardSets: 12,
            target: { min: 10, max: 20 },
            status: 'in_range',
            daysSince: 2,
          },
          {
            group: 'calves',
            hardSets: 0,
            target: { min: 10, max: 20 },
            status: 'under',
            daysSince: null,
          },
        ],
      },
    });
    expect(current).toContain('- chest: 12 (target 10-20, in_range), last 2 d ago');
    expect(current).toContain('- calves: 0 (target 10-20, under), last never');
  });
});

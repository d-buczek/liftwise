import { movementPatternSchema, muscleGroupSchema, type ProgressionHint } from '@liftwise/core';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { defineComponent } from 'vue';
import { i18n } from '../i18n';
import { useFormat } from './format';

enableAutoUnmount(afterEach);

function format() {
  let result!: ReturnType<typeof useFormat>;
  mount(
    defineComponent({
      setup() {
        result = useFormat();
        return () => null;
      },
    }),
    { global: { plugins: [i18n] } },
  );
  return result;
}

function hint(fields: Partial<ProgressionHint>): ProgressionHint {
  return {
    weight: 24,
    sets: 3,
    reps: null,
    duration_s: null,
    targetRir: { min: 1, max: 2 },
    reason: 'reps_up',
    stall: false,
    ...fields,
  };
}

describe('weights', () => {
  it.each([
    [22.5, '22,5'],
    [31.25, '31,25'],
    [24, '24'],
    [0, '0'],
  ])('writes %d kg as "%s", with a decimal comma', (value, text) => {
    expect(format().kg(value)).toBe(text);
  });
});

describe('dates', () => {
  it('titles a day in sentence case, also when it starts with a Polish letter', () => {
    const { day } = format();
    expect(day('2026-11-01')).toBe('Niedziela, 1 listopada');
    expect(day('2026-11-04')).toBe('Środa, 4 listopada');
  });

  it('keeps the calendar day across a time change and a year boundary', () => {
    const { day, date, dayMonth } = format();
    expect(day('2026-03-29')).toBe('Niedziela, 29 marca');
    expect(day('2026-10-25')).toBe('Niedziela, 25 października');
    expect(date('2026-01-01')).toBe('1 sty 2026');
    expect(dayMonth('2026-12-31')).toBe('31 grudnia');
  });

  it('names a month as a heading, with the year', () => {
    const { month } = format();
    expect(month('2026-11')).toBe('Listopad 2026');
    expect(month('2027-01')).toBe('Styczeń 2027');
  });

  it('keeps the year on dates that may be older', () => {
    expect(format().date('2025-10-03')).toBe('3 paź 2025');
  });
});

describe('progression hints', () => {
  it.each<[string, Partial<ProgressionHint>, string]>([
    ['per-set reps', { weight: 22.5, reps: [11, 11, 10] }, '↑ 22,5 kg × 11, 11, 10'],
    ['equal reps as one', { weight: 25, reps: [8, 8, 8], reason: 'weight_up' }, '↑ 25 kg × 8'],
    ['a hold', { reps: [10, 10, 10], reason: 'hold' }, '= 24 kg × 10'],
    ['after a break', { reps: [10, 10, 9], reason: 'reentry' }, 'Po przerwie: 24 kg × 10, 10, 9'],
    ['reps at bodyweight', { weight: 0, reps: [11, 11, 10] }, '↑ 11, 11, 10 powt.'],
    ['time at bodyweight', { weight: 0, duration_s: [50, 45], reason: 'time_up' }, '↑ 50, 45 s'],
    ['equal time', { weight: 0, duration_s: [45, 45], reason: 'time_up' }, '↑ 45 s'],
    [
      'weighted time',
      { weight: 10, duration_s: [50, 45], reason: 'time_up' },
      '↑ 10 kg × 50, 45 s',
    ],
  ])('%s', (_, fields, text) => {
    expect(format().hint(hint(fields))).toBe(text);
  });
});

describe('sets and sessions', () => {
  it('sums up a set by its measure, even at 0 kg', () => {
    const { set } = format();
    expect(set({ weight_kg: 22.5, reps: 10, duration_s: null })).toBe('22,5 kg × 10');
    expect(set({ weight_kg: 0, reps: null, duration_s: 45 })).toBe('0 kg × 45 s');
  });

  it('separates the loads of a session', () => {
    expect(
      format().session([
        { weight_kg: 22.5, values: [10, 10, 9], timed: false },
        { weight_kg: 20, values: [12], timed: false },
        { weight_kg: 0, values: [50, 45], timed: true },
      ]),
    ).toBe('22,5 kg × 10, 10, 9; 20 kg × 12; 50, 45 s');
  });
});

describe('records', () => {
  it('rounds an e1RM to one decimal and leaves the weight out of a bodyweight record', () => {
    const { record } = format();
    expect(record({ kind: 'e1rm', weight_kg: 24, value: 33.64 })).toBe('e1RM 33,6 kg');
    expect(record({ kind: 'reps', weight_kg: 24, value: 12 })).toBe('24 kg × 12');
    expect(record({ kind: 'reps', weight_kg: 0, value: 12 })).toBe('12 powt.');
    expect(record({ kind: 'time', weight_kg: 0, value: 50 })).toBe('50 s');
  });

  it('lists the records of one set in the toast', () => {
    const event = { set_id: 's', exercise_id: 'e', date: '2026-11-01' };
    expect(
      format().records([
        { ...event, kind: 'reps', weight_kg: 24, value: 12 },
        { ...event, kind: 'e1rm', weight_kg: 24, value: 33.6 },
      ]),
    ).toBe('Rekord: 24 kg × 12, e1RM 33,6 kg');
  });
});

describe('clock and rest', () => {
  it.each([
    [90, '1:30'],
    [60, '1:00'],
    [5, '0:05'],
    [605, '10:05'],
  ])('shows %d s as %s', (seconds, text) => {
    const { clock, rest } = format();
    expect(clock(seconds)).toBe(text);
    expect(rest(seconds)).toBe(text);
  });

  it('shows no rest in words, not as 0:00', () => {
    expect(format().rest(0)).toBe('bez timera');
  });
});

describe('RIR', () => {
  it('reads the top value as "4+", alone and at the end of a range', () => {
    const { rir, rirRange } = format();
    expect(rir(4)).toBe('4+');
    expect(rir(0)).toBe('0');
    expect(rirRange({ min: 3, max: 4 })).toBe('3–4+');
    expect(rirRange({ min: 4, max: 4 })).toBe('4+');
  });

  it('collapses a range with equal bounds', () => {
    const { rirRange } = format();
    expect(rirRange({ min: 1, max: 2 })).toBe('1–2');
    expect(rirRange({ min: 2, max: 2 })).toBe('2');
  });
});

describe('Polish plurals', () => {
  it.each([
    [0, '0 serii'],
    [1, '1 seria'],
    [2, '2 serie'],
    [4, '4 serie'],
    [5, '5 serii'],
    [12, '12 serii'],
    [22, '22 serie'],
    [0.5, '0,5 serii'],
    [1.5, '1,5 serii'],
  ])('counts %d hard sets as "%s"', (value, text) => {
    expect(format().hardSets(value)).toBe(text);
  });

  it.each([
    [null, 'nigdy'],
    [0, 'dziś'],
    [1, 'wczoraj'],
    [2, '2 dni temu'],
    [5, '5 dni temu'],
    [22, '22 dni temu'],
  ])('says %s days since as "%s"', (days, text) => {
    expect(format().daysSince(days)).toBe(text);
  });
});

describe('names', () => {
  it('names an exercise gone from the catalog instead of showing nothing', () => {
    const { exerciseName } = format();
    expect(exerciseName(undefined)).toBe('Ćwiczenie usunięte z katalogu');
    expect(exerciseName({ name_pl: 'Wyciskanie hantli' })).toBe('Wyciskanie hantli');
  });

  it('lists the primary muscles in Polish', () => {
    expect(format().muscles({ primary_muscles: ['chest', 'lats'] })).toBe('klatka, najszersze');
  });

  it('has Polish for every muscle group and movement pattern of core', () => {
    const missing = [
      ...muscleGroupSchema.options.map((group) => `muscles.${group}`),
      ...movementPatternSchema.options.map((pattern) => `patterns.${pattern}`),
    ].filter((key) => !i18n.global.te(key));
    expect(missing).toEqual([]);
  });
});

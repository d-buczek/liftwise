import { describe, expect, it } from 'vite-plus/test';
import { makeExercise, makeSet } from '../testing';
import { foldText, matchesQuery, pickerSections } from './search';

const press = makeExercise({ name_pl: 'Wyciskanie hantli na ławce', aliases: ['bench press'] });
const floor = makeExercise({ name_pl: 'Wyciskanie leżąc na podłodze', requires: ['dumbbells'] });
const flyes = makeExercise({ name_pl: 'Rozpiętki', patterns: ['isolation'] });
const row = makeExercise({ name_pl: 'Wiosłowanie', primary_muscles: ['lats'] });
const plank = makeExercise({
  name_pl: 'Deska',
  primary_muscles: ['chest'],
  measure: 'time',
  time_range_s: { min: 30, max: 60 },
});
const archived = makeExercise({ name_pl: 'Pompki', archived: true });
const benchOnly = makeExercise({ name_pl: 'Pullover', requires: ['bench'] });
const catalog = [press, floor, flyes, row, plank, archived, benchOnly];
const dumbbellsOnly = [{ type: 'dumbbells' as const }];

describe('exercise search', () => {
  it('folds case and Polish diacritics', () => {
    expect(foldText(' Ławka Skośna ')).toBe('lawka skosna');
    expect(matchesQuery(press, 'lawce wycisk')).toBe(true);
    expect(matchesQuery(press, 'bench')).toBe(true);
    expect(matchesQuery(press, 'wiosło')).toBe(false);
  });

  it('lists recent exercises first, then available by name, then unavailable', () => {
    const sets = [
      { ...makeSet({ exercise_id: row.id }), date: '2026-10-01' },
      { ...makeSet({ exercise_id: flyes.id }), date: '2026-10-03' },
      { ...makeSet({ exercise_id: press.id, status: 'planned' }), date: '2026-10-04' },
    ];
    const sections = pickerSections({ catalog, equipment: dumbbellsOnly, sets, query: '' });
    expect(sections.map((s) => [s.key, s.exercises.map((e) => e.name_pl)])).toEqual([
      ['recent', ['Rozpiętki', 'Wiosłowanie']],
      ['all', ['Deska', 'Wyciskanie hantli na ławce', 'Wyciskanie leżąc na podłodze']],
      ['unavailable', ['Pullover']],
    ]);
  });

  it('puts similar exercises first for a swap and keeps the same measure only', () => {
    const sections = pickerSections({
      catalog,
      equipment: dumbbellsOnly,
      sets: [],
      query: '',
      swapFor: press,
    });
    expect(sections.map((s) => [s.key, s.exercises.map((e) => e.name_pl)])).toEqual([
      ['similar', ['Wyciskanie leżąc na podłodze', 'Rozpiętki']],
      ['all', ['Wiosłowanie']],
      ['unavailable', ['Pullover']],
    ]);
  });

  it('filters every section by the query', () => {
    const sections = pickerSections({
      catalog,
      equipment: dumbbellsOnly,
      sets: [],
      query: 'podło',
      swapFor: press,
    });
    expect(sections).toEqual([{ key: 'similar', exercises: [floor] }]);
  });
});

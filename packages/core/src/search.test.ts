import { describe, expect, it } from 'vite-plus/test';
import { foldText, matchesQuery } from './search';
import { makeExercise } from './testing';

describe('exercise search', () => {
  it('folds case and Polish diacritics', () => {
    const press = makeExercise({ name_pl: 'Wyciskanie hantli na ławce', aliases: ['bench press'] });
    expect(foldText(' Ławka Skośna ')).toBe('lawka skosna');
    expect(matchesQuery(press, 'lawce wycisk')).toBe(true);
    expect(matchesQuery(press, 'bench')).toBe(true);
    expect(matchesQuery(press, 'wiosło')).toBe(false);
  });
});

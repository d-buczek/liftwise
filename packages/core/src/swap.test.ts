import { describe, expect, it } from 'vite-plus/test';
import { isExerciseAvailable, swapSuggestions } from './swap';
import { makeDatedSet, makeExercise, makeTimedExercise } from './testing';

const dumbbellsOnly = [{ type: 'dumbbells' as const }];

describe('isExerciseAvailable', () => {
  it('needs every required equipment type', () => {
    expect(isExerciseAvailable({ requires: [] }, [])).toBe(true);
    expect(isExerciseAvailable({ requires: ['dumbbells'] }, dumbbellsOnly)).toBe(true);
    expect(isExerciseAvailable({ requires: ['dumbbells', 'bench'] }, dumbbellsOnly)).toBe(false);
  });
});

describe('swapSuggestions', () => {
  const current = makeExercise({
    name_pl: 'Wyciskanie',
    primary_muscles: ['chest', 'triceps'],
    requires: ['dumbbells'],
  });
  const both = makeExercise({ name_pl: 'Wyciskanie skos', primary_muscles: ['chest', 'triceps'] });
  const samePattern = makeExercise({ name_pl: 'Pompki' });
  const flyNeverUsed = makeExercise({ name_pl: 'Rozpiętki', patterns: ['isolation'] });
  const kickbackRecent = makeExercise({
    name_pl: 'Wyprosty',
    primary_muscles: ['triceps'],
    patterns: ['isolation'],
  });
  const pulloverNeverUsed = makeExercise({ name_pl: 'Przenoszenie', patterns: ['isolation'] });
  const excluded = [
    makeExercise({ name_pl: 'Zarchiwizowane', archived: true }),
    makeExercise({ name_pl: 'Na ławce', requires: ['dumbbells', 'bench'] }),
    makeTimedExercise({ name_pl: 'Pompki na czas', primary_muscles: ['chest'] }),
    makeExercise({ name_pl: 'Uginanie', primary_muscles: ['biceps'] }),
  ];
  const catalog = [
    flyNeverUsed,
    current,
    pulloverNeverUsed,
    ...excluded,
    kickbackRecent,
    samePattern,
    both,
  ];
  const sets = [
    makeDatedSet('2026-10-20', { exercise_id: kickbackRecent.id }),
    makeDatedSet('2026-10-30', { exercise_id: flyNeverUsed.id, status: 'planned' }),
    makeDatedSet('2026-10-30', { exercise_id: pulloverNeverUsed.id, warmup: true }),
  ];

  it('ranks by shared primary muscles, shared patterns, recent use, then name', () => {
    const suggestions = swapSuggestions({
      exercise: current,
      catalog,
      equipment: dumbbellsOnly,
      sets,
    });
    expect(suggestions.map((ex) => ex.name_pl)).toEqual([
      'Wyciskanie skos',
      'Pompki',
      'Wyprosty',
      'Przenoszenie',
      'Rozpiętki',
    ]);
  });

  it('suggests only exercises with the same measure', () => {
    const plank = makeTimedExercise();
    const sidePlank = makeTimedExercise({ name_pl: 'Deska bokiem' });
    const crunch = makeExercise({
      name_pl: 'Spięcia',
      primary_muscles: ['abs'],
      patterns: ['core'],
    });
    const suggestions = swapSuggestions({
      exercise: plank,
      catalog: [plank, sidePlank, crunch],
      equipment: [],
      sets: [],
    });
    expect(suggestions).toEqual([sidePlank]);
  });
});

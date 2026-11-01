import { describe, expect, it } from 'vite-plus/test';
import { csvExport, EXPORT_VERSION, jsonExport, type ExportTables } from './export';
import { newId } from './ids';
import type { WorkoutSet } from './schemas/set';
import { DEFAULT_TRAINING_SETTINGS } from './schemas/settings';
import { makeExercise, makeSet, makeTimedExercise } from './testing';

describe('jsonExport', () => {
  it('wraps all tables, rows as given, indented by 2', () => {
    const exercise = { ...makeExercise(), seq: 7, deleted_at: null };
    const tables: ExportTables = {
      exercises: [exercise],
      equipment_items: [],
      workout_labels: [{ id: newId(), name: 'A', color: 'cobalt', archived: false }],
      workouts: [],
      sets: [],
      athlete_profile: [{ id: newId(), content: '# Cele' }],
      settings: [{ id: newId(), key: 'training', value: DEFAULT_TRAINING_SETTINGS }],
    };
    const json = jsonExport(tables, '2026-10-31T12:00:00+01:00');
    expect(json.startsWith('{\n  "app": "liftwise",\n  "version": 1,')).toBe(true);
    expect(JSON.parse(json)).toEqual({
      app: 'liftwise',
      version: EXPORT_VERSION,
      exported_at: '2026-10-31T12:00:00+01:00',
      tables,
    });
    expect(Object.keys(JSON.parse(json).tables)).toEqual([
      'exercises',
      'equipment_items',
      'workout_labels',
      'workouts',
      'sets',
      'athlete_profile',
      'settings',
    ]);
  });
});

describe('csvExport', () => {
  const press = makeExercise({ name_pl: 'Wyciskanie "na skos", hantle' });
  const plank = makeTimedExercise();
  const first = { id: newId(), date: '2026-10-01' };
  const second = { id: newId(), date: '2026-10-01' };
  const earlier = { id: newId(), date: '2026-09-30' };
  const set = (workout: { id: string }, position: number, fields: Partial<WorkoutSet>) =>
    makeSet({ workout_id: workout.id, exercise_id: press.id, position, ...fields });

  it('writes done sets with warm-ups by date, workout and position', () => {
    const sets = [
      set(second, 0, { weight_kg: 20, reps: 10 }),
      set(first, 4, { status: 'planned', performed_at: null }),
      set(first, 3, { weight_kg: 22.5, reps: 7, rir: 1 }),
      set(first, 1, { weight_kg: 22.5, reps: 8, rir: 2 }),
      set(first, 0, { weight_kg: 10, reps: 12, warmup: true }),
      set(first, 2, { exercise_id: plank.id, weight_kg: 0, duration_s: 45 }),
      set(earlier, 0, { weight_kg: 20, reps: 10 }),
      set({ id: newId() }, 0, {}),
    ];
    const name = '"Wyciskanie ""na skos"", hantle"';
    expect(csvExport({ workouts: [first, second, earlier], sets, exercises: [press, plank] })).toBe(
      [
        'date,exercise,set,weight_kg,reps,duration_s,rir,warmup',
        `2026-09-30,${name},1,20,10,,,false`,
        `2026-10-01,${name},1,10,12,,,true`,
        `2026-10-01,${name},2,22.5,8,,2,false`,
        '2026-10-01,Deska,1,0,,45,,false',
        `2026-10-01,${name},3,22.5,7,,1,false`,
        `2026-10-01,${name},1,20,10,,,false`,
        '',
      ].join('\r\n'),
    );
  });

  it('writes the header without sets', () => {
    expect(csvExport({ workouts: [], sets: [], exercises: [] })).toBe(
      'date,exercise,set,weight_kg,reps,duration_s,rir,warmup\r\n',
    );
  });
});

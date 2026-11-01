import { newId, type ChangeView } from '@liftwise/core';
import { describe, expect, it } from 'vite-plus/test';
import { changeSummary } from './changes';

const press = newId();
const workoutId = newId();

const set = (fields: Record<string, unknown> = {}) => ({
  exercise_id: press,
  workout_id: workoutId,
  weight_kg: 24,
  reps: 10,
  duration_s: null,
  status: 'done',
  warmup: false,
  ...fields,
});

const change = (
  entity: ChangeView['entity'],
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): ChangeView => ({
  entity,
  id: newId(),
  op: before === null ? 'create' : after === null ? 'delete' : 'update',
  before,
  after,
});

describe('changeSummary', () => {
  it('counts logged sets, done ones created and planned ones completed, and the started workout', () => {
    const summary = changeSummary([
      change(
        'workouts',
        { date: '2026-11-01', started_at: null },
        { date: '2026-11-01', started_at: '2026-11-01T18:00:00+01:00' },
      ),
      change('sets', set({ status: 'planned' }), set()),
      change('sets', null, set()),
      change('sets', null, set({ status: 'planned' })),
    ]);
    expect(summary.counts).toEqual([
      { kind: 'setLogged', count: 2 },
      { kind: 'setPlanned', count: 1 },
      { kind: 'workoutStarted', count: 1 },
    ]);
    // The sets say the day, so the workout has no line of its own.
    expect(summary.lines.map((line) => line.entity)).toEqual(['sets', 'sets', 'sets']);
    expect(summary.lines[0]).toMatchObject({ exerciseId: press, before: { status: 'planned' } });
  });

  it('tells changed and deleted done sets apart', () => {
    const summary = changeSummary([
      change('sets', set(), set({ weight_kg: 22 })),
      change('sets', set(), null),
    ]);
    expect(summary.counts).toEqual([
      { kind: 'setChanged', count: 1 },
      { kind: 'setDeleted', count: 1 },
    ]);
    expect(summary.lines[1]).toMatchObject({ before: { weight_kg: 24 }, after: null });
  });

  it('names a finished workout, an exercise, the profile and a setting', () => {
    const summary = changeSummary([
      change('settings', { key: 'training' }, { key: 'training' }),
      change('athlete_profile', { content: '' }, { content: '# Cele' }),
      change('exercises', null, { name_pl: 'Wiosłowanie jednorącz' }),
      change(
        'workouts',
        { date: '2026-11-01', started_at: '2026-11-01T18:00:00+01:00', ended_at: null },
        {
          date: '2026-11-01',
          started_at: '2026-11-01T18:00:00+01:00',
          ended_at: '2026-11-01T19:00:00+01:00',
        },
      ),
    ]);
    expect(summary.counts.map((count) => count.kind)).toEqual([
      'workoutFinished',
      'exerciseCreated',
      'profileChanged',
      'settingsChanged',
    ]);
    expect(summary.lines).toMatchObject([
      { entity: 'workouts', date: '2026-11-01' },
      { entity: 'exercises', name: 'Wiosłowanie jednorącz' },
      { entity: 'athlete_profile', content: '# Cele' },
      { entity: 'settings', key: 'training' },
    ]);
  });
});

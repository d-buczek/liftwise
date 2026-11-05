import { ATHLETE_PROFILE_ID, newId, seedCatalog } from '@liftwise/core';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  createDevice,
  db,
  lastSeq,
  push,
  remove,
  repsExercise,
  timedExercise,
  upsert,
} from '../../test/helpers';
import { done, pushDay, runNamed, TODAY, toolContext } from '../../test/tools';
import { changeLog, pendingProposals } from '../db/schema';
import { TOOLS } from '.';

type Hint = { exercise_id: string; exercise: string; hint: Record<string, unknown> | null };

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

const pushDumbbells = (max_kg: number) =>
  push(token, [upsert('equipment_items', { id: newId(), type: 'dumbbells', props: { max_kg } })]);

describe('read tools', () => {
  const READ_CALLS: Record<string, unknown> = {
    find_exercise: { query: 'wyciskanie' },
    get_exercise_history: { exercise_id: repsExercise.id },
    get_workouts: { from: '2026-10-01', to: TODAY },
    get_active_workout: {},
    get_records: { exercise_id: repsExercise.id },
    get_balance: {},
    get_progression_hints: {},
    get_swap_options: { exercise_id: repsExercise.id },
    get_weekly_summary: {},
    get_profile: {},
    get_equipment: {},
  };

  it('run at once and change nothing, for every read tool of the registry', async () => {
    const names = TOOLS.filter((tool) => tool.risk === 'read').map((tool) => tool.name);
    expect(Object.keys(READ_CALLS).sort()).toEqual(names.sort());
    await pushDay(token, TODAY, [done()]);
    const seq = await lastSeq();
    const logged = (await db().select().from(changeLog)).length;

    for (const [name, input] of Object.entries(READ_CALLS)) {
      expect(await runNamed(name, input)).not.toHaveProperty('error');
    }

    expect(await lastSeq()).toBe(seq);
    expect(await db().select().from(changeLog)).toHaveLength(logged);
    expect(await db().select().from(pendingProposals)).toEqual([]);
  });

  describe('find_exercise', () => {
    const find = (query: string) =>
      runNamed<{ exercises: { id: string; name: string; archived: boolean }[] }>('find_exercise', {
        query,
      });

    it('ignores diacritics and case, and needs every word first', async () => {
      const { exercises } = await find('LAWCE PLASKIEJ');
      expect(exercises.map((exercise) => exercise.id)).toEqual(
        expect.arrayContaining([repsExercise.id]),
      );
      expect(exercises.every((exercise) => /płaskiej/i.test(exercise.name))).toBe(true);
    });

    it('falls back to any word when no exercise has all of them', async () => {
      const { exercises } = await find('wiosłowanie kettlem');
      expect(exercises).toHaveLength(4);
      expect(exercises.every((exercise) => exercise.name.startsWith('Wiosłowanie'))).toBe(true);
    });

    it('finds nothing for an unknown exercise, caps the list and marks archived ones', async () => {
      expect(await find('xyzzy')).toEqual({ exercises: [] });
      expect((await find('hantli')).exercises).toHaveLength(10);

      await push(token, [upsert('exercises', { ...repsExercise, archived: true })]);
      const { exercises } = await find(repsExercise.name_pl);
      expect(exercises).toMatchObject([{ id: repsExercise.id, archived: true }]);
    });
  });

  describe('get_exercise_history', () => {
    it('returns the newest sessions, newest first, up to the asked number', async () => {
      for (const date of ['2026-10-13', '2026-10-20', '2026-10-27']) {
        await pushDay(token, date, [done(), { status: 'planned' }]);
      }
      const { sessions } = await runNamed<{ sessions: { date: string; sets: unknown[] }[] }>(
        'get_exercise_history',
        { exercise_id: repsExercise.id, sessions: 2 },
      );
      expect(sessions.map((session) => session.date)).toEqual(['2026-10-27', '2026-10-20']);
      expect(sessions[0]?.sets).toHaveLength(1);
    });

    it('shows a timed set in seconds, without reps', async () => {
      await pushDay(token, '2026-10-27', [
        done({ exercise_id: timedExercise.id, weight_kg: 0, reps: null, duration_s: 45 }),
      ]);
      const history = await runNamed<{
        measure: string;
        sessions: { sets: Record<string, unknown>[] }[];
      }>('get_exercise_history', { exercise_id: timedExercise.id });
      expect(history.measure).toBe('time');
      expect(history.sessions[0]?.sets[0]).toMatchObject({ duration_s: 45, weight_kg: 0 });
      expect(history.sessions[0]?.sets[0]).not.toHaveProperty('reps');
    });
  });

  describe('get_workouts', () => {
    const workouts = (from: string, to: string) =>
      runNamed<{ workouts: { date: string; label: string | null; sets: unknown[] }[] }>(
        'get_workouts',
        { from, to },
      );

    it('accepts at most 62 days and no reversed range', async () => {
      expect(await workouts('2026-08-31', '2026-10-31')).toEqual({ workouts: [] });
      expect(await workouts('2026-08-30', '2026-10-31')).toEqual({
        error: 'invalid_range',
        from: '2026-08-30',
        to: '2026-10-31',
      });
      expect(await workouts('2026-10-31', '2026-10-30')).toMatchObject({ error: 'invalid_range' });
    });

    it('lists the range, planned and done, with names and without tombstones', async () => {
      const label = { id: newId(), name: 'A', color: 'teal' };
      await push(token, [upsert('workout_labels', label)]);
      await pushDay(token, '2026-10-19', [done()]);
      await pushDay(token, '2026-10-20', [done(), { status: 'planned' }], { label_id: label.id });
      await pushDay(token, '2026-10-21', [{ status: 'planned' }]);
      await pushDay(token, '2026-10-22', [done()]);
      const deleted = await pushDay(token, '2026-10-21', [done()]);
      await push(token, [remove('workouts', deleted.workout.id)]);

      const found = await workouts('2026-10-20', '2026-10-21');
      expect(found.workouts.map(({ date, label }) => ({ date, label }))).toEqual([
        { date: '2026-10-20', label: 'A' },
        { date: '2026-10-21', label: null },
      ]);
      expect(found.workouts.map((workout) => workout.sets.length)).toEqual([2, 1]);
      expect(found.workouts[0]?.sets[0]).toMatchObject({
        exercise: repsExercise.name_pl,
        status: 'done',
      });
    });
  });

  describe('get_records', () => {
    it('counts done working sets of live workouts only', async () => {
      await pushDay(token, '2026-10-20', [done({ weight_kg: 20, reps: 10 })]);
      await pushDay(token, '2026-10-27', [
        done({ weight_kg: 20, reps: 8 }),
        done({ weight_kg: 22.5, reps: 8 }),
        done({ weight_kg: 30, reps: 20, warmup: true }),
        { status: 'planned', weight_kg: 40, reps: 20 },
      ]);
      const deleted = await pushDay(token, '2026-10-28', [done({ weight_kg: 50, reps: 20 })]);
      await push(token, [remove('workouts', deleted.workout.id)]);

      const records = await runNamed<{
        per_weight: { weight_kg: number; value: number; date: string }[];
        best_e1rm: { value: number; weight_kg: number };
      }>('get_records', { exercise_id: repsExercise.id });

      expect(records.per_weight).toMatchObject([
        { weight_kg: 20, value: 10, date: '2026-10-20' },
        { weight_kg: 22.5, value: 8, date: '2026-10-27' },
      ]);
      expect(records.best_e1rm.weight_kg).toBe(22.5);
      expect(records.best_e1rm.value).toBeCloseTo(28.5);
    });

    it('has no e1RM for a timed exercise', async () => {
      await pushDay(token, '2026-10-27', [
        done({ exercise_id: timedExercise.id, weight_kg: 0, reps: null, duration_s: 45 }),
      ]);
      expect(await runNamed('get_records', { exercise_id: timedExercise.id })).toMatchObject({
        measure: 'time',
        per_weight: [{ weight_kg: 0, value: 45 }],
        best_e1rm: null,
      });
    });
  });

  describe('get_progression_hints', () => {
    const hints = (input: Record<string, unknown>) =>
      runNamed<{ date: string; hints: Hint[] }>('get_progression_hints', input);
    const topOfRange = () => done({ weight_kg: 20, reps: repsExercise.rep_range?.max, rir: 1 });

    it('adds a step at the top of the range, but not beyond the heaviest dumbbell (D37)', async () => {
      await pushDay(token, '2026-10-27', [topOfRange(), topOfRange()]);
      const { hints: free } = await hints({ exercise_id: repsExercise.id });
      expect(free[0]?.hint).toMatchObject({ reason: 'weight_up', weight: 21.25, reps: [6, 6] });

      await pushDumbbells(20);
      const { hints: limited } = await hints({ exercise_id: repsExercise.id });
      expect(limited[0]?.hint).toMatchObject({ reason: 'hold', weight: 20, reps: [12, 12] });
    });

    it('counts only sessions before the asked day, today by default', async () => {
      await pushDay(token, '2026-10-20', [done({ weight_kg: 20 })]);
      await pushDay(token, '2026-10-27', [done({ weight_kg: 22.5 })]);
      const before = await hints({ date: '2026-10-27', exercise_id: repsExercise.id });
      expect(before.hints[0]?.hint).toMatchObject({ weight: 20 });
      const today = await hints({ exercise_id: repsExercise.id });
      expect(today.date).toBe(TODAY);
      expect(today.hints[0]?.hint).toMatchObject({ weight: 22.5 });
    });

    it('covers every exercise of a day, a null hint without history', async () => {
      await pushDay(token, '2026-10-20', [done({ weight_kg: 20 })]);
      await pushDay(token, '2026-11-02', [
        { status: 'planned' },
        { status: 'planned' },
        { status: 'planned', exercise_id: timedExercise.id, reps: null, duration_s: 45 },
      ]);
      const { hints: found } = await hints({ date: '2026-11-02' });
      expect(found.map(({ exercise_id, exercise }) => ({ exercise_id, exercise }))).toEqual([
        { exercise_id: repsExercise.id, exercise: repsExercise.name_pl },
        { exercise_id: timedExercise.id, exercise: timedExercise.name_pl },
      ]);
      expect(found[0]?.hint).toMatchObject({ weight: 20 });
      expect(found[1]?.hint).toBeNull();
    });

    it('answers an empty day without hints', async () => {
      expect(await hints({ date: '2026-11-02' })).toEqual({ date: '2026-11-02', hints: [] });
    });
  });

  describe('get_swap_options', () => {
    const options = async () => {
      const found = await runNamed<{ options: { id: string; name: string }[] }>(
        'get_swap_options',
        { exercise_id: repsExercise.id },
      );
      return found.options.map((option) => option.name);
    };

    it('offers only what the equipment allows, at most 8, and not the exercise itself', async () => {
      expect((await options()).sort()).toEqual(['Pompki', 'Pompki wąskie']);

      await pushDumbbells(40);
      expect(await options()).toContain('Wyciskanie hantli leżąc na podłodze');

      await push(token, [
        upsert('equipment_items', {
          id: newId(),
          type: 'bench',
          props: { incline: true, decline: true },
        }),
      ]);
      const all = await options();
      expect(all).toHaveLength(8);
      expect(all).not.toContain(repsExercise.name_pl);
    });

    it('ranks what was used lately first, from the history', async () => {
      const name = 'Wyciskanie hantli leżąc na podłodze';
      await pushDumbbells(40);
      expect((await options())[0]).not.toBe(name);

      const used = seedCatalog().find((exercise) => exercise.name_pl === name);
      await pushDay(token, '2026-10-27', [done({ exercise_id: used?.id })]);
      expect((await options())[0]).toBe(name);
    });
  });

  describe('get_weekly_summary', () => {
    type Summary = {
      start: string;
      end: string;
      workouts: number;
      sets: number;
      records: { exercise_id: string; exercise: string; kind: string; value: number }[];
      stalled: { exercise_id: string; exercise: string }[];
    };

    beforeEach(async () => {
      // Three sessions at one weight, each worse: stalled after the last.
      await pushDay(token, '2026-10-13', [done({ reps: 12 })]);
      await pushDay(token, '2026-10-20', [done({ reps: 11 })]);
      await pushDay(token, '2026-10-27', [done({ reps: 10 }), { status: 'planned' }]);
      const timed = (duration_s: number) =>
        done({ exercise_id: timedExercise.id, weight_kg: 0, reps: null, duration_s });
      await pushDay(token, '2026-10-20', [timed(45)]);
      await pushDay(token, '2026-10-28', [timed(50)]);
    });

    it('sums the Monday–Sunday week of today and names exercises', async () => {
      const summary = await runNamed<Summary>('get_weekly_summary', {});
      expect(summary).toMatchObject({
        start: '2026-10-26',
        end: '2026-11-01',
        workouts: 2,
        sets: 2,
      });
      expect(summary.records).toMatchObject([
        { exercise_id: timedExercise.id, exercise: timedExercise.name_pl, kind: 'time', value: 50 },
      ]);
      expect(summary.stalled).toEqual([
        { exercise_id: repsExercise.id, exercise: repsExercise.name_pl },
      ]);
    });

    it('takes any day of another week', async () => {
      const summary = await runNamed<Summary>('get_weekly_summary', { date: '2026-10-25' });
      expect(summary).toMatchObject({
        start: '2026-10-19',
        end: '2026-10-25',
        workouts: 2,
        sets: 2,
        stalled: [],
      });
    });
  });

  it('get_profile and get_equipment show live rows only', async () => {
    expect(await runNamed('get_profile', {})).toEqual({ content: '' });
    expect(await runNamed('get_equipment', {})).toEqual({ items: [] });

    const bench = { id: newId(), type: 'bench', props: { incline: true, decline: false } };
    const dumbbells = { id: newId(), type: 'dumbbells', props: { max_kg: 30 } };
    await push(token, [
      upsert('athlete_profile', { id: ATHLETE_PROFILE_ID, content: 'Cel: siła' }),
      upsert('equipment_items', bench),
      upsert('equipment_items', dumbbells),
    ]);
    await push(token, [remove('equipment_items', bench.id)]);

    expect(await runNamed('get_profile', {})).toEqual({ content: 'Cel: siła' });
    expect(await runNamed('get_equipment', {})).toMatchObject({
      items: [{ id: dumbbells.id, type: 'dumbbells', props: { max_kg: 30 } }],
    });

    await push(token, [remove('athlete_profile', ATHLETE_PROFILE_ID)]);
    expect(await runNamed('get_profile', {})).toEqual({ content: '' });
  });

  it('get_active_workout belongs to the local day of the turn', async () => {
    await pushDay(token, TODAY, [{ status: 'planned' }]);
    const active = await runNamed<{ date: string; workouts: unknown[] }>(
      'get_active_workout',
      {},
      toolContext({ today: '2026-11-01' }),
    );
    expect(active).toEqual({ date: '2026-11-01', workouts: [] });
  });
});

import { addDays, newId, SETTING_IDS } from '@liftwise/core';
import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  createDevice,
  db,
  push,
  remove,
  repsExercise,
  timedExercise,
  upsert,
} from '../../test/helpers';
import { done, pushDay } from '../../test/tools';
import { generatePlan, loadPlanContext, plannerPrompt } from './plan';

const TODAY = '2026-10-31';
const DATE = '2026-11-02';
const noCheckin = { time_min: null, wellbeing: null, pain: null };

const timed = (duration_s: number, fields: Record<string, unknown> = {}) =>
  done({ exercise_id: timedExercise.id, weight_kg: 0, reps: null, duration_s, ...fields });

const pushEquipment = (...items: ('dumbbells' | 'bench')[]) =>
  push(
    token,
    items.map((type) =>
      upsert('equipment_items', {
        id: newId(),
        type,
        props: type === 'bench' ? { incline: true, decline: false } : { max_kg: 40 },
      }),
    ),
  );

// The prompt of a plan for DATE, and one of its sections by its first words.
async function prompt(request: Partial<Parameters<typeof plannerPrompt>[1]> = {}) {
  const context = await loadPlanContext(db(), DATE, TODAY);
  const text = plannerPrompt(context, { checkin: noCheckin, ...request });
  return {
    text,
    section: (title: string) => text.split('\n\n').find((part) => part.startsWith(title)) ?? '',
  };
}

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

describe('the context of a plan', () => {
  it('has the 21 days before today up to the day, planned ones too, and the day apart', async () => {
    const start = addDays(TODAY, -21);
    await pushDay(token, addDays(start, -1), [done()]);
    await pushDay(token, start, [done()]);
    await pushDay(token, '2026-11-01', [{ status: 'planned' }]);
    await pushDay(token, DATE, [done(), { status: 'planned' }]);
    await pushDay(token, addDays(DATE, 1), [{ status: 'planned' }]);
    const deleted = await pushDay(token, '2026-10-30', [done()]);
    await push(token, [remove('workouts', deleted.workout.id)]);

    const context = await loadPlanContext(db(), DATE, TODAY);

    expect(context.recent.map((set) => set.date)).toEqual([start, '2026-11-01']);
    expect(context.day.map((set) => set.status)).toEqual(['done', 'planned']);
  });

  it('offers only exercises the athlete can do, with their steps', async () => {
    const line = (text: string, id: string) =>
      text.split('\n').find((row) => row.startsWith(`- ${id} |`));

    const none = await prompt();
    expect(none.section('Equipment:')).toBe('Equipment: none listed.');
    expect(line(none.section('Exercise catalog'), repsExercise.id)).toBeUndefined();
    expect(line(none.section('Exercise catalog'), timedExercise.id)).toBeDefined();

    await pushEquipment('dumbbells', 'bench');
    await push(token, [
      upsert('settings', {
        id: SETTING_IDS.training,
        key: 'training',
        value: { rest_seconds: 120, target_rir: { min: 1, max: 2 }, weight_step_kg: 2.5 },
      }),
      upsert('exercises', { ...timedExercise, weight_step_kg: 5 }),
    ]);
    const all = await prompt();
    const catalog = all.section('Exercise catalog');
    const { min, max } = repsExercise.rep_range ?? { min: 0, max: 0 };
    expect(line(catalog, repsExercise.id)).toBe(
      `- ${repsExercise.id} | ${repsExercise.name_pl} | reps ${min}-${max} | ` +
        `${repsExercise.primary_muscles.join(',')} | rest ${repsExercise.rest_seconds}s | step 2.5 kg`,
    );
    expect(line(catalog, timedExercise.id)).toContain('| time 30-90 |');
    expect(line(catalog, timedExercise.id)).toContain('| step 5 kg');

    await push(token, [upsert('exercises', { ...repsExercise, archived: true })]);
    expect(line((await prompt()).section('Exercise catalog'), repsExercise.id)).toBeUndefined();
  });

  it('hints only what is available, for the day of the plan', async () => {
    await pushDay(token, '2026-10-27', [done({ weight_kg: 20, reps: 10 })]);
    await pushDay(token, '2026-10-28', [timed(45)]);
    // Not before the day of the plan: it doesn't count yet.
    await pushDay(token, DATE, [done({ weight_kg: 30, reps: 10 })]);

    const hints = () => prompt().then(({ section }) => section('Progression hints'));
    const without = await hints();
    expect(without).toContain(`Progression hints for ${DATE}:`);
    expect(without).not.toContain(repsExercise.name_pl);
    expect(without).toContain(`${timedExercise.name_pl}: 0 kg x 50s (time_up, target RIR 1-2)`);

    await pushEquipment('dumbbells', 'bench');
    expect(await hints()).toContain(
      `${repsExercise.name_pl}: 20 kg x 11 (reps_up, target RIR 1-2)`,
    );
  });

  it('flags a stalled exercise in its hint', async () => {
    await pushEquipment('dumbbells', 'bench');
    await pushDay(token, '2026-10-20', [done({ reps: 12 })]);
    await pushDay(token, '2026-10-24', [done({ reps: 11 })]);
    await pushDay(token, '2026-10-28', [done({ reps: 10 })]);
    expect((await prompt()).section('Progression hints')).toContain(', stalled)');
  });

  it('sums sessions per day and exercise, without warm-ups', async () => {
    await pushDay(token, '2026-10-27', [
      done({ weight_kg: 10, reps: 15, warmup: true }),
      done({ weight_kg: 20, reps: 10 }),
      done({ weight_kg: 20, reps: 9 }),
      done({ weight_kg: 22.5, reps: 8 }),
      { status: 'planned', weight_kg: 25, reps: 6 },
      timed(45),
    ]);
    await pushDay(token, '2026-11-01', [{ status: 'planned', weight_kg: 21.25, reps: 7 }]);
    await pushDay(token, DATE, [done({ weight_kg: 24, reps: 8 }), { status: 'planned', reps: 6 }]);

    const { section } = await prompt();
    const name = repsExercise.name_pl;
    expect(section('Sessions of the last 21 days').split('\n').slice(1)).toEqual([
      `- 2026-10-27 (Tuesday) done: ${name} 20 kg x 10, 9; ${name} 22.5 kg x 8; ${timedExercise.name_pl} 0 kg x 45s`,
      `- 2026-10-27 (Tuesday) planned: ${name} 25 kg x 6`,
      `- 2026-11-01 (Sunday) planned: ${name} 21.25 kg x 7`,
    ]);
    expect(section('The day itself so far').split('\n').slice(1)).toEqual([
      `- ${DATE} (Monday) done: ${name} 24 kg x 8`,
      `- ${DATE} (Monday) planned: ${name} 20 kg x 6`,
    ]);
  });

  it('says what it does not know', async () => {
    const { section } = await prompt();
    expect(section('Check-in:')).toBe(
      'Check-in:\n- time available: not given\n- wellbeing (1-5): not given\n- pain or limitations: none reported',
    );
    expect(section('Athlete profile:')).toBe('Athlete profile:\n(empty)');
    expect(section('Progression hints')).toContain('(none)');
    expect(section('Sessions of the last 21 days')).toContain('(none)');
    expect(section('The day itself so far')).toContain('(none)');
  });

  it('asks for a change with the last plan, and without one when there is none', async () => {
    const plan = {
      exercises: [
        {
          exercise_id: timedExercise.id,
          sets: [{ weight_kg: 0, reps: null, duration_s: 45, warmup: false }],
          target_rir: null,
        },
      ],
      rationale: 'Krótko.',
    };
    const withPlan = await prompt({ change: { request: 'bez deski', plan } });
    expect(withPlan.text).toContain(`The last proposed plan:\n${JSON.stringify(plan)}`);
    expect(withPlan.text).toContain('The athlete asks for this change: bez deski');

    const without = await prompt({ change: { request: 'inny', plan: null } });
    expect(without.text).not.toContain('The last proposed plan');
    expect(without.text).toContain('The athlete asks for this change: inny');

    expect((await prompt()).text).not.toContain('The athlete asks for this change');
  });
});

describe('generatePlan', () => {
  const usage = {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
  };

  const answering = (text: string) =>
    new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      },
    });

  const planOf = async (model: MockLanguageModelV4) =>
    generatePlan(model, await loadPlanContext(db(), DATE, TODAY), { checkin: noCheckin });

  it('makes one structured call with the rules and without tools (§5.9.6)', async () => {
    const output = { exercises: [], rationale: 'Odpoczynek.' };
    const model = answering(JSON.stringify(output));

    expect(await planOf(model)).toEqual(output);

    expect(model.doGenerateCalls).toHaveLength(1);
    const [call] = model.doGenerateCalls;
    expect(call?.tools ?? []).toEqual([]);
    expect(call?.responseFormat).toMatchObject({ type: 'json', schema: { type: 'object' } });
    expect(call?.prompt[0]).toMatchObject({ role: 'system' });
    expect(JSON.stringify(call?.prompt[0])).toContain('never invent history');
    expect(JSON.stringify(call?.prompt[1])).toContain(`Workout for ${DATE}`);
  });

  it.each(['to nie JSON', JSON.stringify({ exercises: 'wyciskanie' })])(
    'fails on an answer that is not a plan: %s',
    async (text) => {
      await expect(planOf(answering(text))).rejects.toThrow(/no object generated/i);
    },
  );
});

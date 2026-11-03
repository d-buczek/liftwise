import { describe, expect, it } from 'vite-plus/test';
import { newId } from './ids';
import {
  applyPlan,
  checkPlan,
  workoutPlanSchema,
  type PlannerOutput,
  type WorkoutPlan,
} from './plan';
import type { EquipmentItem } from './schemas/equipment';
import { workoutSetSchema } from './schemas/set';
import { workoutSchema } from './schemas/workout';
import { makeExercise, makeSet, makeTimedExercise } from './testing';

const press = makeExercise({ requires: ['dumbbells'] });
const benchPress = makeExercise({ name_pl: 'Wyciskanie na ławce', requires: ['bench'] });
const plank = makeTimedExercise();
const exercises = [press, benchPress, plank, makeExercise({ id: newId(), archived: true })];
const archived = exercises[3]!;

const dumbbells: EquipmentItem = { id: newId(), type: 'dumbbells', props: { max_kg: 24 } };

const output = (fields: Partial<PlannerOutput> = {}): PlannerOutput => ({
  exercises: [
    {
      exercise_id: press.id,
      sets: [{ weight_kg: 22.5, reps: 10, duration_s: null, warmup: false }],
      target_rir: 1,
    },
  ],
  rationale: 'Krótko, bo mało czasu.',
  ...fields,
});

const check = (fields: Partial<PlannerOutput> = {}, equipment = [dumbbells]) =>
  checkPlan({ output: output(fields), exercises, equipment });

const pressWith = (sets: PlannerOutput['exercises'][number]['sets'], target_rir = 1) => ({
  exercises: [{ exercise_id: press.id, sets, target_rir }],
});

describe('checkPlan', () => {
  it('accepts a plan as it is', () => {
    const { plan } = check();
    expect(plan).toEqual(output());
    expect(workoutPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('brings weights to the precision and within the heaviest dumbbell', () => {
    const { plan } = check(
      pressWith([
        { weight_kg: 22.6, reps: 10, duration_s: null, warmup: false },
        { weight_kg: 30, reps: 10, duration_s: null, warmup: false },
        { weight_kg: -5, reps: 10, duration_s: null, warmup: false },
      ]),
    );
    expect(plan?.exercises[0]?.sets.map((set) => set.weight_kg)).toEqual([22.5, 24, 0]);
  });

  it('keeps weights without a dumbbell limit', () => {
    const { plan } = check(
      pressWith([{ weight_kg: 60, reps: 8, duration_s: null, warmup: false }]),
      [{ id: newId(), type: 'dumbbells', props: { max_kg: null } }],
    );
    expect(plan?.exercises[0]?.sets[0]?.weight_kg).toBe(60);
  });

  it('keeps only the value of the measure and whole numbers', () => {
    const { plan } = check({
      exercises: [
        {
          exercise_id: plank.id,
          sets: [{ weight_kg: 0, reps: 5, duration_s: 44.6, warmup: false }],
          target_rir: null,
        },
      ],
    });
    expect(plan?.exercises[0]?.sets[0]).toMatchObject({ reps: null, duration_s: 45 });
  });

  it('brings target RIR into its range', () => {
    const rirOf = (target_rir: number) =>
      check(pressWith([{ weight_kg: 20, reps: 10, duration_s: null, warmup: false }], target_rir))
        .plan?.exercises[0]?.target_rir;
    expect(rirOf(7)).toBe(4);
    expect(rirOf(-1)).toBe(0);
  });

  it('rejects what rounding cannot fix', () => {
    const unavailable = (exercise_id: string) => ({
      error: { code: 'plan_exercise_unavailable', exercise_id },
    });
    const exerciseOf = (exercise_id: string) => ({
      exercises: [
        {
          exercise_id,
          sets: [{ weight_kg: 20, reps: 10, duration_s: null, warmup: false }],
          target_rir: 1,
        },
      ],
    });
    expect(check(exerciseOf('nope'))).toEqual(unavailable('nope'));
    expect(check(exerciseOf(archived.id))).toEqual(unavailable(archived.id));
    // The profile has no bench.
    expect(check(exerciseOf(benchPress.id))).toEqual(unavailable(benchPress.id));

    const invalid = { error: { code: 'plan_set_invalid', exercise_id: press.id } };
    expect(check(pressWith([]))).toEqual(invalid);
    expect(
      check(pressWith([{ weight_kg: 20, reps: null, duration_s: 30, warmup: false }])),
    ).toEqual(invalid);

    expect(check({ exercises: [] })).toEqual({ error: { code: 'plan_empty' } });
    expect(check({ rationale: '  ' })).toEqual({ error: { code: 'plan_empty' } });
  });
});

describe('applyPlan', () => {
  const plan: WorkoutPlan = {
    exercises: [
      {
        exercise_id: press.id,
        sets: [
          { weight_kg: 10, reps: 12, duration_s: null, warmup: true },
          { weight_kg: 22.5, reps: 10, duration_s: null, warmup: false },
        ],
        target_rir: 1,
      },
      {
        exercise_id: plank.id,
        sets: [{ weight_kg: 0, reps: null, duration_s: 45, warmup: false }],
        target_rir: null,
      },
    ],
    rationale: 'Krótko, bo mało czasu.',
  };
  const checkin = { time_min: 30, wellbeing: 3, pain: 'bark' };
  const date = '2026-11-05';

  it('creates the workout of an empty day, without starting it', () => {
    const { workout, removed, added } = applyPlan({ date, workouts: [], sets: [], plan, checkin });
    expect(workoutSchema.safeParse(workout).success).toBe(true);
    expect(workout).toMatchObject({
      date,
      checkin,
      rationale: plan.rationale,
      started_at: null,
    });
    expect(removed).toEqual([]);
    expect(added.map((set) => set.position)).toEqual([0, 1, 2]);
    expect(added.every((set) => workoutSetSchema.safeParse(set).success)).toBe(true);
    expect(added.every((set) => set.workout_id === workout.id)).toBe(true);
    expect(added.every((set) => set.status === 'planned' && set.source === 'proposal')).toBe(true);
  });

  it('puts the target RIR on working sets only', () => {
    const { added } = applyPlan({ date, workouts: [], sets: [], plan, checkin });
    expect(added.map((set) => set.rir)).toEqual([null, 1, null]);
  });

  it('replaces the planned sets of every workout of the day and keeps the done ones', () => {
    const oldest = workoutSchema.parse({ id: '019a0000-0000-7000-8000-000000000001', date });
    const other = workoutSchema.parse({
      id: '019a0000-0000-7000-8000-000000000002',
      date,
      label_id: null,
    });
    const doneSet = makeSet({ workout_id: oldest.id, position: 3 });
    const plannedHere = makeSet({
      workout_id: oldest.id,
      position: 4,
      status: 'planned',
      performed_at: null,
    });
    const plannedThere = makeSet({
      workout_id: other.id,
      position: 0,
      status: 'planned',
      performed_at: null,
    });
    const { workout, removed, added } = applyPlan({
      date,
      workouts: [other, oldest],
      sets: [doneSet, plannedHere, plannedThere],
      plan,
      checkin: null,
    });
    expect(workout.id).toBe(oldest.id);
    expect(workout.checkin).toBeNull();
    expect(removed.map((set) => set.id)).toEqual([plannedHere.id, plannedThere.id]);
    expect(added.map((set) => set.position)).toEqual([4, 5, 6]);
    expect(added.every((set) => set.workout_id === oldest.id)).toBe(true);
  });
});

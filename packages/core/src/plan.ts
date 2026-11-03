import { z } from 'zod';
import { isDoneSet, RIR_MAX, roundWeightKg } from './conventions';
import { nextPosition, dayWorkout } from './day';
import { newId as defaultNewId } from './ids';
import { maxDumbbellKg } from './progression';
import { rirSchema, weightKgSchema } from './schemas/common';
import type { EquipmentItem } from './schemas/equipment';
import type { Exercise } from './schemas/exercise';
import type { WorkoutSet } from './schemas/set';
import { checkinSchema, workoutSchema, type Checkin, type Workout } from './schemas/workout';
import { isExerciseAvailable } from './swap';

// The optional workout proposal (§5.9.6): the plan the `planner` model returns, its check against
// the catalog and the equipment, and what accepting it writes on a day.

// What the model answers. Providers differ in what a structured output schema may contain, so
// this has no numeric or length constraints and no optional fields: `checkPlan` enforces them.
export const plannerOutputSchema = z.object({
  exercises: z.array(
    z.object({
      exercise_id: z.string().describe('Exercise id from the catalog'),
      sets: z.array(
        z.object({
          weight_kg: z.number().describe('Per dumbbell, kg; 0 for bodyweight'),
          reps: z
            .number()
            .nullable()
            .describe('Target reps; null for an exercise measured in time'),
          duration_s: z
            .number()
            .nullable()
            .describe('Target seconds; null for an exercise measured in reps'),
          warmup: z.boolean(),
        }),
      ),
      target_rir: z.number().nullable().describe('Target reps in reserve of the working sets, 0-4'),
    }),
  ),
  rationale: z
    .string()
    .describe('Why this workout, in Polish, one to three sentences, for the athlete'),
});
export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

// A checked plan: stored in the proposal and shown on the card.
export const workoutPlanSchema = z.object({
  exercises: z
    .array(
      z.object({
        exercise_id: z.string(),
        sets: z
          .array(
            z.object({
              weight_kg: weightKgSchema,
              reps: z.int().positive().nullable(),
              duration_s: z.int().positive().nullable(),
              warmup: z.boolean(),
            }),
          )
          .min(1),
        target_rir: rirSchema.nullable(),
      }),
    )
    .min(1),
  rationale: z.string().min(1),
});
export type WorkoutPlan = z.infer<typeof workoutPlanSchema>;

// The stored input of an accepted plan: everything confirming needs, without a model.
export const planProposalSchema = z.object({
  date: z.string(),
  checkin: checkinSchema.nullable(),
  plan: workoutPlanSchema,
});
export type PlanProposal = z.infer<typeof planProposalSchema>;

export type PlanError =
  // Unknown, archived, or needing equipment the athlete doesn't have.
  | { code: 'plan_exercise_unavailable'; exercise_id: string }
  // A set without a positive value in the exercise's measure.
  | { code: 'plan_set_invalid'; exercise_id: string }
  | { code: 'plan_empty' };

export type CheckPlanResult =
  | { plan: WorkoutPlan; error?: never }
  | { plan?: never; error: PlanError };

export type CheckPlanInput = {
  output: PlannerOutput;
  exercises: Exercise[];
  equipment: EquipmentItem[];
};

// Turns the model's answer into a plan the athlete can do: rejects what no rounding can fix, and
// brings weights to the app's precision and within the heaviest dumbbell.
export function checkPlan({ output, exercises, equipment }: CheckPlanInput): CheckPlanResult {
  const rationale = output.rationale.trim();
  if (output.exercises.length === 0 || !rationale) return { error: { code: 'plan_empty' } };
  const maxWeightKg = maxDumbbellKg(equipment);

  const checked: WorkoutPlan['exercises'] = [];
  for (const { exercise_id, sets, target_rir } of output.exercises) {
    const exercise = exercises.find((row) => row.id === exercise_id);
    if (!exercise || exercise.archived || !isExerciseAvailable(exercise, equipment)) {
      return { error: { code: 'plan_exercise_unavailable', exercise_id } };
    }
    const value = (set: PlannerOutput['exercises'][number]['sets'][number]) =>
      Math.round((exercise.measure === 'reps' ? set.reps : set.duration_s) ?? 0);
    if (sets.length === 0 || sets.some((set) => value(set) < 1)) {
      return { error: { code: 'plan_set_invalid', exercise_id } };
    }
    checked.push({
      exercise_id,
      sets: sets.map((set) => ({
        weight_kg: withinEquipment(set.weight_kg, maxWeightKg),
        reps: exercise.measure === 'reps' ? value(set) : null,
        duration_s: exercise.measure === 'time' ? value(set) : null,
        warmup: set.warmup,
      })),
      target_rir: target_rir === null ? null : clampRir(target_rir),
    });
  }
  return { plan: { exercises: checked, rationale } };
}

function withinEquipment(weightKg: number, maxWeightKg: number | null): number {
  const rounded = roundWeightKg(Math.max(0, weightKg));
  return maxWeightKg === null ? rounded : Math.min(rounded, maxWeightKg);
}

const clampRir = (rir: number) => Math.min(RIR_MAX, Math.max(0, Math.round(rir)));

export type ApplyPlanInput = {
  date: string;
  // The day's live workouts and sets.
  workouts: Workout[];
  sets: WorkoutSet[];
  plan: WorkoutPlan;
  checkin: Checkin | null;
  newId?: () => string;
};

export type AppliedPlan = {
  // The day's oldest workout or a new one, with the rationale and the check-in.
  workout: Workout;
  // The planned sets it replaces.
  removed: WorkoutSet[];
  added: WorkoutSet[];
};

// Accepting a plan (§5.9.6): it replaces the day's planned sets, done sets stay, and it goes after
// them. Doesn't start the workout, the day may be in the future. Target RIR goes on the planned
// sets; logging a set replaces it with what the set actually felt like.
export function applyPlan({
  date,
  workouts,
  sets,
  plan,
  checkin,
  newId = defaultNewId,
}: ApplyPlanInput): AppliedPlan {
  const workout = dayWorkout(workouts) ?? workoutSchema.parse({ id: newId(), date });
  let position = nextPosition(sets.filter(isDoneSet));
  return {
    workout: { ...workout, checkin, rationale: plan.rationale },
    removed: sets.filter((set) => !isDoneSet(set)),
    added: plan.exercises.flatMap(({ exercise_id, sets: planned, target_rir }) =>
      planned.map((set) => ({
        id: newId(),
        workout_id: workout.id,
        exercise_id,
        position: position++,
        status: 'planned' as const,
        weight_kg: set.weight_kg,
        reps: set.reps,
        duration_s: set.duration_s,
        rir: set.warmup ? null : target_rir,
        warmup: set.warmup,
        note: '',
        performed_at: null,
        source: 'proposal' as const,
      })),
    ),
  };
}

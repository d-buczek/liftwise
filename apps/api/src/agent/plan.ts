import {
  addDays,
  balanceSnapshot,
  isExerciseAvailable,
  isDoneSet,
  maxDumbbellKg,
  plannerOutputSchema,
  progressionHint,
  weightStepKg,
  type BalanceSnapshot,
  type Checkin,
  type DatedSet,
  type EquipmentItem,
  type Exercise,
  type PlannerOutput,
  type ProgressionHint,
  type TrainingSettings,
  type WorkoutPlan,
} from '@liftwise/core';
import { generateText, Output, zodSchema, type LanguageModel } from 'ai';
import type { Db } from '../db';
import {
  balanceSets,
  balanceSettings,
  catalog,
  days,
  equipment,
  history,
  profile,
  trainingSettings,
} from '../tools/data';
import { balanceLines, equipmentLine, weekdayOf } from './prompt';

// The workout proposal's model call (§5.9.6): the server gathers the context, the `planner` model
// answers once with a structured plan, without tools.

// "The last 2–3 weeks of sessions".
const RECENT_DAYS = 21;

const RULES = `You plan one workout for one athlete of LiftWise, who trains at home with adjustable dumbbells and a bench. Everything you know about their training is in this message; never invent history or weights.

- Use only exercises from the catalog, by id. Weights are kg per dumbbell; 0 kg is bodyweight. Every weight is a whole multiple of the exercise's step (at step 1.25: 3.75, 5 or 12.5, not 4 or 12), the athlete can't load anything between. Only a weight from their logged history can be off it. An exercise measured in reps gets reps, one measured in time gets duration_s.
- The progression hints are the baseline for an exercise's weight, sets and reps. Deviate only because of the check-in or the balance, and say why in the rationale. An exercise without a hint starts light, at the bottom of its range.
- Fit the time available: count about 2 minutes per set plus the exercise's rest. Without a time, use the profile's typical session length, else 45 minutes.
- Low wellbeing (1-2): fewer sets and lighter weights, no sets close to failure.
- Pain or a limitation: leave out what loads that area. Never plan through pain.
- Prefer muscle groups below their weekly target, and let those trained in the last two days rest.
- The day's done sets stay: plan only what is left of the day and don't repeat them. The day's planned sets show what the athlete intended and will be replaced by your plan: keep what still fits.
- Warm-up sets (warmup: true) only before the first heavy exercise, at about half of its weight.
- The rationale is for the athlete: Polish, plain text, one to three sentences, naming what you changed from the hints and why.`;

// Built on the first plan and kept: `Output.object` converts the schema when called, which every
// other turn of a cold isolate shouldn't pay for (LW-15).
let planOutput: ReturnType<typeof createPlanOutput> | undefined;
const createPlanOutput = () => Output.object({ schema: zodSchema(plannerOutputSchema) });

export type PlanContext = {
  date: string;
  today: string;
  exercises: Exercise[];
  equipment: EquipmentItem[];
  training: TrainingSettings;
  profile: string;
  balance: BalanceSnapshot;
  hints: { exercise: Exercise; hint: ProgressionHint }[];
  // Before the day, planned ones too (a future day has planned days before it).
  recent: DatedSet[];
  day: DatedSet[];
};

export async function loadPlanContext(db: Db, date: string, today: string): Promise<PlanContext> {
  const [exercises, items, profileText, training, balance, balanceRows, window, allSets] =
    await Promise.all([
      catalog(db),
      equipment(db),
      profile(db),
      trainingSettings(db),
      balanceSettings(db),
      balanceSets(db, today),
      days(db, addDays(today, -RECENT_DAYS), date),
      history(db),
    ]);
  // A hint needs an exercise's whole history: one not trained lately still has its last weights.
  const byExercise = Map.groupBy(allSets, (set) => set.exercise_id);
  const maxWeightKg = maxDumbbellKg(items);
  return {
    date,
    today,
    exercises,
    equipment: items,
    training,
    profile: profileText,
    balance: balanceSnapshot({ sets: balanceRows, exercises, balance, today }),
    hints: exercises.flatMap((exercise) => {
      const sets = byExercise.get(exercise.id);
      if (!sets || exercise.archived || !isExerciseAvailable(exercise, items)) return [];
      const hint = progressionHint({ exercise, training, sets, date, maxWeightKg });
      return hint ? [{ exercise, hint }] : [];
    }),
    recent: window.sets.filter((set) => set.date < date),
    day: window.sets.filter((set) => set.date === date),
  };
}

const value = (set: Pick<DatedSet, 'reps' | 'duration_s'>) =>
  set.duration_s === null ? `${set.reps}` : `${set.duration_s}s`;

function catalogLines({ exercises, equipment: items, training }: PlanContext): string {
  return exercises
    .filter((exercise) => !exercise.archived && isExerciseAvailable(exercise, items))
    .map((exercise) => {
      const { min, max } = exercise.measure === 'reps' ? exercise.rep_range : exercise.time_range_s;
      const range = `${exercise.measure} ${min}-${max}`;
      const muscles = exercise.primary_muscles.join(',');
      const rest = `rest ${exercise.rest_seconds}s`;
      const step = `step ${weightStepKg(exercise, training)} kg`;
      return `- ${exercise.id} | ${exercise.name_pl} | ${range} | ${muscles} | ${rest} | ${step}`;
    })
    .join('\n');
}

function hintLines(hints: PlanContext['hints']): string {
  return hints
    .map(({ exercise, hint }) => {
      const values = hint.reps ?? hint.duration_s?.map((seconds) => `${seconds}s`) ?? [];
      const stall = hint.stall ? ', stalled' : '';
      return `- ${exercise.name_pl}: ${hint.weight} kg x ${values.join(', ')} (${hint.reason}, target RIR ${hint.targetRir.min}-${hint.targetRir.max}${stall})`;
    })
    .join('\n');
}

// Per day and exercise: "22.5 kg x 10, 10, 9". Warm-ups don't tell the load. The weekday is spelled
// out: a model naming a session's day from its date alone got it wrong in the rationale.
function setLines(sets: DatedSet[], exercises: Exercise[]): string {
  const names = new Map(exercises.map((exercise) => [exercise.id, exercise.name_pl]));
  const byDay = Map.groupBy(
    sets.filter((set) => !set.warmup),
    (set) => `${set.date} (${weekdayOf(set.date)}) ${isDoneSet(set) ? 'done' : 'planned'}`,
  );
  return [...byDay]
    .map(([day, rows]) => {
      const groups = Map.groupBy(rows, (set) => `${set.exercise_id} ${set.weight_kg}`);
      const parts = [...groups.values()].map((group) => {
        const [first] = group as [DatedSet];
        const name = names.get(first.exercise_id) ?? first.exercise_id;
        return `${name} ${first.weight_kg} kg x ${group.map(value).join(', ')}`;
      });
      return `- ${day}: ${parts.join('; ')}`;
    })
    .join('\n');
}

const orNone = (text: string) => text || '(none)';

export type PlanRequest = {
  checkin: Checkin;
  // "Change the last plan": what the athlete asked, and that plan when there is one.
  change?: { request: string; plan: WorkoutPlan | null };
};

export function plannerPrompt(context: PlanContext, { checkin, change }: PlanRequest): string {
  const { time_min, wellbeing, pain } = checkin;
  const sections = [
    `Workout for ${context.date} (${weekdayOf(context.date)}); today is ${context.today} (${weekdayOf(context.today)}).`,
    [
      'Check-in:',
      `- time available: ${time_min === null ? 'not given' : `${time_min} min`}`,
      `- wellbeing (1-5): ${wellbeing ?? 'not given'}`,
      `- pain or limitations: ${pain ?? 'none reported'}`,
    ].join('\n'),
    `Athlete profile:\n${context.profile.trim() || '(empty)'}`,
    `Equipment: ${equipmentLine(context.equipment)}.`,
    `Exercise catalog (id | name | measure and range | primary muscles | rest | weight step):\n${catalogLines(context)}`,
    `Hard sets per muscle group in the last 7 days:\n${balanceLines(context.balance)}`,
    `Progression hints for ${context.date}:\n${orNone(hintLines(context.hints))}`,
    `Sessions of the last ${RECENT_DAYS} days:\n${orNone(setLines(context.recent, context.exercises))}`,
    `The day itself so far:\n${orNone(setLines(context.day, context.exercises))}`,
  ];
  if (change) {
    if (change.plan) sections.push(`The last proposed plan:\n${JSON.stringify(change.plan)}`);
    sections.push(`The athlete asks for this change: ${change.request}`);
  }
  return sections.join('\n\n');
}

export async function generatePlan(
  model: LanguageModel,
  context: PlanContext,
  request: PlanRequest,
): Promise<PlannerOutput> {
  const { output } = await generateText({
    model,
    instructions: RULES,
    prompt: plannerPrompt(context, request),
    output: (planOutput ??= createPlanOutput()),
  });
  return output;
}

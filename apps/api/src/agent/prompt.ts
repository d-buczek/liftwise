import type { BalanceSnapshot, EquipmentItem, Exercise, Provider } from '@liftwise/core';
import type { SystemModelMessage } from 'ai';

// The system prompt contract (§5.9.2) and the context sent with every turn (§6.6). The stable
// part (rules + catalog) comes first, so Anthropic can cache it together with the tools.

const RULES = `You are the assistant of LiftWise, the training log of one athlete who trains at home with adjustable dumbbells and a bench.

Reply in the user's language (Polish by default), briefly: one or two sentences, no lists unless asked.

Conventions:
- Weights are kg per dumbbell; 0 kg is bodyweight. "24 kg 4x10" is four sets of 10 reps at 24 kg; "3x45 s" is three timed sets of 45 seconds.
- RIR is reps in reserve, 0-4: "ostatnia na zero" means the last set at RIR 0.
- An exercise is measured in reps or in time (seconds): log reps for one, duration_s for the other.
- Sets are planned or done; only done sets count. Done sets are logged today or on past days, never on a future day.
- "Ostatnia seria" (the last set) is today's done set with the latest performed_at.

Rules:
- Every fact about training comes from the tools; never invent history, weights or dates.
- Match exercises with the catalog below by name and alias; spoken input may be mis-transcribed. Use find_exercise when the catalog gives no single clear match.
- Ask instead of guessing, and write nothing, when the exercise match is ambiguous (more than one plausible candidate) or unknown, when sets, reps or seconds are missing, or when the target set or session is unclear (e.g. "ostatnia seria" while two exercises are in progress).
- Write tools run at once and the user sees a change card with an undo button: confirm in a few words without repeating the card.
- Risky tools only propose a change: say briefly what will change and that it runs after the user taps "Zatwierdź" on the card.
- A tool result with "error" explains why the call didn't run: correct the call or ask the user.
- Change the athlete profile, the catalog or the settings only when the user asks; when they state a lasting goal, limitation or preference, offer to add it to the profile.`;

// Name, aliases and measure per exercise: enough to match what the user says to an id.
function catalogLines(exercises: Exercise[]): string {
  return exercises
    .filter((exercise) => !exercise.archived)
    .sort((a, b) => a.name_pl.localeCompare(b.name_pl, 'pl'))
    .map((exercise) => {
      const aliases = exercise.aliases.length > 0 ? ` (${exercise.aliases.join(', ')})` : '';
      return `- ${exercise.id} | ${exercise.name_pl}${aliases} | ${exercise.measure}`;
    })
    .join('\n');
}

function equipmentLine(items: EquipmentItem[]): string {
  const described = items.map((item) =>
    item.type === 'dumbbells'
      ? `adjustable dumbbells${item.props.max_kg === null ? '' : ` up to ${item.props.max_kg} kg`}`
      : `bench${item.props.incline ? ', incline' : ''}${item.props.decline ? ', decline' : ''}`,
  );
  return described.length > 0 ? described.join('; ') : 'none listed';
}

function balanceLines(balance: BalanceSnapshot): string {
  return balance.muscles
    .map(({ group, hardSets, target, status, daysSince }) => {
      const since = daysSince === null ? 'never' : `${daysSince} d ago`;
      return `- ${group}: ${hardSets} (target ${target.min}-${target.max}, ${status}), last ${since}`;
    })
    .join('\n');
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type PromptContext = {
  provider: Provider;
  localTime: string;
  today: string;
  catalog: Exercise[];
  equipment: EquipmentItem[];
  profile: string;
  balance: BalanceSnapshot;
};

export function systemMessages(context: PromptContext): SystemModelMessage[] {
  const weekday = WEEKDAYS[new Date(`${context.today}T00:00:00Z`).getUTCDay()];
  const stable = `${RULES}\n\nExercise catalog (id | name (aliases) | measure):\n${catalogLines(context.catalog)}`;
  const current = [
    `Now: ${context.localTime} (${weekday}, local time).`,
    `Athlete profile:\n${context.profile.trim() || '(empty)'}`,
    `Equipment: ${equipmentLine(context.equipment)}.`,
    `Hard sets per muscle group in the last 7 days:\n${balanceLines(context.balance)}`,
  ].join('\n\n');
  return [
    {
      role: 'system',
      content: stable,
      // The breakpoint caches tools + rules + catalog (§6.6); other providers ignore it.
      providerOptions:
        context.provider === 'anthropic'
          ? { anthropic: { cacheControl: { type: 'ephemeral' } } }
          : undefined,
    },
    { role: 'system', content: current },
  ];
}

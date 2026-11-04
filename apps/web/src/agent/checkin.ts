import type { WorkoutRequest } from '@liftwise/core';
import { shallowRef } from 'vue';
import { i18n } from '../i18n';

// The check-in of a workout proposal (§5.9.6). It goes to today's thread as an ordinary message, so
// it reads well there and works through the offline queue, together with its answers as data.

export const PAIN_AREAS = ['shoulder', 'elbow', 'wrist', 'lowerBack', 'hip', 'knee'] as const;
export type PainArea = (typeof PAIN_AREAS)[number];

export const TIME_CHIPS = [20, 30, 45, 60] as const;
// "60+": the last chip has no upper limit.
export const TIME_MAX = 60;

export type CheckinAnswers = {
  timeMin: number | null;
  wellbeing: number | null;
  pain: PainArea[];
  note: string;
};

function painText(answers: CheckinAnswers): string {
  const { t } = i18n.global;
  return [
    ...answers.pain.map((area) => t(`agent.plan.painAreas.${area}`)),
    ...(answers.note.trim() ? [answers.note.trim()] : []),
  ].join(', ');
}

export function checkinMessage(date: string, answers: CheckinAnswers): string {
  const { t } = i18n.global;
  const pain = painText(answers);
  return [
    // The exact date: "tomorrow" would read wrong in the thread a day later.
    t('agent.plan.message.request', { date }),
    ...(answers.timeMin === null
      ? []
      : [
          t('agent.plan.message.time', {
            time: answers.timeMin >= TIME_MAX ? `${TIME_MAX}+` : String(answers.timeMin),
          }),
        ]),
    ...(answers.wellbeing === null
      ? []
      : [t('agent.plan.message.wellbeing', { value: answers.wellbeing })]),
    ...(pain ? [t('agent.plan.message.pain', { pain })] : []),
  ].join(' ');
}

// The same answers as what to plan: the server runs the planner on them, no model reads the message.
export function checkinRequest(date: string, answers: CheckinAnswers): WorkoutRequest {
  return {
    date,
    time_min: answers.timeMin ?? undefined,
    wellbeing: answers.wellbeing ?? undefined,
    pain: painText(answers) || undefined,
  };
}

export type AgentPrompt = { text: string; workout: WorkoutRequest };

// A prompt another page sends through the agent page, which knows today's thread. Shallow: the
// queue stores `workout`, and IndexedDB can't clone a reactive proxy.
export const agentPrompt = shallowRef<AgentPrompt | null>(null);

import { ref } from 'vue';
import { i18n } from '../i18n';

// The check-in of a workout proposal (§5.9.6). It reaches the agent as an ordinary message in
// today's thread, so it reads well there and works through the offline queue.

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

export function checkinMessage(date: string, answers: CheckinAnswers): string {
  const { t } = i18n.global;
  const pain = [
    ...answers.pain.map((area) => t(`agent.plan.painAreas.${area}`)),
    ...(answers.note.trim() ? [answers.note.trim()] : []),
  ].join(', ');
  return [
    // The exact date, so the model passes it on as it is.
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

// A prompt another page sends through the agent page, which knows today's thread.
export const agentPrompt = ref<string | null>(null);

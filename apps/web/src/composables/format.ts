import type { Exercise, ProgressionHint, WorkoutSet } from '@liftwise/core';
import { useI18n } from 'vue-i18n';
import { dateValue } from '../workout/calendar';

// Shared wording of training data: weights with a decimal comma, sets, days and hints.
export function useFormat() {
  const { t, n, d } = useI18n();

  const kg = (value: number) => n(value, 'kg');

  // Several per-set values read as "11, 11, 10"; equal ones as one.
  const values = (list: number[]) =>
    new Set(list).size === 1 ? String(list[0]) : list.map(String).join(', ');

  return {
    kg,
    // A title: Niedziela, 1 listopada (sentence case).
    day: (date: string) => {
      const text = d(dateValue(date), 'dayLong');
      return text.charAt(0).toLocaleUpperCase('pl') + text.slice(1);
    },
    dayMonth: (date: string) => d(dateValue(date), 'dayMonth'),
    exerciseName: (exercise: Pick<Exercise, 'name_pl'> | undefined) =>
      exercise?.name_pl ?? t('day.unknownExercise'),
    muscles: (exercise: Pick<Exercise, 'primary_muscles'>) =>
      exercise.primary_muscles.map((muscle) => t(`muscles.${muscle}`)).join(', '),
    // "24 kg × 10" or "0 kg × 45 s".
    set: (set: Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_s'>) =>
      set.duration_s === null
        ? t('set.summaryReps', { weight: kg(set.weight_kg), value: set.reps ?? 0 })
        : t('set.summaryTime', { weight: kg(set.weight_kg), value: set.duration_s }),
    // "↑ 22,5 kg × 11, 11, 10", "= 24 kg × 10", "↑ 50, 45 s" at bodyweight: always the load the
    // planned sets get, since applying a hint may change the weight as well.
    hint: (hint: ProgressionHint) => {
      const timed = hint.duration_s !== null;
      const params = {
        weight: kg(hint.weight),
        values: values(hint.reps ?? hint.duration_s ?? []),
      };
      const load =
        hint.weight > 0
          ? t(timed ? 'hint.loadWeightTime' : 'hint.loadWeight', params)
          : t(timed ? 'hint.loadTime' : 'hint.loadReps', params);
      const kind = hint.reason === 'hold' || hint.reason === 'reentry' ? hint.reason : 'up';
      return t(`hint.${kind}`, { load });
    },
  };
}

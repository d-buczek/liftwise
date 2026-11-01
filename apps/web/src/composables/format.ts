import {
  RIR_MAX,
  type Exercise,
  type MovementPattern,
  type MuscleGroup,
  type ProgressionHint,
  type Range,
  type RecordEvent,
  type WorkoutSet,
} from '@liftwise/core';
import { useI18n } from 'vue-i18n';
import { dateValue } from '../workout/calendar';
import type { LoadGroup } from '../workout/logging';

// Shared wording of training data: weights with a decimal comma, sets, days and hints.
export function useFormat() {
  const { t, n, d } = useI18n();

  const kg = (value: number) => n(value, 'kg');

  // "22,5 kg × 11, 11, 10", "11, 11, 10 powt." at bodyweight, "50, 45 s".
  const load = (weight: number, values: number[], timed: boolean) => {
    const params = { weight: kg(weight), values: values.map(String).join(', ') };
    return weight > 0
      ? t(timed ? 'hint.loadWeightTime' : 'hint.loadWeight', params)
      : t(timed ? 'hint.loadTime' : 'hint.loadReps', params);
  };

  // 90 → "1:30".
  const clock = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  // RIR 4 means "4+" (D4).
  const rir = (value: number) => (value === RIR_MAX ? t('set.rirMax') : String(value));

  const sentence = (text: string) => text.charAt(0).toLocaleUpperCase('pl') + text.slice(1);

  return {
    kg,
    // A title: Niedziela, 1 listopada (sentence case).
    day: (date: string) => sentence(d(dateValue(date), 'dayLong')),
    dayMonth: (date: string) => d(dateValue(date), 'dayMonth'),
    // With the year, for anything that may be older: 3 paź 2025.
    date: (date: string) => d(dateValue(date), 'day'),
    // `YYYY-MM` as a heading: Listopad 2026.
    month: (month: string) => sentence(d(dateValue(`${month}-01`), 'month')),
    weekday: (date: string) => d(dateValue(date), 'weekdayShort'),
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
    // Per-set values that are all equal read as one: "↑ 25 kg × 8".
    hint: (hint: ProgressionHint) => {
      const values = hint.reps ?? hint.duration_s ?? [];
      const kind = hint.reason === 'hold' || hint.reason === 'reentry' ? hint.reason : 'up';
      const shown = new Set(values).size === 1 ? values.slice(0, 1) : values;
      return t(`hint.${kind}`, { load: load(hint.weight, shown, hint.duration_s !== null) });
    },
    // A session: "22,5 kg × 10, 10, 9; 20 kg × 12".
    session: (groups: LoadGroup[]) =>
      groups.map((group) => load(group.weight_kg, group.values, group.timed)).join('; '),
    clock,
    rir,
    // Hard sets count halves (§5.8): "12 serii", "2 serie", "1,5 serii" (a fraction takes the
    // genitive, the form of 5).
    hardSets: (value: number) =>
      t('balance.hardSets', { value: n(value, 'e1rm') }, Number.isInteger(value) ? value : 5),
    // Days since the last work (§5.8): "dziś", "wczoraj", "5 dni temu", "nigdy".
    daysSince: (days: number | null) =>
      days === null ? t('balance.never') : t('balance.daysAgo', days),
    // "1–2", or "2" when both bounds are equal.
    rirRange: (range: Range) =>
      range.min === range.max ? rir(range.min) : `${rir(range.min)}–${rir(range.max)}`,
    // An exercise's rest: "1:30", or none.
    rest: (seconds: number) => (seconds > 0 ? clock(seconds) : t('rest.none')),
    // "24 kg × 12", "e1RM 33,6 kg", a timed one at 0 kg "50 s".
    record,
    // "Rekord: 24 kg × 12, e1RM 33,6 kg".
    records: (events: RecordEvent[]) =>
      t('record.toast', { records: events.map(record).join(', ') }),
    // Muscle groups and movement patterns, lower case for lists ("klatka, łydki").
    muscle: (group: MuscleGroup) => t(`muscles.${group}`),
    pattern: (pattern: MovementPattern) => t(`patterns.${pattern}`),
    sentence,
  };

  function record(event: Pick<RecordEvent, 'kind' | 'weight_kg' | 'value'>) {
    return event.kind === 'e1rm'
      ? t('record.e1rm', { value: n(event.value, 'e1rm') })
      : load(event.weight_kg, [event.value], event.kind === 'time');
  }
}

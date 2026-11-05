<script setup lang="ts">
import type { WorkoutLabel } from '@liftwise/core';
import { IonButton, IonIcon } from '@ionic/vue';
import { chevronBack, chevronForward } from 'ionicons/icons';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToday } from '../composables/today';
import { addMonths, dateValue, monthGrid, monthOf, type DayMark } from '../workout/calendar';

// The month view (§5.2): done days are solid tiles, planned-only days outlined, today underlined.
// A labelled day takes its label's color and shows its name under the number (D48).
const props = defineProps<{
  marks: Map<string, DayMark>;
  labels?: Map<string, Pick<WorkoutLabel, 'name' | 'color'>>;
  // Highlighted day, e.g. the copy source.
  selected?: string | null;
  // Days that can't be picked (the copy picker allows only days with sets).
  disabled?: (date: string) => boolean;
}>();
const month = defineModel<string>('month', { required: true });
const emit = defineEmits<{ select: [date: string] }>();

const { t, d } = useI18n();
const now = useToday();
const weeks = computed(() => monthGrid(month.value));
const weekdays = computed(() =>
  (weeks.value[0] ?? []).map((date) => d(dateValue(date), 'weekdayShort')),
);

// Only a day with a workout shows its label.
const labelOf = (date: string) => (props.marks.has(date) ? props.labels?.get(date) : undefined);

function label(date: string): string {
  const mark = props.marks.get(date);
  const name = labelOf(date)?.name;
  const day = d(dateValue(date), 'dayLong');
  if (!mark) return day;
  return [day, t(`calendar.${mark}`), ...(name ? [t('calendar.label', { name })] : [])].join(', ');
}
</script>

<template>
  <section class="lw-month">
    <header class="lw-month__head">
      <h2 class="lw-month__title">{{ d(dateValue(`${month}-01`), 'month') }}</h2>
      <ion-button
        fill="clear"
        :aria-label="t('calendar.previous')"
        @click="month = addMonths(month, -1)"
      >
        <ion-icon slot="icon-only" :icon="chevronBack" aria-hidden="true" />
      </ion-button>
      <ion-button
        fill="clear"
        :aria-label="t('calendar.next')"
        @click="month = addMonths(month, 1)"
      >
        <ion-icon slot="icon-only" :icon="chevronForward" aria-hidden="true" />
      </ion-button>
    </header>

    <div class="lw-month__grid" role="grid">
      <div class="lw-month__row" role="row">
        <span
          v-for="weekday in weekdays"
          :key="weekday"
          class="lw-month__weekday"
          role="columnheader"
        >
          {{ weekday }}
        </span>
      </div>
      <div v-for="week in weeks" :key="week[0]" class="lw-month__row" role="row">
        <button
          v-for="date in week"
          :key="date"
          type="button"
          role="gridcell"
          class="lw-month__day lw-num"
          :class="{
            'is-outside': monthOf(date) !== month,
            'is-today': date === now,
            'is-selected': date === selected,
            [`is-${marks.get(date)}`]: marks.has(date),
            'has-label': labelOf(date),
          }"
          :style="labelOf(date) && { '--lw-mark': `var(--lw-label-${labelOf(date)?.color})` }"
          :disabled="disabled?.(date)"
          :aria-label="label(date)"
          :aria-selected="date === selected || undefined"
          @click="emit('select', date)"
        >
          {{ Number(date.slice(8)) }}
          <span v-if="labelOf(date)" class="lw-month__label" aria-hidden="true">
            {{ labelOf(date)?.name }}
          </span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lw-month__head {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 16px 0 8px;
}

.lw-month__title {
  flex: 1;
  margin: 0;
  font-size: 26px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
}

.lw-month__title::first-letter {
  text-transform: uppercase;
}

.lw-month__grid {
  display: grid;
  gap: 4px;
}

.lw-month__row {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.lw-month__weekday {
  padding-bottom: 4px;
  font-size: 13px;
  color: var(--lw-muted);
  text-align: center;
}

.lw-month__day {
  /* The color of a done tile or a planned outline: the accent, or the day's label. */
  --lw-mark: var(--ion-color-primary);
  position: relative;
  display: grid;
  /* The cell's full width: the label's max-width is a share of this column. */
  grid-template-columns: minmax(0, 1fr);
  place-content: center;
  justify-items: center;
  line-height: 1;
  /* Square where the width allows; on a narrow phone at least 48 px high, never wider than its
     column (the aspect ratio would turn the min-height into a min-width). */
  min-width: 0;
  min-height: 48px;
  aspect-ratio: 1;
  max-height: 72px;
  width: 100%;
  padding: 0;
  font-family: inherit;
  font-size: 20px;
  color: var(--ion-text-color);
  background: transparent;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}

.lw-month__day:hover:not(:disabled) {
  background: var(--ion-background-color-step-50);
}

.lw-month__day.is-outside {
  color: var(--lw-muted);
  opacity: 0.6;
}

/* Planned only: an outline in the accent. */
.lw-month__day.is-planned {
  box-shadow: inset 0 0 0 2px var(--lw-mark);
}

/* Done: a solid tile, like a plate stamped with the day. */
.lw-month__day.is-done {
  color: var(--ion-color-primary-contrast);
  background: var(--lw-mark);
}

.lw-month__day.is-done.has-label {
  color: var(--lw-label-contrast);
}

/* Ionic's shade: 12% black. */
.lw-month__day.is-done:hover {
  background: color-mix(in srgb, var(--lw-mark) 88%, #000);
}

/* The label's name: at most 6 characters fit a phone's cell, very wide letters are clipped. */
.lw-month__label {
  max-width: calc(100% - 4px);
  margin-top: 2px;
  overflow: hidden;
  font-size: 13px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
  white-space: nowrap;
}

.lw-month__day.is-today::after {
  position: absolute;
  bottom: 6px;
  width: 18px;
  height: 3px;
  content: '';
  background: currentColor;
  border-radius: 2px;
}

.lw-month__day.is-today.has-label::after {
  bottom: 3px;
}

.lw-month__day.is-selected {
  outline: 3px solid var(--ion-text-color);
  outline-offset: 1px;
}

.lw-month__day:disabled {
  cursor: default;
  opacity: 0.35;
}
</style>

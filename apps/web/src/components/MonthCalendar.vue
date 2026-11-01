<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue';
import { chevronBack, chevronForward } from 'ionicons/icons';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToday } from '../composables/today';
import { addMonths, dateValue, monthGrid, monthOf, type DayMark } from '../workout/calendar';

// The month view (§5.2): done days are solid tiles, planned-only days outlined, today underlined.
const props = defineProps<{
  marks: Map<string, DayMark>;
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

function label(date: string): string {
  const mark = props.marks.get(date);
  const day = d(dateValue(date), 'dayLong');
  return mark ? `${day}, ${t(`calendar.${mark}`)}` : day;
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
          }"
          :disabled="disabled?.(date)"
          :aria-label="label(date)"
          :aria-selected="date === selected || undefined"
          @click="emit('select', date)"
        >
          {{ Number(date.slice(8)) }}
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
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.lw-month__weekday {
  padding-bottom: 4px;
  font-size: 13px;
  color: var(--lw-muted);
  text-align: center;
}

.lw-month__day {
  position: relative;
  display: grid;
  place-items: center;
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
  box-shadow: inset 0 0 0 2px var(--ion-color-primary);
}

/* Done: a solid tile, like a plate stamped with the day. */
.lw-month__day.is-done {
  color: var(--ion-color-primary-contrast);
  background: var(--ion-color-primary);
}

.lw-month__day.is-done:hover {
  background: var(--ion-color-primary-shade);
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

.lw-month__day.is-selected {
  outline: 3px solid var(--ion-text-color);
  outline-offset: 1px;
}

.lw-month__day:disabled {
  cursor: default;
  opacity: 0.35;
}
</style>

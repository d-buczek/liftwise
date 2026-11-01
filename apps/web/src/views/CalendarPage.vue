<script setup lang="ts">
import { compareLabels } from '@liftwise/core';
import { IonButton, IonItem, IonLabel, IonList, IonNote, useIonRouter } from '@ionic/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppPage from '../components/AppPage.vue';
import LabelChip from '../components/LabelChip.vue';
import MonthCalendar from '../components/MonthCalendar.vue';
import WeekSummary from '../components/WeekSummary.vue';
import { useFormat } from '../composables/format';
import { useLiveQuery } from '../composables/liveQuery';
import { useToday } from '../composables/today';
import { dayLabels, dayMarks, monthGrid, monthOf } from '../workout/calendar';
import { dayData, rangeData, workoutLabels } from '../workout/queries';

// The home screen (§5.2): the month with done and planned days in their labels' colors (D48);
// a tap opens the day; under it the weekly summary (§5.11).
const { t } = useI18n();
const format = useFormat();
const router = useIonRouter();

const now = useToday();
const month = ref(monthOf(now.value));
// At midnight the shown current month moves on with the date.
watch(now, (date, before) => {
  if (month.value === monthOf(before)) month.value = monthOf(date);
});

const view = useLiveQuery(
  async () => {
    const weeks = monthGrid(month.value);
    const { workouts, sets } = await rangeData(weeks[0]?.[0] ?? '', weeks.at(-1)?.[6] ?? '');
    return { marks: dayMarks(workouts, sets), labels: dayLabels(workouts, await workoutLabels()) };
  },
  { marks: new Map(), labels: new Map() },
  month,
);
// The legend: labels of the workouts on the grid, the neighbouring months' days included.
const monthLabels = computed(() => {
  const { marks, labels } = view.value;
  const used = [...labels].filter(([date]) => marks.has(date));
  return [...new Set(used.map(([, label]) => label))].sort(compareLabels);
});

const todaySets = useLiveQuery(async () => (await dayData(now.value)).sets, [], now);
const todayNote = computed(() => {
  if (todaySets.value.length === 0) return t('calendar.restDay');
  const done = todaySets.value.filter((set) => set.status === 'done').length;
  return done > 0
    ? t('calendar.todayDone', { done, total: todaySets.value.length })
    : t('day.sets', todaySets.value.length);
});

function open(date: string) {
  router.push(`/calendar/${date}`);
}
</script>

<template>
  <app-page :title="t('nav.calendar')">
    <template #actions>
      <ion-button v-if="month !== monthOf(now)" @click="month = monthOf(now)">
        {{ t('calendar.today') }}
      </ion-button>
    </template>

    <ion-list class="lw-calendar__today">
      <ion-item button :detail="true" @click="open(now)">
        <ion-label>
          <h2>{{ t('calendar.today') }}</h2>
          <p>{{ format.day(now) }}</p>
        </ion-label>
        <ion-note slot="end">{{ todayNote }}</ion-note>
      </ion-item>
    </ion-list>

    <month-calendar
      v-model:month="month"
      :marks="view.marks"
      :labels="view.labels"
      @select="open"
    />

    <p class="lw-calendar__legend">
      <span class="lw-calendar__key is-done" aria-hidden="true" />{{ t('calendar.done') }}
      <span class="lw-calendar__key is-planned" aria-hidden="true" />{{ t('calendar.planned') }}
    </p>
    <p v-if="monthLabels.length > 0" class="lw-calendar__legend">
      {{ t('calendar.labels') }}
      <label-chip v-for="label in monthLabels" :key="label.id" :label="label" />
    </p>

    <week-summary :month="month" />
  </app-page>
</template>

<style scoped>
.lw-calendar__today {
  margin-top: 16px;
}

.lw-calendar__today h2 {
  font-size: 20px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
}

.lw-calendar__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 16px 0 0;
  font-size: 13px;
  color: var(--lw-muted);
}

.lw-calendar__key {
  width: 14px;
  height: 14px;
  border-radius: 4px;
}

.lw-calendar__key + .lw-calendar__key,
.lw-calendar__key:not(:first-child) {
  margin-left: 8px;
}

.lw-calendar__key.is-done {
  background: var(--ion-color-primary);
}

.lw-calendar__key.is-planned {
  box-shadow: inset 0 0 0 2px var(--ion-color-primary);
}
</style>

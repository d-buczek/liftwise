<script setup lang="ts">
import { balanceSnapshot, DEFAULT_BALANCE_SETTINGS } from '@liftwise/core';
import {
  IonButton,
  IonItem,
  IonLabel,
  IonList,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
} from '@ionic/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppPage from '../components/AppPage.vue';
import BalanceBoard from '../components/BalanceBoard.vue';
import LabelChip from '../components/LabelChip.vue';
import { useFormat } from '../composables/format';
import { useLiveQueryState } from '../composables/liveQuery';
import { useToday } from '../composables/today';
import { dayLabels } from '../workout/calendar';
import {
  byMonth,
  historyDays,
  historyExercises,
  type HistoryDay,
  type HistoryExercise,
} from '../workout/history';
import { loadGroups } from '../workout/logging';
import {
  allWorkouts,
  balanceSettings,
  catalog,
  historySets,
  workoutLabels,
} from '../workout/queries';

// History (§5.4): done workouts by month, newest first, each with its label (D48) and opening
// its day; and the exercises with history, the most recently done first, each opening its
// sessions; and the balance guard (§5.8).
const { t } = useI18n();
const format = useFormat();

const view = ref<'workouts' | 'exercises' | 'balance'>('workouts');
const query = ref('');

const { data, loaded } = useLiveQueryState(
  async () => ({
    sets: await historySets(),
    catalog: await catalog(),
    labels: dayLabels(await allWorkouts(), await workoutLabels()),
    balance: await balanceSettings(),
  }),
  { sets: [], catalog: [], labels: new Map(), balance: DEFAULT_BALANCE_SETTINGS },
);

const exercises = computed(
  () => new Map(data.value.catalog.map((exercise) => [exercise.id, exercise])),
);
const months = computed(() => byMonth(historyDays(data.value.sets)));
const exerciseList = computed(() =>
  historyExercises(data.value.sets, data.value.catalog, query.value),
);

const today = useToday();
const snapshot = computed(() =>
  balanceSnapshot({
    sets: data.value.sets,
    exercises: data.value.catalog,
    balance: data.value.balance,
    today: today.value,
  }),
);

const names = (day: HistoryDay) =>
  day.exerciseIds.map((id) => format.exerciseName(exercises.value.get(id))).join(', ');

const dayLabel = (day: HistoryDay) => {
  const label = data.value.labels.get(day.date);
  const open = t('history.openDay', {
    date: format.day(day.date),
    exercises: names(day),
    sets: t('day.sets', day.sets),
  });
  return label ? `${open}, ${t('calendar.label', { name: label.name })}` : open;
};

const lastLabel = (item: HistoryExercise) => {
  const date = format.dayMonth(item.date);
  return item.sets.length > 0
    ? t('history.lastLoad', { date, load: format.session(loadGroups(item.sets)) })
    : t('history.last', { date });
};
</script>

<template>
  <app-page :title="t('nav.history')">
    <div v-if="loaded && months.length === 0" class="lw-history__empty">
      <p class="lw-history__lead">{{ t('history.empty') }}</p>
      <p class="lw-muted">{{ t('history.emptyHint') }}</p>
      <ion-button fill="outline" router-link="/calendar" router-direction="root">
        {{ t('history.emptyAction') }}
      </ion-button>
    </div>

    <template v-else-if="loaded">
      <ion-segment v-model="view" class="lw-history__view" :aria-label="t('history.view')">
        <ion-segment-button value="workouts">
          <ion-label>{{ t('history.workouts') }}</ion-label>
        </ion-segment-button>
        <ion-segment-button value="exercises">
          <ion-label>{{ t('history.exercises') }}</ion-label>
        </ion-segment-button>
        <ion-segment-button value="balance">
          <ion-label>{{ t('history.balance') }}</ion-label>
        </ion-segment-button>
      </ion-segment>

      <template v-if="view === 'workouts'">
        <section v-for="group in months" :key="group.month">
          <h2 class="lw-heading">{{ format.month(group.month) }}</h2>
          <ion-list>
            <ion-item
              v-for="day in group.items"
              :key="day.date"
              :router-link="`/history/${day.date}`"
              :aria-label="dayLabel(day)"
            >
              <div slot="start" class="lw-leaf" aria-hidden="true">
                <span class="lw-leaf__day lw-num">{{ Number(day.date.slice(8)) }}</span>
                <span class="lw-leaf__weekday">{{ format.weekday(day.date) }}</span>
              </div>
              <ion-label>
                <h3 class="lw-history__names">{{ names(day) }}</h3>
                <p>{{ t('day.sets', day.sets) }}</p>
              </ion-label>
              <label-chip
                v-if="data.labels.has(day.date)"
                slot="end"
                :label="data.labels.get(day.date)!"
                aria-hidden="true"
              />
            </ion-item>
          </ion-list>
        </section>
      </template>

      <balance-board v-else-if="view === 'balance'" :snapshot="snapshot" />

      <template v-else>
        <ion-searchbar
          v-model="query"
          class="lw-history__search"
          :placeholder="t('picker.search')"
          :debounce="100"
        />
        <ion-list v-if="exerciseList.length > 0">
          <ion-item
            v-for="item in exerciseList"
            :key="item.exercise.id"
            :router-link="`/history/exercise/${item.exercise.id}`"
          >
            <ion-label>
              <h3>{{ item.exercise.name_pl }}</h3>
              <p>{{ lastLabel(item) }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
        <p v-else class="lw-muted lw-history__none">{{ t('history.noMatch', { query }) }}</p>
      </template>
    </template>
  </app-page>
</template>

<style scoped>
.lw-history__view {
  margin-top: 16px;
}

.lw-history__search {
  --box-shadow: none;
  margin-top: 16px;
  padding: 0 0 8px;
}

/* A calendar leaf: the day of the month in plate numerals over its weekday. */
.lw-leaf {
  display: grid;
  justify-items: center;
  width: 44px;
  margin-inline-end: 12px;
  line-height: 1;
}

.lw-leaf__day {
  font-size: 31px;
}

.lw-leaf__weekday {
  margin-top: 2px;
  font-size: 13px;
  color: var(--lw-muted);
}

h3 {
  font-size: 16px;
  font-weight: 600;
}

.lw-history__names {
  display: -webkit-box;
  overflow: hidden;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.lw-history__none {
  padding-top: 8px;
}

.lw-history__empty {
  max-width: 48ch;
  padding-top: 40px;
}

.lw-history__lead {
  margin: 0 0 4px;
  font-size: 27px;
  font-family: var(--lw-font-display);
  font-weight: 800;
}
</style>

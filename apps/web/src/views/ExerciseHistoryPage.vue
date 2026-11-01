<script setup lang="ts">
import { bestE1rm, exerciseProgress, recordSets, recordTable } from '@liftwise/core';
import { IonIcon, IonItem, IonLabel, IonList, IonNote, useIonRouter } from '@ionic/vue';
import { chevronForward } from 'ionicons/icons';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppPage from '../components/AppPage.vue';
import ChoiceChips from '../components/ChoiceChips.vue';
import ProgressChart from '../components/ProgressChart.vue';
import { useFormat } from '../composables/format';
import { useLiveQueryState } from '../composables/liveQuery';
import { useToday } from '../composables/today';
import {
  CHART_RANGES,
  chartMetrics,
  metricSeries,
  type ChartMetric,
  type ChartRange,
} from '../workout/charts';
import { exerciseLog } from '../workout/history';
import { exercise, historySets } from '../workout/queries';

// One exercise's history (§5.4): a chart of its progress per day, its records (the best e1RM,
// the most reps or the longest hold per weight), then its sessions newest first, every done set
// with its RIR, warm-ups marked and the sets that set a record in amber; a session opens its day.
const props = defineProps<{ id: string }>();

const { t, n } = useI18n();
const format = useFormat();
const router = useIonRouter();

const { data, loaded } = useLiveQueryState(
  async () => ({ exercise: await exercise(props.id), sets: await historySets([props.id]) }),
  { exercise: undefined, sets: [] },
  () => props.id,
);

const records = computed(() => {
  const found = data.value.exercise;
  return new Set(found ? recordSets(data.value.sets, [found]).map((event) => event.set_id) : []);
});

const today = useToday();
const progress = computed(() =>
  data.value.exercise ? exerciseProgress(data.value.sets, data.value.exercise) : [],
);
const metrics = computed(() =>
  data.value.exercise ? chartMetrics(data.value.exercise, progress.value) : [],
);
const metric = ref<ChartMetric>('weight');
watch(metrics, (options) => {
  if (!options.includes(metric.value)) metric.value = options[0] ?? 'weight';
});
const range = ref<ChartRange>('1y');
const series = computed(() => metricSeries(progress.value, metric.value, range.value, today.value));
const metricOptions = computed(() =>
  metrics.value.map((value) => ({ value, label: t(`charts.metrics.${value}`) })),
);
const rangeOptions = CHART_RANGES.map((value) => ({ value, label: t(`charts.ranges.${value}`) }));
const formatValue = (value: number) =>
  ({
    weight: () => t('charts.kg', { value: format.kg(value) }),
    e1rm: () => t('charts.kg', { value: n(value, 'e1rm') }),
    volume: () => t('charts.kg', { value: n(Math.round(value)) }),
    reps: () => t('charts.reps', { value }),
    duration: () => t('charts.seconds', { value }),
  })[metric.value]();

const timed = computed(() => data.value.exercise?.measure === 'time');
// The heaviest record first.
const recordRows = computed(() =>
  data.value.exercise ? recordTable(data.value.sets, data.value.exercise).reverse() : [],
);
const best = computed(() =>
  data.value.exercise ? bestE1rm(data.value.sets, data.value.exercise) : null,
);
// "24 kg × 10, 3 paź 2026": the set behind the best e1RM.
const bestNote = computed(() => {
  const set = data.value.sets.find((row) => row.id === best.value?.set_id);
  return set ? `${format.set(set)}, ${format.date(set.date)}` : '';
});
const chartTitle = computed(() => t(`charts.titles.${metric.value}`));

// Working sets are numbered; warm-ups carry their tag instead.
const sessions = computed(() =>
  exerciseLog(data.value.sets, props.id).map((session) => {
    let working = 0;
    return {
      date: session.date,
      sets: session.sets.map((set) => ({
        set,
        label: set.warmup ? t('day.warmupShort') : String(++working),
      })),
    };
  }),
);
</script>

<template>
  <app-page :title="t('history.exerciseTitle')" back-href="/history">
    <header v-if="loaded" class="lw-exercise">
      <h1 class="lw-exercise__name">{{ format.exerciseName(data.exercise) }}</h1>
      <p class="lw-muted">
        {{ sessions.length > 0 ? t('history.sessions', sessions.length) : t('history.noSessions') }}
      </p>
    </header>

    <template v-if="progress.length > 0">
      <h2 class="lw-heading">{{ chartTitle }}</h2>
      <div class="lw-progress__filters">
        <choice-chips
          v-if="metricOptions.length > 1"
          v-model="metric"
          compact
          :label="t('charts.metric')"
          :options="metricOptions"
        />
        <choice-chips v-model="range" compact :label="t('charts.range')" :options="rangeOptions" />
      </div>
      <div class="lw-progress">
        <progress-chart
          v-if="series.length > 0"
          :points="series"
          :label="chartTitle"
          :format="formatValue"
          :whole="metric !== 'weight' && metric !== 'e1rm'"
        />
        <p v-else class="lw-muted lw-progress__empty">{{ t('charts.emptyRange') }}</p>
      </div>

      <h2 class="lw-heading">{{ t('records.title') }}</h2>
      <ion-list>
        <ion-item v-if="best" :router-link="`/history/${best.date}`">
          <ion-label>
            <h3>{{ t('records.bestE1rm') }}</h3>
            <p>{{ bestNote }}</p>
          </ion-label>
          <span slot="end" class="lw-record__best lw-num">
            {{ t('charts.kg', { value: n(best.value, 'e1rm') }) }}
          </span>
        </ion-item>
        <ion-item v-for="row in recordRows" :key="row.set_id" :router-link="`/history/${row.date}`">
          <ion-label class="lw-record__load lw-num">
            {{
              format.set({
                weight_kg: row.weight_kg,
                reps: timed ? null : row.value,
                duration_s: timed ? row.value : null,
              })
            }}
          </ion-label>
          <ion-note slot="end">{{ format.date(row.date) }}</ion-note>
        </ion-item>
      </ion-list>
      <p class="lw-records__hint">{{ timed ? t('records.timeHint') : t('records.repsHint') }}</p>

      <h2 class="lw-heading">{{ t('history.sessionsTitle') }}</h2>
    </template>

    <div v-if="sessions.length > 0" class="lw-sessions">
      <article v-for="session in sessions" :key="session.date" class="lw-session">
        <h2 class="lw-session__head">
          <button
            type="button"
            class="lw-session__open"
            :aria-label="t('history.openSession', { date: format.day(session.date) })"
            @click="router.push(`/history/${session.date}`)"
          >
            {{ format.day(session.date) }}
          </button>
          <ion-icon class="lw-session__chevron" :icon="chevronForward" aria-hidden="true" />
        </h2>
        <ol class="lw-session__sets">
          <li
            v-for="row in session.sets"
            :key="row.set.id"
            class="lw-session__set"
            :class="{ 'is-warmup': row.set.warmup }"
          >
            <span class="lw-session__label">{{ row.label }}</span>
            <span class="lw-session__load lw-num">{{ format.set(row.set) }}</span>
            <span v-if="records.has(row.set.id)" class="lw-session__record">
              {{ t('history.record') }}
            </span>
            <span v-if="row.set.rir !== null" class="lw-session__rir">
              {{ t('workout.rir', { value: format.rir(row.set.rir) }) }}
            </span>
          </li>
        </ol>
      </article>
    </div>
  </app-page>
</template>

<style scoped>
.lw-exercise {
  padding-top: 16px;
}

.lw-exercise__name {
  margin: 0;
  font-size: 26px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
  line-height: 1.15;
}

.lw-exercise p {
  margin: 4px 0 0;
}

.lw-progress__filters {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.lw-progress {
  padding: 12px 16px 8px;
  background: var(--lw-surface);
  border: 1px solid var(--lw-border);
  border-radius: 12px;
}

.lw-progress__empty {
  margin: 16px 0;
}

.lw-record__best {
  font-size: 26px;
}

.lw-record__load {
  font-size: 20px;
}

.lw-records__hint {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-sessions {
  margin-top: 16px;
  overflow: hidden;
  background: var(--lw-surface);
  border: 1px solid var(--lw-border);
  border-radius: 12px;
}

/* The whole session opens its day: the date button stretches over the block. */
.lw-session {
  position: relative;
  padding: 12px 16px 14px;
}

.lw-session + .lw-session {
  border-top: 1px solid var(--lw-border);
}

.lw-session:has(.lw-session__open:hover) {
  background: var(--ion-background-color-step-50);
}

.lw-session__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.lw-session__open {
  flex: 1;
  min-height: 32px;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  background: none;
  border: 0;
  cursor: pointer;
}

.lw-session__open::after {
  position: absolute;
  inset: 0;
  content: '';
}

.lw-session__chevron {
  font-size: 18px;
  color: var(--lw-muted);
}

.lw-session__sets {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.lw-session__set {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-height: 32px;
}

.lw-session__label {
  flex: 0 0 48px;
  font-size: 14px;
  color: var(--lw-muted);
  font-variant-numeric: tabular-nums;
}

.lw-session__load {
  font-size: 20px;
}

.lw-session__set.is-warmup .lw-session__load {
  font-size: 16px;
  color: var(--lw-muted);
}

.lw-session__record {
  padding: 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ion-color-warning-contrast);
  background: var(--ion-color-warning);
  border-radius: 10px;
}

.lw-session__rir {
  margin-left: auto;
  font-size: 14px;
  color: var(--lw-muted);
}
</style>

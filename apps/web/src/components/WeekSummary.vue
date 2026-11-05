<script setup lang="ts">
import {
  addDays,
  DEFAULT_BALANCE_SETTINGS,
  DEFAULT_TRAINING_SETTINGS,
  weekOf,
  weeklySummary,
} from '@liftwise/core';
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { chevronBack, chevronForward } from 'ionicons/icons';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/format';
import { useLiveQueryState } from '../composables/liveQuery';
import { useToday } from '../composables/today';
import { dateValue, summaryWeek } from '../workout/calendar';
import { standingRecords } from '../workout/history';
import { balanceSettings, catalog, historySets, trainingSettings } from '../workout/queries';
import BalanceMeter from './BalanceMeter.vue';

// The weekly summary card under the calendar (§5.11, D34): the shown month's week (this week in
// the current month, else the month's last), stepped with ‹ ›. Workouts, working sets, the week's
// records, stalled exercises and what got no set; the hard sets per muscle group in a sheet.
const props = defineProps<{ month: string }>();

const { t, d } = useI18n();
const format = useFormat();
const today = useToday();

const start = ref(summaryWeek(props.month, today.value));
watch(
  () => props.month,
  (month) => (start.value = summaryWeek(month, today.value)),
);
const latest = computed(() => weekOf(today.value).start);
const step = (weeks: number) => (start.value = addDays(start.value, 7 * weeks));

const { data, loaded } = useLiveQueryState(
  async () => ({
    sets: await historySets(),
    catalog: await catalog(),
    training: await trainingSettings(),
    balance: await balanceSettings(),
  }),
  {
    sets: [],
    catalog: [],
    training: DEFAULT_TRAINING_SETTINGS,
    balance: DEFAULT_BALANCE_SETTINGS,
  },
);

const summary = computed(() =>
  weeklySummary({
    date: start.value,
    sets: data.value.sets,
    exercises: data.value.catalog,
    training: data.value.training,
    balance: data.value.balance,
  }),
);
const names = computed(() => new Map(data.value.catalog.map((row) => [row.id, row])));
const name = (id: string) => format.exerciseName(names.value.get(id));

// One row per exercise: "Wyciskanie hantli: 24 kg × 12, e1RM 33,6 kg".
const records = computed(() =>
  standingRecords(summary.value.records).map((events) => ({
    id: events[0]?.exercise_id ?? '',
    name: name(events[0]?.exercise_id ?? ''),
    value: events.map(format.record).join(', '),
  })),
);
const neglected = computed(() => ({
  muscles: summary.value.neglected.muscles.map(format.muscle).join(', '),
  patterns: summary.value.neglected.patterns.map(format.pattern).join(', '),
}));

const span = computed(() =>
  t('week.span', {
    start: d(dateValue(summary.value.start), 'dayShort'),
    end: d(dateValue(summary.value.end), 'dayShort'),
  }),
);
const title = computed(() =>
  t(start.value === latest.value ? 'week.thisWeek' : 'week.title', { span: span.value }),
);

const musclesOpen = ref(false);
const scale = computed(
  () => Math.max(...summary.value.muscles.map((m) => Math.max(m.target.max, m.hardSets)), 1) * 1.25,
);
</script>

<template>
  <section class="lw-week" :aria-label="t('week.label', { span })">
    <header class="lw-week__head">
      <h2 class="lw-week__title">{{ title }}</h2>
      <ion-button fill="clear" :aria-label="t('week.previous')" @click="step(-1)">
        <ion-icon slot="icon-only" :icon="chevronBack" aria-hidden="true" />
      </ion-button>
      <ion-button
        fill="clear"
        :disabled="start >= latest"
        :aria-label="t('week.next')"
        @click="step(1)"
      >
        <ion-icon slot="icon-only" :icon="chevronForward" aria-hidden="true" />
      </ion-button>
    </header>

    <p v-if="loaded && summary.workouts === 0" class="lw-week__empty">{{ t('week.empty') }}</p>
    <template v-else-if="loaded">
      <dl class="lw-week__stats">
        <div>
          <dt>{{ t('week.workouts') }}</dt>
          <dd class="lw-num">{{ summary.workouts }}</dd>
        </div>
        <div>
          <dt>{{ t('week.sets') }}</dt>
          <dd class="lw-num">{{ summary.sets }}</dd>
        </div>
        <div>
          <dt>{{ t('week.records') }}</dt>
          <dd class="lw-num">{{ records.length }}</dd>
        </div>
      </dl>

      <div v-if="records.length > 0" class="lw-week__group">
        <h3>{{ t('week.records') }}</h3>
        <ul class="lw-week__records">
          <li v-for="record in records" :key="record.id">
            <span class="lw-week__marker" aria-hidden="true" />
            <span>
              {{ record.name }}
              <span class="lw-week__value lw-fig">{{ record.value }}</span>
            </span>
          </li>
        </ul>
      </div>

      <div v-if="summary.stalled.length > 0" class="lw-week__group">
        <h3>{{ t('week.stalled') }}</h3>
        <p>{{ summary.stalled.map(name).join(', ') }}</p>
        <p class="lw-week__hint">{{ t('week.stalledHint') }}</p>
      </div>

      <div v-if="neglected.muscles || neglected.patterns" class="lw-week__group">
        <h3>{{ t('week.neglected') }}</h3>
        <p v-if="neglected.muscles">
          {{ t('week.neglectedMuscles', { list: neglected.muscles }) }}
        </p>
        <p v-if="neglected.patterns">
          {{ t('week.neglectedPatterns', { list: neglected.patterns }) }}
        </p>
      </div>

      <ion-button class="lw-week__open" fill="outline" @click="musclesOpen = true">
        {{ t('week.muscles') }}
      </ion-button>
    </template>

    <ion-modal
      :is-open="musclesOpen"
      :initial-breakpoint="1"
      :breakpoints="[0, 1]"
      class="lw-sheet"
      @did-dismiss="musclesOpen = false"
    >
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ t('week.muscles') }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="musclesOpen = false">{{ t('common.close') }}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <div class="lw-sheet__body">
        <div class="lw-column">
          <p class="lw-week__hint">{{ t('week.musclesHint', { span }) }}</p>
          <ion-list>
            <ion-item v-for="muscle in summary.muscles" :key="muscle.group">
              <ion-label class="lw-week__muscle">
                <span>{{ format.sentence(format.muscle(muscle.group)) }}</span>
                <balance-meter :muscle="muscle" :scale="scale" />
              </ion-label>
            </ion-item>
          </ion-list>
        </div>
      </div>
    </ion-modal>
  </section>
</template>

<style scoped>
.lw-week {
  margin-top: 24px;
  padding: 8px 16px 16px;
  background: var(--lw-surface);
  border: 1px solid var(--lw-border);
  border-radius: 12px;
}

.lw-week__head {
  display: flex;
  align-items: center;
  gap: 4px;
}

.lw-week__title {
  flex: 1;
  margin: 0;
  font-size: 27px;
  font-family: var(--lw-font-display);
  font-weight: 800;
}

.lw-week__head ion-button {
  --padding-start: 8px;
  --padding-end: 8px;
  width: 44px;
  height: 44px;
  margin: 0;
}

.lw-week__empty {
  margin: 4px 0 0;
  color: var(--lw-muted);
}

.lw-week__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin: 8px 0 0;
}

.lw-week__stats dt {
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-week__stats dd {
  margin: 0;
  font-size: 52px;
  font-variant-numeric: normal;
  line-height: 1.1;
}

.lw-week__group {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--lw-border);
}

.lw-week__group h3 {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--lw-muted);
}

.lw-week__group p {
  margin: 0;
}

.lw-week__records {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lw-week__records li {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

/* Records are the one place for the signal color (§5.13). */
.lw-week__marker {
  flex: none;
  width: 8px;
  height: 8px;
  background: var(--ion-color-warning);
  border-radius: 50%;
  transform: translateY(-1px);
}

.lw-week__value {
  margin-left: 4px;
}

.lw-week__hint {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-week__group .lw-week__hint {
  margin-top: 2px;
}

.lw-week__open {
  --border-radius: 12px;
  min-height: 44px;
  margin: 16px 0 0;
}

.lw-week__muscle {
  display: grid;
  gap: 8px;
  padding-block: 4px;
}

.lw-column > .lw-week__hint {
  margin: 0 0 12px;
}
</style>

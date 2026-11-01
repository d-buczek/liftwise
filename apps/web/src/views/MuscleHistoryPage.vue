<script setup lang="ts">
import {
  addDays,
  balanceSnapshot,
  DEFAULT_BALANCE_SETTINGS,
  weeklyHardSets,
  type MuscleGroup,
} from '@liftwise/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppPage from '../components/AppPage.vue';
import BalanceMeter from '../components/BalanceMeter.vue';
import WeekBars from '../components/WeekBars.vue';
import { useFormat } from '../composables/format';
import { useLiveQueryState } from '../composables/liveQuery';
import { useToday } from '../composables/today';
import { balanceSettings, catalog, historySets } from '../workout/queries';

// One muscle group of the balance guard (§5.4, §5.8): its last 7 days against the target, then
// its hard sets per week over the last 12 weeks.
const props = defineProps<{ group: MuscleGroup }>();

const WEEKS = 12;

const { t } = useI18n();
const format = useFormat();
const today = useToday();

const { data, loaded } = useLiveQueryState(
  async () => ({
    sets: await historySets(),
    catalog: await catalog(),
    balance: await balanceSettings(),
  }),
  { sets: [], catalog: [], balance: DEFAULT_BALANCE_SETTINGS },
);

const muscle = computed(() =>
  balanceSnapshot({
    sets: data.value.sets,
    exercises: data.value.catalog,
    balance: data.value.balance,
    today: today.value,
  }).muscles.find((row) => row.group === props.group),
);
const weeks = computed(() =>
  weeklyHardSets(
    data.value.sets,
    data.value.catalog,
    props.group,
    addDays(today.value, -7 * (WEEKS - 1)),
    today.value,
  ),
);
const name = computed(() => format.sentence(format.muscle(props.group)));
</script>

<template>
  <app-page :title="t('balance.muscleTitle')" back-href="/history">
    <template v-if="loaded && muscle">
      <header class="lw-muscle">
        <h1 class="lw-muscle__name">{{ name }}</h1>
        <p class="lw-muted">
          {{ t('balance.lastWork', { since: format.daysSince(muscle.daysSince) }) }}
        </p>
      </header>

      <h2 class="lw-heading">{{ t('balance.lastWeek') }}</h2>
      <div class="lw-muscle__block">
        <balance-meter
          :muscle="muscle"
          :scale="Math.max(muscle.target.max, muscle.hardSets) * 1.25"
        />
      </div>

      <h2 class="lw-heading">{{ t('balance.weekly', { weeks: WEEKS }) }}</h2>
      <div class="lw-muscle__block">
        <week-bars
          :weeks="weeks"
          :target="muscle.target"
          :label="t('balance.weeklyLabel', { name, weeks: WEEKS })"
        />
      </div>
    </template>
  </app-page>
</template>

<style scoped>
.lw-muscle {
  padding-top: 16px;
}

.lw-muscle__name {
  margin: 0;
  font-size: 26px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
  line-height: 1.15;
}

.lw-muscle p {
  margin: 4px 0 0;
}

.lw-muscle__block {
  padding: 16px;
  background: var(--lw-surface);
  border: 1px solid var(--lw-border);
  border-radius: 12px;
}
</style>

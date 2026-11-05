<script setup lang="ts">
import type { MuscleTarget } from '@liftwise/core';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/format';

// A muscle group's hard sets against its target range (§5.8): a track with the range as a band
// and the sets as a bar, the count in plate numerals. Rows share `scale`, so bars compare.
const props = defineProps<{ muscle: MuscleTarget; scale: number }>();

const { t } = useI18n();
const format = useFormat();

const percent = (value: number) => `${Math.min(100, (value / props.scale) * 100)}%`;
const band = computed(() => ({
  left: percent(props.muscle.target.min),
  width: `calc(${percent(props.muscle.target.max)} - ${percent(props.muscle.target.min)})`,
}));
const label = computed(() =>
  t('balance.meter', {
    sets: format.hardSets(props.muscle.hardSets),
    min: props.muscle.target.min,
    max: props.muscle.target.max,
    status: t(`balance.status.${props.muscle.status}`),
  }),
);
</script>

<template>
  <div class="lw-meter" :class="`is-${muscle.status}`" role="img" :aria-label="label">
    <div class="lw-meter__track" aria-hidden="true">
      <span class="lw-meter__band" :style="band" />
      <span class="lw-meter__bar" :style="{ width: percent(muscle.hardSets) }" />
    </div>
    <span class="lw-meter__count" aria-hidden="true">
      <span class="lw-num">{{ $n(muscle.hardSets, 'e1rm') }}</span>
      <small>/ {{ muscle.target.min }}–{{ muscle.target.max }}</small>
    </span>
  </div>
</template>

<style scoped>
.lw-meter {
  display: grid;
  grid-template-columns: 1fr 92px;
  align-items: center;
  gap: 12px;
}

.lw-meter__track {
  position: relative;
  height: 12px;
  overflow: hidden;
  background: var(--ion-background-color-step-100);
  border-radius: 6px;
}

/* The target range: the bar should end inside it. */
.lw-meter__band {
  position: absolute;
  inset-block: 0;
  background: var(--lw-range);
}

.lw-meter__bar {
  position: absolute;
  inset-block: 3px;
  left: 0;
  min-width: 0;
  background: var(--ion-color-primary);
  border-radius: 0 3px 3px 0;
}

/* Below the range is the quiet case (a week in progress); above it is a warning. */
.lw-meter.is-under .lw-meter__bar {
  background: var(--lw-muted);
}

.lw-meter.is-over .lw-meter__bar {
  background: var(--ion-color-warning);
}

.lw-meter__count {
  font-size: 27px;
  line-height: 1;
  text-align: right;
  white-space: nowrap;
}

.lw-meter__count small {
  margin-left: 2px;
  font-size: 13px;
  color: var(--lw-muted);
}
</style>

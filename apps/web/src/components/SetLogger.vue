<script setup lang="ts">
import { WEIGHT_PRECISION_KG } from '@liftwise/core';
import { IonButton, IonToggle } from '@ionic/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/format';
import { parseWeightKg, stepValue, stepWeight } from '../workout/day';
import type { Draft } from '../workout/logging';
import NumberStepper from './NumberStepper.vue';
import RirChips from './RirChips.vue';

// The next set before it is confirmed (§5.2): weight (± or typed) and reps (seconds) in large
// numerals with ± on both sides, RIR, warm-up, and one large button that logs it.
defineProps<{ title: string; stepKg: number; repeat: boolean }>();
const draft = defineModel<Draft>({ required: true });
const emit = defineEmits<{ done: [] }>();

const { t } = useI18n();
const format = useFormat();
const timed = computed(() => draft.value.duration_s !== null);
const weightInvalid = ref(false);

// A disabled ion-button stops clicks only from its next render, and a tap right after the last
// keystroke would log the old weight.
function done() {
  if (!weightInvalid.value) emit('done');
}

function stepAmount(direction: 1 | -1) {
  const set = draft.value;
  draft.value = timed.value
    ? { ...set, duration_s: stepValue('time', set.duration_s ?? 0, direction) }
    : { ...set, reps: stepValue('reps', set.reps ?? 0, direction) };
}
</script>

<template>
  <section class="lw-logger" :aria-label="title">
    <h3 class="lw-logger__title">{{ title }}</h3>
    <div class="lw-logger__steppers">
      <number-stepper
        v-model:invalid="weightInvalid"
        size="lg"
        :label="t('set.weight')"
        :value="format.kg(draft.weight_kg)"
        :unit="t('set.kg')"
        :parse="parseWeightKg"
        :invalid-text="t('set.weightInvalid', { step: format.kg(WEIGHT_PRECISION_KG) })"
        @step="
          (direction) =>
            (draft = { ...draft, weight_kg: stepWeight(draft.weight_kg, stepKg, direction) })
        "
        @enter="(weight_kg) => (draft = { ...draft, weight_kg })"
      />
      <number-stepper
        size="lg"
        :label="timed ? t('set.duration') : t('set.reps')"
        :value="String(timed ? draft.duration_s : draft.reps)"
        :unit="timed ? t('set.seconds') : t('set.repsUnit')"
        @step="stepAmount"
      />
    </div>
    <rir-chips
      :model-value="draft.rir"
      @update:model-value="(rir) => (draft = { ...draft, rir })"
    />
    <ion-toggle
      :checked="draft.warmup"
      class="lw-logger__toggle"
      @ion-change="draft = { ...draft, warmup: $event.detail.checked }"
    >
      {{ t('set.warmup') }}
    </ion-toggle>
    <ion-button expand="block" class="lw-logger__done" :disabled="weightInvalid" @click="done">
      {{ repeat ? t('workout.repeat') : t('workout.done') }}
    </ion-button>
  </section>
</template>

<style scoped>
.lw-logger {
  display: grid;
  gap: 10px;
}

.lw-logger__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--lw-muted);
}

.lw-logger__steppers {
  display: grid;
  gap: 10px;
}

/* Side by side where the column has room for the large numerals. */
@media (min-width: 768px) {
  .lw-logger__steppers {
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
}

.lw-logger__toggle {
  min-height: 48px;
}

.lw-logger__done {
  --background: var(--lw-action-background);
  --border-radius: 12px;
  --box-shadow: var(--lw-action-shadow);
  height: 60px;
  margin: 0;
  font-size: 31px;
  font-family: var(--lw-font-display);
  font-weight: 800;
}
</style>

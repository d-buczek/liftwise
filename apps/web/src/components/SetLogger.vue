<script setup lang="ts">
import { IonButton, IonToggle } from '@ionic/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/format';
import { stepValue, stepWeight } from '../workout/day';
import type { Draft } from '../workout/logging';
import NumberStepper from './NumberStepper.vue';
import RirChips from './RirChips.vue';

// The next set before it is confirmed (§5.2): weight and reps (seconds) in large numerals with
// ± on both sides, RIR, warm-up, and one large button that logs it.
defineProps<{ title: string; stepKg: number; repeat: boolean }>();
const draft = defineModel<Draft>({ required: true });
const emit = defineEmits<{ done: [] }>();

const { t } = useI18n();
const format = useFormat();
const timed = computed(() => draft.value.duration_s !== null);

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
        size="lg"
        :label="t('set.weight')"
        :value="format.kg(draft.weight_kg)"
        :unit="t('set.kg')"
        @step="
          (direction) =>
            (draft = { ...draft, weight_kg: stepWeight(draft.weight_kg, stepKg, direction) })
        "
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
    <ion-button expand="block" class="lw-logger__done" @click="emit('done')">
      {{ repeat ? t('workout.repeat') : t('workout.done') }}
    </ion-button>
  </section>
</template>

<style scoped>
.lw-logger {
  display: grid;
  gap: 16px;
}

.lw-logger__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--lw-muted);
}

.lw-logger__steppers {
  display: grid;
  gap: 12px;
}

/* Side by side where the column has room. */
@media (min-width: 576px) {
  .lw-logger__steppers {
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
}

.lw-logger__toggle {
  min-height: 48px;
}

.lw-logger__done {
  --border-radius: 14px;
  height: 64px;
  margin: 4px 0 0;
  font-size: 20px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
}
</style>

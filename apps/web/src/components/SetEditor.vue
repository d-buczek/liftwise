<script setup lang="ts">
import type { Exercise, WorkoutSet } from '@liftwise/core';
import { IonButton, IonButtons, IonHeader, IonTitle, IonToggle, IonToolbar } from '@ionic/vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/format';
import { stepValue, stepWeight } from '../workout/day';
import NumberStepper from './NumberStepper.vue';
import RirChips from './RirChips.vue';

// One set with the ± controls (§5.2); a done set also gets its RIR.
const props = defineProps<{ set: WorkoutSet; exercise: Exercise | undefined; stepKg: number }>();
const emit = defineEmits<{ save: [set: WorkoutSet]; remove: [set: WorkoutSet]; close: [] }>();

const { t } = useI18n();
const format = useFormat();
const draft = ref<WorkoutSet>({ ...props.set });
const timed = props.set.duration_s !== null;

function stepAmount(direction: 1 | -1) {
  const set = draft.value;
  if (timed) set.duration_s = stepValue('time', set.duration_s ?? 0, direction);
  else set.reps = stepValue('reps', set.reps ?? 0, direction);
}
</script>

<template>
  <ion-header>
    <ion-toolbar>
      <ion-title>{{ format.exerciseName(exercise) }}</ion-title>
      <ion-buttons slot="end">
        <ion-button @click="emit('close')">{{ t('common.cancel') }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
  <div class="lw-sheet__body">
    <div class="lw-column lw-set-editor">
      <number-stepper
        :label="t('set.weight')"
        :value="format.kg(draft.weight_kg)"
        :unit="t('set.kg')"
        @step="(direction) => (draft.weight_kg = stepWeight(draft.weight_kg, stepKg, direction))"
      />
      <number-stepper
        :label="timed ? t('set.duration') : t('set.reps')"
        :value="String(timed ? draft.duration_s : draft.reps)"
        :unit="timed ? t('set.seconds') : t('set.repsUnit')"
        @step="stepAmount"
      />
      <rir-chips v-if="draft.status === 'done'" v-model="draft.rir" />
      <ion-toggle v-model="draft.warmup" class="lw-set-editor__toggle">
        {{ t('set.warmup') }}
      </ion-toggle>
      <div class="lw-set-editor__actions">
        <ion-button fill="clear" color="danger" @click="emit('remove', set)">
          {{ t('common.delete') }}
        </ion-button>
        <ion-button class="lw-set-editor__save" @click="emit('save', draft)">
          {{ t('common.save') }}
        </ion-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lw-set-editor {
  display: grid;
  gap: 20px;
  padding-top: 16px;
}

.lw-set-editor__toggle {
  min-height: 48px;
}

.lw-set-editor__actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.lw-set-editor__save {
  flex: 1;
  max-width: 240px;
  height: 48px;
}
</style>

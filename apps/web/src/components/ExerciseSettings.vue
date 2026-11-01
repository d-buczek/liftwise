<script setup lang="ts">
import type { Exercise, TrainingSettings } from '@liftwise/core';
import { IonButton, IonButtons, IonHeader, IonTextarea, IonTitle, IonToolbar } from '@ionic/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/format';
import { stepRest, weightStepOptions } from '../workout/settings';
import ChoiceChips from './ChoiceChips.vue';
import NumberStepper from './NumberStepper.vue';

// The exercise's own settings from its card (§5.2): the setup note shown in every workout, the
// ± weight step (or the default) and the rest after a set.
const props = defineProps<{ exercise: Exercise; training: TrainingSettings }>();
const emit = defineEmits<{ save: [exercise: Exercise]; close: [] }>();

const { t } = useI18n();
const format = useFormat();
const note = ref(props.exercise.note ?? '');
const step = ref(props.exercise.weight_step_kg);
const rest = ref(props.exercise.rest_seconds);

const steps = computed(() => [
  {
    value: null,
    label: `${t('exercise.stepDefault')} (${format.kg(props.training.weight_step_kg)})`,
  },
  ...weightStepOptions(props.exercise.weight_step_kg).map((value) => ({
    value,
    label: format.kg(value),
  })),
]);

function save() {
  emit('save', {
    ...props.exercise,
    note: note.value.trim() || null,
    weight_step_kg: step.value,
    rest_seconds: rest.value,
  });
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
    <div class="lw-column lw-exercise-settings">
      <ion-textarea
        v-model="note"
        :label="t('exercise.note')"
        label-placement="stacked"
        fill="outline"
        :placeholder="t('exercise.notePlaceholder')"
        :auto-grow="true"
        :rows="1"
        :maxlength="200"
      />
      <choice-chips v-model="step" :label="t('exercise.step')" :options="steps" />
      <number-stepper
        :label="t('exercise.rest')"
        :value="format.rest(rest)"
        unit=""
        @step="(direction) => (rest = stepRest(rest, direction))"
      />
      <ion-button class="lw-exercise-settings__save" @click="save">
        {{ t('common.save') }}
      </ion-button>
    </div>
  </div>
</template>

<style scoped>
.lw-exercise-settings {
  display: grid;
  gap: 20px;
  padding-top: 16px;
}

.lw-exercise-settings__save {
  justify-self: end;
  width: 100%;
  max-width: 240px;
  height: 48px;
  margin: 0;
}
</style>

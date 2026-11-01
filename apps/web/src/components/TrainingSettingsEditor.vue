<script setup lang="ts">
import type { TrainingSettings } from '@liftwise/core';
import { IonButton, IonButtons, IonHeader, IonTitle, IonToolbar } from '@ionic/vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/format';
import { stepRest, stepRirRange, weightStepOptions } from '../workout/settings';
import ChoiceChips from './ChoiceChips.vue';
import NumberStepper from './NumberStepper.vue';

// Settings → Trening (§5.3, D31): the default rest, the target RIR and the ± weight step.
const props = defineProps<{ settings: TrainingSettings }>();
const emit = defineEmits<{ save: [settings: TrainingSettings]; close: [] }>();

const { t } = useI18n();
const format = useFormat();
const draft = ref<TrainingSettings>({
  ...props.settings,
  target_rir: { ...props.settings.target_rir },
});
const steps = weightStepOptions(props.settings.weight_step_kg).map((value) => ({
  value,
  label: format.kg(value),
}));
</script>

<template>
  <ion-header>
    <ion-toolbar>
      <ion-title>{{ t('training.title') }}</ion-title>
      <ion-buttons slot="end">
        <ion-button @click="emit('close')">{{ t('common.cancel') }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
  <div class="lw-sheet__body">
    <div class="lw-column lw-training">
      <div>
        <number-stepper
          :label="t('training.rest')"
          :value="format.rest(draft.rest_seconds)"
          unit=""
          @step="(direction) => (draft.rest_seconds = stepRest(draft.rest_seconds, direction))"
        />
        <p class="lw-training__hint">{{ t('training.restHint') }}</p>
      </div>
      <div>
        <span class="lw-training__label">{{ t('training.rir') }}</span>
        <div class="lw-training__range">
          <number-stepper
            v-for="bound in ['min', 'max'] as const"
            :key="bound"
            :label="bound === 'min' ? t('training.rirMin') : t('training.rirMax')"
            :value="format.rir(draft.target_rir[bound])"
            unit=""
            @step="
              (direction) => (draft.target_rir = stepRirRange(draft.target_rir, bound, direction))
            "
          />
        </div>
        <p class="lw-training__hint">{{ t('training.rirHint') }}</p>
      </div>
      <div>
        <choice-chips v-model="draft.weight_step_kg" :label="t('training.step')" :options="steps" />
        <p class="lw-training__hint">{{ t('training.stepHint') }}</p>
      </div>
      <ion-button class="lw-training__save" @click="emit('save', draft)">
        {{ t('common.save') }}
      </ion-button>
    </div>
  </div>
</template>

<style scoped>
.lw-training {
  display: grid;
  gap: 24px;
  padding-top: 16px;
}

.lw-training__label {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-training__range {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.lw-training__hint {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-training__save {
  justify-self: end;
  width: 100%;
  max-width: 240px;
  height: 48px;
  margin: 0;
}
</style>

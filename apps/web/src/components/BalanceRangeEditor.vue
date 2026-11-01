<script setup lang="ts">
import { DEFAULT_BALANCE_SETTINGS, type MuscleGroup, type Range } from '@liftwise/core';
import { IonButton, IonButtons, IonHeader, IonTitle, IonToolbar } from '@ionic/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/format';
import { stepBalanceRange } from '../workout/settings';
import NumberStepper from './NumberStepper.vue';

// Settings → Balans (§5.8, §5.10): a muscle group's weekly hard-set target.
const props = defineProps<{ group: MuscleGroup; range: Range }>();
const emit = defineEmits<{ save: [range: Range]; close: [] }>();

const { t } = useI18n();
const format = useFormat();
const draft = ref<Range>({ ...props.range });
const fallback = DEFAULT_BALANCE_SETTINGS.weekly_sets[props.group];
const isDefault = computed(
  () => draft.value.min === fallback.min && draft.value.max === fallback.max,
);
</script>

<template>
  <ion-header>
    <ion-toolbar>
      <ion-title>{{ format.sentence(format.muscle(group)) }}</ion-title>
      <ion-buttons slot="end">
        <ion-button @click="emit('close')">{{ t('common.cancel') }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
  <div class="lw-sheet__body">
    <div class="lw-column lw-range">
      <div>
        <div class="lw-range__bounds">
          <number-stepper
            v-for="bound in ['min', 'max'] as const"
            :key="bound"
            :label="bound === 'min' ? t('balance.rangeMin') : t('balance.rangeMax')"
            :value="String(draft[bound])"
            unit=""
            @step="(direction) => (draft = stepBalanceRange(draft, bound, direction))"
          />
        </div>
        <p class="lw-range__hint">{{ t('balance.rangeHint') }}</p>
      </div>
      <div class="lw-range__actions">
        <ion-button fill="outline" :disabled="isDefault" @click="draft = { ...fallback }">
          {{ t('balance.rangeDefault', { min: fallback.min, max: fallback.max }) }}
        </ion-button>
        <ion-button @click="emit('save', draft)">{{ t('common.save') }}</ion-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lw-range {
  display: grid;
  gap: 24px;
  padding-top: 16px;
}

.lw-range__bounds {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.lw-range__hint {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-range__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
}

.lw-range__actions ion-button {
  --border-radius: 12px;
  min-height: 48px;
  margin: 0;
}
</style>

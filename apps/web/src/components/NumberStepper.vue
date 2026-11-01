<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue';
import { add, remove } from 'ionicons/icons';
import { useI18n } from 'vue-i18n';

// A number with − / + on both sides: the keyboard-free control of weights, reps and seconds.
defineProps<{ label: string; value: string; unit: string; size?: 'md' | 'lg' }>();
const emit = defineEmits<{ step: [direction: 1 | -1] }>();

const { t } = useI18n();
</script>

<template>
  <div class="lw-stepper" :class="`is-${size ?? 'md'}`" role="group" :aria-label="label">
    <span class="lw-stepper__label">{{ label }}</span>
    <div class="lw-stepper__row">
      <ion-button
        class="lw-stepper__button"
        fill="outline"
        :aria-label="t('set.less', { label })"
        @click="emit('step', -1)"
      >
        <ion-icon slot="icon-only" :icon="remove" aria-hidden="true" />
      </ion-button>
      <output class="lw-stepper__value lw-num" aria-live="polite">
        {{ value }}<small>{{ unit }}</small>
      </output>
      <ion-button
        class="lw-stepper__button"
        fill="outline"
        :aria-label="t('set.more', { label })"
        @click="emit('step', 1)"
      >
        <ion-icon slot="icon-only" :icon="add" aria-hidden="true" />
      </ion-button>
    </div>
  </div>
</template>

<style scoped>
.lw-stepper__label {
  display: block;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-stepper__row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
}

.lw-stepper__value {
  font-size: 40px;
  line-height: 1.1;
  text-align: center;
}

.lw-stepper__value small {
  margin-left: 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--lw-muted);
}

.lw-stepper__button {
  --border-radius: 12px;
  --border-width: 1px;
  --border-color: var(--lw-border);
  --color: var(--ion-text-color);
  width: 56px;
  height: 56px;
  margin: 0;
}

.is-lg .lw-stepper__value {
  font-size: 64px;
  line-height: 1;
}

.is-lg .lw-stepper__button {
  width: 64px;
  height: 64px;
}
</style>

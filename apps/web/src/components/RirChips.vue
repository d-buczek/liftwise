<script setup lang="ts">
import { RIR_MAX } from '@liftwise/core';
import { useI18n } from 'vue-i18n';

// Optional RIR (D4): 0–4, the last one meaning 4+; tapping the chosen chip clears it.
const rir = defineModel<number | null>({ required: true });

const { t } = useI18n();
const values = Array.from({ length: RIR_MAX + 1 }, (_, i) => i);
</script>

<template>
  <div class="lw-rir" role="radiogroup" :aria-label="t('set.rir')">
    <span class="lw-rir__label">{{ t('set.rir') }}</span>
    <div class="lw-rir__chips">
      <button
        v-for="value in values"
        :key="value"
        type="button"
        role="radio"
        class="lw-rir__chip lw-num"
        :aria-checked="rir === value"
        @click="rir = rir === value ? null : value"
      >
        {{ value === RIR_MAX ? t('set.rirMax') : value }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.lw-rir__label {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-rir__chips {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.lw-rir__chip {
  height: 48px;
  font-size: 26px;
  color: var(--ion-text-color);
  background: transparent;
  border: 1px solid var(--lw-border);
  border-radius: 10px;
  cursor: pointer;
}

.lw-rir__chip[aria-checked='true'] {
  color: var(--ion-color-primary-contrast);
  background: var(--ion-color-primary);
  border-color: var(--ion-color-primary);
}
</style>

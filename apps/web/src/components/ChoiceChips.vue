<script setup lang="ts" generic="T">
// One of a few values as a row of chips, like the RIR chips; no keyboard. Compact chips (a
// chart's filters) keep the label for screen readers only. With `clearTo` the answer is optional:
// tapping the chosen chip again gives that value.
const props = defineProps<{
  label: string;
  options: { value: T; label: string }[];
  compact?: boolean;
  clearTo?: T;
}>();
const model = defineModel<T>({ required: true });

function choose(value: T) {
  model.value = model.value === value && props.clearTo !== undefined ? props.clearTo : value;
}
</script>

<template>
  <div class="lw-choice" :class="{ 'is-compact': compact }" role="radiogroup" :aria-label="label">
    <span v-if="!compact" class="lw-choice__label">{{ label }}</span>
    <div class="lw-choice__chips">
      <button
        v-for="option in options"
        :key="String(option.value)"
        type="button"
        role="radio"
        class="lw-choice__chip lw-fig"
        :aria-checked="model === option.value"
        @click="choose(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.lw-choice__label {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-choice__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lw-choice__chip {
  min-width: 64px;
  height: 48px;
  padding: 0 14px;
  font-family: inherit;
  font-size: 18px;
  color: var(--ion-text-color);
  background: transparent;
  border: 1px solid var(--lw-border);
  border-radius: 12px;
  cursor: pointer;
}

.lw-choice__chip[aria-checked='true'] {
  color: var(--ion-color-primary-contrast);
  background: var(--ion-color-primary);
  border-color: var(--ion-color-primary);
}

.is-compact .lw-choice__chips {
  gap: 6px;
}

.is-compact .lw-choice__chip {
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  font-size: 16px;
  border-radius: 18px;
}
</style>

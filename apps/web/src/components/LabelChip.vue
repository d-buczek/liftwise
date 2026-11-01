<script setup lang="ts">
import type { WorkoutLabel } from '@liftwise/core';

// A workout label (D48) as a solid tag in its color, like a done day on the calendar; the name
// always shows, so the color is never the only cue.
defineProps<{ label: Pick<WorkoutLabel, 'name' | 'color'> }>();
</script>

<template>
  <span class="lw-label" :style="{ '--lw-label': `var(--lw-label-${label.color})` }">
    {{ label.name }}
  </span>
</template>

<style scoped>
.lw-label {
  display: inline-block;
  min-width: 24px;
  padding: 2px 8px;
  font-size: 14px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
  line-height: 20px;
  color: var(--lw-label-contrast);
  text-align: center;
  white-space: nowrap;
  background: var(--lw-label);
  border-radius: 6px;
}
</style>

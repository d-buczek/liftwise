<script setup lang="ts">
// The line under a toolbar (§5.13): a share of the work, or the days of a week. Decoration for the
// eye only: the same information is in the screen's text. Its colors come from the theme.
defineProps<{ value?: number; days?: boolean[] }>();
</script>

<template>
  <div class="lw-line" aria-hidden="true">
    <template v-if="days">
      <i
        v-for="(lit, day) in days"
        :key="day"
        class="lw-line__day"
        :class="{ 'is-lit': lit }"
        :style="{ '--lw-line-band': `var(--lw-band-${day + 1})` }"
      />
    </template>
    <template v-else>
      <i class="lw-line__rest" />
      <i class="lw-line__fill" :style="{ '--lw-line-share': value ?? 0 }" />
    </template>
  </div>
</template>

<style scoped>
.lw-line {
  position: relative;
  display: flex;
  gap: 2px;
  height: var(--lw-line-height);
}

.lw-line__rest,
.lw-line__fill {
  position: absolute;
  inset: 0;
}

.lw-line__rest {
  background: var(--lw-line-rest);
  opacity: var(--lw-line-rest-opacity);
}

.lw-line__fill {
  background: var(--lw-line-knurl), var(--lw-line);
  clip-path: inset(0 calc((1 - var(--lw-line-share)) * 100%) 0 0);
}

.lw-line__day {
  flex: 1;
  background: var(--lw-line-knurl), var(--lw-line-band);
  opacity: 22%;
}

.lw-line__day.is-lit {
  opacity: 1;
}
</style>

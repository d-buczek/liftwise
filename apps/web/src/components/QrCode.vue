<script setup lang="ts">
import { encode } from 'uqr';
import { computed } from 'vue';

// Black on white in both themes: scanners read that contrast best.
const props = defineProps<{ text: string; label: string }>();

const qr = computed(() => encode(props.text, { ecc: 'M', border: 2 }));
const path = computed(() =>
  qr.value.data
    .flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : [])))
    .join(''),
);
</script>

<template>
  <svg
    class="lw-qr"
    :viewBox="`0 0 ${qr.size} ${qr.size}`"
    role="img"
    :aria-label="label"
    shape-rendering="crispEdges"
  >
    <rect :width="qr.size" :height="qr.size" fill="#fff" />
    <path :d="path" fill="#000" />
  </svg>
</template>

<style scoped>
.lw-qr {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
}
</style>

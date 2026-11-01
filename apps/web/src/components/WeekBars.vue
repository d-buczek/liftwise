<script setup lang="ts">
import { addDays, type Range, type WeekHardSets } from '@liftwise/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChartChoice, useElementWidth } from '../composables/chart';
import { useFormat } from '../composables/format';
import { dateValue } from '../workout/calendar';
import { niceTicks } from '../workout/charts';

// A muscle group's hard sets per week (§5.4, §5.8): one column per week over the band of its
// target range. The readout shows the chosen week, the last one until a pointer or the arrow
// keys choose another; a table twin lists every week for screen readers.
const props = defineProps<{ weeks: WeekHardSets[]; target: Range; label: string }>();

const { t, d } = useI18n();
const format = useFormat();

const PLOT_HEIGHT = 160;
const TOP = 20;
const AXIS = 28;
const height = PLOT_HEIGHT + TOP + AXIS;
const BAR_MAX = 24;
const RADIUS = 4;

const box = ref<HTMLElement | null>(null);
const width = useElementWidth(box);
const { chosen, selected, key, leave } = useChartChoice(() => props.weeks);

const geometry = computed(() => {
  const top = Math.max(props.target.max, ...props.weeks.map((week) => week.hardSets));
  const ticks = niceTicks(0, top, 4, 1);
  const high = ticks.at(-1) || 1;
  const y = (value: number) => TOP + (1 - value / high) * PLOT_HEIGHT;
  const slot = width.value / Math.max(1, props.weeks.length);
  const bar = Math.min(BAR_MAX, Math.max(4, slot - 6));
  const columns = props.weeks.map((week, i) => {
    const x = i * slot + (slot - bar) / 2;
    const h = (week.hardSets / high) * PLOT_HEIGHT;
    const r = Math.min(RADIUS, h, bar / 2);
    const base = TOP + PLOT_HEIGHT;
    // Rounded at the data end, square at the baseline.
    const path =
      h <= 0
        ? ''
        : `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} ` +
          `H${x + bar - r} Q${x + bar},${base - h} ${x + bar},${base - h + r} V${base} Z`;
    return { x, slot: i * slot, path, center: x + bar / 2 };
  });
  return {
    columns,
    slot,
    grid: ticks.map((tick) => ({ tick, y: y(tick) })),
    band: { y: y(props.target.max), h: y(props.target.min) - y(props.target.max) },
  };
});

const current = computed(() => props.weeks[selected.value]);
const weekSpan = (start: string) =>
  t('charts.week', {
    start: d(dateValue(start), 'dayShort'),
    end: d(dateValue(addDays(start, 6)), 'dayShort'),
  });
const sets = format.hardSets;
</script>

<template>
  <figure class="lw-bars" :aria-label="label">
    <output class="lw-bars__readout" aria-live="polite">
      <template v-if="current">
        <span class="lw-bars__value">{{ sets(current.hardSets) }}</span>
        <span class="lw-bars__date">{{ weekSpan(current.start) }}</span>
      </template>
    </output>
    <div
      ref="box"
      class="lw-bars__plot"
      tabindex="0"
      role="group"
      :aria-label="t('charts.keys', { label })"
      @keydown="key"
    >
      <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" aria-hidden="true">
        <rect
          class="lw-bars__band"
          x="0"
          :y="geometry.band.y"
          :width="width"
          :height="Math.max(1, geometry.band.h)"
        />
        <g class="lw-bars__grid">
          <template v-for="row in geometry.grid" :key="row.tick">
            <line :x1="0" :x2="width" :y1="row.y" :y2="row.y" />
            <text :x="0" :y="row.y - 5">{{ row.tick }}</text>
          </template>
        </g>
        <path
          v-for="(column, i) in geometry.columns"
          :key="weeks[i]?.start"
          class="lw-bars__bar"
          :class="{ 'is-chosen': i === selected }"
          :d="column.path"
        />
        <g class="lw-bars__axis">
          <text
            v-if="weeks[0]"
            :x="geometry.columns[0]?.center"
            :y="height - 8"
            text-anchor="start"
          >
            {{ d(dateValue(weeks[0].start), 'dayShort') }}
          </text>
          <text
            v-if="weeks.length > 1"
            :x="geometry.columns.at(-1)?.center"
            :y="height - 8"
            text-anchor="end"
          >
            {{ t('charts.thisWeek') }}
          </text>
        </g>
        <rect
          v-for="(column, i) in geometry.columns"
          :key="`hit-${weeks[i]?.start}`"
          class="lw-bars__hit"
          :x="column.slot"
          :y="0"
          :width="geometry.slot"
          :height="height"
          @pointerdown="chosen = i"
          @pointerenter="chosen = i"
          @pointerleave="leave"
        />
      </svg>
    </div>
    <p class="lw-bars__legend">
      <span class="lw-bars__swatch" aria-hidden="true" />
      {{ t('balance.targetRange', { min: target.min, max: target.max }) }}
    </p>
    <div class="lw-sr-only">
      <table>
        <caption>
          {{
            label
          }}
        </caption>
        <tr v-for="week in weeks" :key="week.start">
          <th scope="row">{{ weekSpan(week.start) }}</th>
          <td>{{ sets(week.hardSets) }}</td>
        </tr>
      </table>
    </div>
  </figure>
</template>

<style scoped>
.lw-bars {
  margin: 0;
}

.lw-bars__readout {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  min-height: 52px;
}

.lw-bars__value {
  font-size: 40px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
  line-height: 1.2;
}

.lw-bars__date,
.lw-bars__legend {
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-bars__plot {
  margin-top: 4px;
  border-radius: 4px;
  touch-action: pan-y;
}

.lw-bars svg {
  display: block;
  overflow: visible;
}

.lw-bars__band,
.lw-bars__swatch {
  fill: var(--ion-color-primary);
  fill-opacity: 0.1;
  background: color-mix(in srgb, var(--ion-color-primary) 10%, transparent);
}

.lw-bars__grid line {
  stroke: var(--lw-border);
  stroke-width: 1;
}

.lw-bars__grid text,
.lw-bars__axis text {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  fill: var(--lw-muted);
}

/* The chosen week stays solid, the others step back. */
.lw-bars__bar {
  fill: var(--ion-color-primary);
  opacity: 0.55;
}

.lw-bars__bar.is-chosen {
  opacity: 1;
}

.lw-bars__hit {
  fill: transparent;
}

.lw-bars__legend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0;
}

.lw-bars__swatch {
  width: 16px;
  height: 12px;
  border-radius: 2px;
}
</style>

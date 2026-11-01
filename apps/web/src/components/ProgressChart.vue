<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChartChoice, useElementWidth } from '../composables/chart';
import { dateValue } from '../workout/calendar';
import { nearestIndex, niceTicks, type ChartPoint } from '../workout/charts';

// One series over time (§5.4): a 2px line, x proportional to the date, y over clean ticks (not
// from 0, so no area wash suggesting it is). The readout above it shows the chosen day in plate
// numerals, the last one until a pointer or the arrow keys choose another. A table twin lists
// every value for screen readers.
const props = defineProps<{
  points: ChartPoint[];
  // What the series is ("Ciężar serii szczytowej"), the chart's accessible name.
  label: string;
  format: (value: number) => string;
  // Whole values (reps, seconds, kg of volume): no fractional ticks.
  whole?: boolean;
}>();

const { t, d } = useI18n();

const PLOT_HEIGHT = 168;
const TOP = 20;
const AXIS = 28;
const PAD_X = 8;
// Room for the longest tick label left of the plot, at ~7 px per character of 13 px text.
const CHAR_WIDTH = 7;
const height = PLOT_HEIGHT + TOP + AXIS;

const box = ref<HTMLElement | null>(null);
const width = useElementWidth(box);
const { chosen, selected, key, leave } = useChartChoice(() => props.points);

const ticks = computed(() => {
  const values = props.points.map((point) => point.value);
  return niceTicks(Math.min(...values), Math.max(...values), 4, props.whole ? 1 : 0);
});

const geometry = computed(() => {
  const times = props.points.map((point) => Date.parse(point.date));
  const first = times[0] ?? 0;
  const span = (times.at(-1) ?? 0) - first;
  const gutter = Math.max(...ticks.value.map((tick) => props.format(tick).length)) * CHAR_WIDTH + 8;
  const left = gutter + PAD_X;
  const inner = width.value - left - PAD_X;
  const low = ticks.value[0] ?? 0;
  const range = (ticks.value.at(-1) ?? 1) - low || 1;
  const y = (value: number) => TOP + (1 - (value - low) / range) * PLOT_HEIGHT;
  const dots = props.points.map((point, i) => ({
    x: left + (span === 0 ? inner / 2 : (((times[i] ?? 0) - first) / span) * inner),
    y: y(point.value),
  }));
  const line = dots.map((dot, i) => `${i === 0 ? 'M' : 'L'}${dot.x},${dot.y}`).join(' ');
  // Every day gets a dot while they stand apart; otherwise only the chosen one.
  const spaced = dots.length < 2 || inner / (dots.length - 1) >= 14;
  return {
    dots,
    line,
    spaced,
    gutter,
    left,
    grid: ticks.value.map((tick) => ({ tick, y: y(tick) })),
  };
});

const current = computed(() => props.points[selected.value]);
const currentDot = computed(() => geometry.value.dots[selected.value]);
const axisDate = (date: string) => d(dateValue(date), 'dayShort');

function choose(event: PointerEvent) {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
  const xs = geometry.value.dots.map((dot) => dot.x);
  chosen.value = nearestIndex(xs, ((event.clientX - rect.left) / rect.width) * width.value);
}
</script>

<template>
  <figure class="lw-chart" :aria-label="label">
    <output class="lw-chart__readout" aria-live="polite">
      <template v-if="current">
        <span class="lw-chart__value">{{ format(current.value) }}</span>
        <span class="lw-chart__date">{{ d(dateValue(current.date), 'day') }}</span>
      </template>
    </output>
    <div
      ref="box"
      class="lw-chart__plot"
      tabindex="0"
      role="group"
      :aria-label="t('charts.keys', { label })"
      @keydown="key"
    >
      <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" aria-hidden="true">
        <g class="lw-chart__grid">
          <template v-for="row in geometry.grid" :key="row.tick">
            <line :x1="geometry.gutter" :x2="width" :y1="row.y" :y2="row.y" />
            <text :x="geometry.gutter - 8" :y="row.y" text-anchor="end" dominant-baseline="middle">
              {{ format(row.tick) }}
            </text>
          </template>
        </g>
        <path class="lw-chart__line" :d="geometry.line" />
        <line
          v-if="currentDot && points.length > 1"
          class="lw-chart__cross"
          :x1="currentDot.x"
          :x2="currentDot.x"
          :y1="TOP"
          :y2="TOP + PLOT_HEIGHT"
        />
        <template v-if="geometry.spaced">
          <circle
            v-for="(dot, i) in geometry.dots"
            :key="i"
            class="lw-chart__dot"
            :cx="dot.x"
            :cy="dot.y"
            r="4"
          />
        </template>
        <circle
          v-if="currentDot"
          class="lw-chart__dot is-chosen"
          :cx="currentDot.x"
          :cy="currentDot.y"
          r="6"
        />
        <g class="lw-chart__axis">
          <text :x="geometry.left" :y="height - 8" text-anchor="start">
            {{ points[0] ? axisDate(points[0].date) : '' }}
          </text>
          <text v-if="points.length > 1" :x="width - PAD_X" :y="height - 8" text-anchor="end">
            {{ axisDate(points.at(-1)!.date) }}
          </text>
        </g>
        <rect
          class="lw-chart__hit"
          :width="width"
          :height="height"
          @pointerdown="choose"
          @pointermove="choose"
          @pointerleave="leave"
        />
      </svg>
    </div>
    <div class="lw-sr-only">
      <table>
        <caption>
          {{
            label
          }}
        </caption>
        <tr v-for="point in points" :key="point.date">
          <th scope="row">{{ d(dateValue(point.date), 'day') }}</th>
          <td>{{ format(point.value) }}</td>
        </tr>
      </table>
    </div>
  </figure>
</template>

<style scoped>
.lw-chart {
  position: relative;
  margin: 0;
}

/* The chosen day as the one loud element: proportional figures at display size. */
.lw-chart__readout {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  min-height: 52px;
}

.lw-chart__value {
  font-size: 40px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
  line-height: 1.2;
}

.lw-chart__date {
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-chart__plot {
  margin-top: 4px;
  border-radius: 4px;
  touch-action: pan-y;
}

.lw-chart svg {
  display: block;
  overflow: visible;
}

.lw-chart__grid line {
  stroke: var(--lw-border);
  stroke-width: 1;
}

.lw-chart__grid text,
.lw-chart__axis text {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  fill: var(--lw-muted);
}

.lw-chart__line {
  fill: none;
  stroke: var(--ion-color-primary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.lw-chart__cross {
  stroke: var(--lw-muted);
  stroke-width: 1;
  opacity: 0.6;
}

/* A surface ring keeps a dot readable where it sits on the line. */
.lw-chart__dot {
  fill: var(--ion-color-primary);
  stroke: var(--lw-surface);
  stroke-width: 2;
}

.lw-chart__hit {
  fill: transparent;
  cursor: crosshair;
}
</style>

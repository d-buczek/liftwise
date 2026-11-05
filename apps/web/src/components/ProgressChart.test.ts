import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../i18n';
import type { ChartPoint } from '../workout/charts';
import ProgressChart from './ProgressChart.vue';

enableAutoUnmount(afterEach);
afterEach(() => vi.unstubAllGlobals());

const points: ChartPoint[] = [
  { date: '2026-10-01', value: 20 },
  { date: '2026-10-02', value: 22.5 },
  { date: '2026-10-11', value: 25 },
];

function chart(given: ChartPoint[] = points, whole = false) {
  const wrapper = mount(ProgressChart, {
    global: { plugins: [i18n] },
    props: { points: given, label: 'Ciężar', format: (value: number) => `${value} kg`, whole },
  });
  const plot = wrapper.find('.lw-chart__plot');
  return {
    wrapper,
    press: (key: string) => plot.trigger('keydown', { key }),
    value: () => wrapper.find('.lw-chart__value').text(),
    date: () => wrapper.find('.lw-chart__date').text(),
    plainDots: () => wrapper.findAll('circle:not(.is-chosen)'),
    ticks: () => wrapper.findAll('.lw-chart__grid text').map((tick) => tick.text()),
    axis: () => wrapper.findAll('.lw-chart__axis text').map((label) => label.text()),
  };
}

// The middle day halfway between the others.
const spread: ChartPoint[] = [
  { date: '2026-10-01', value: 20 },
  { date: '2026-10-06', value: 22.5 },
  { date: '2026-10-11', value: 25 },
];

// Daily points over a span too tight for a dot each.
const crowded: ChartPoint[] = Array.from({ length: 60 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
  value: 20 + (i % 5),
}));

it('shows the last day through the given format until another is chosen', () => {
  const { value, date } = chart();
  expect(value()).toBe('25 kg');
  expect(date()).toBe('11 paź 2026');
});

it('the arrow keys, Home and End walk the days and stop at the ends', async () => {
  const { press, value, date } = chart();
  await press('ArrowRight');
  expect(value()).toBe('25 kg');
  await press('ArrowLeft');
  expect(value()).toBe('22.5 kg');
  expect(date()).toBe('2 paź 2026');
  await press('Home');
  await press('ArrowLeft');
  expect(value()).toBe('20 kg');
  await press('End');
  expect(value()).toBe('25 kg');
});

it('a pointer chooses the nearest day, a mouse leaving gives the readout back', async () => {
  const { wrapper, value } = chart(spread);
  const hit = wrapper.find('.lw-chart__hit');
  // The plot rendered at twice its drawn width, 100 px from the left of the window.
  vi.spyOn(hit.element, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    width: 640,
  } as DOMRect);
  // x 210 of 320 is nearest the middle day; without the offset or the scale it would be the last.
  await hit.trigger('pointerdown', { clientX: 520 });
  expect(value()).toBe('22.5 kg');
  await hit.trigger('pointerleave', { pointerType: 'touch' });
  expect(value()).toBe('22.5 kg');
  await hit.trigger('pointerleave', { pointerType: 'mouse' });
  expect(value()).toBe('25 kg');
});

it('new data starts over at its last day', async () => {
  const { wrapper, press, value } = chart();
  await press('Home');
  await wrapper.setProps({ points: points.slice(0, 2) } as never);
  expect(value()).toBe('22.5 kg');
});

it('places days along x by their date, not their index', () => {
  const xs = chart()
    .plainDots()
    .map((dot) => Number(dot.attributes('cx')));
  const [first = 0, second = 0, third = 0] = xs;
  // One day out of the ten between the first and the last.
  expect((second - first) / (third - first)).toBeCloseTo(0.1);
});

it('one point draws one centred dot, no crosshair and a single date', () => {
  const { wrapper, value, plainDots, axis } = chart([{ date: '2026-10-01', value: 20 }]);
  expect(value()).toBe('20 kg');
  expect(plainDots()).toHaveLength(1);
  expect(wrapper.find('.lw-chart__cross').exists()).toBe(false);
  expect(axis()).toEqual(['1 paź']);
  expect(wrapper.find('svg').html()).not.toMatch(/NaN|Infinity/);
});

it('a flat series and a series at zero stay inside the plot', () => {
  for (const value of [24, 0]) {
    const flat = [
      { date: '2026-10-01', value },
      { date: '2026-10-08', value },
    ];
    const { wrapper } = chart(flat);
    expect(wrapper.find('svg').html()).not.toMatch(/NaN|Infinity/);
    for (const dot of wrapper.findAll('circle')) {
      const y = Number(dot.attributes('cy'));
      expect(y).toBeGreaterThanOrEqual(20);
      expect(y).toBeLessThanOrEqual(188);
    }
  }
});

it('whole values get no fractional ticks', () => {
  const close = [
    { date: '2026-10-01', value: 8 },
    { date: '2026-10-08', value: 9 },
  ];
  expect(chart(close, true).ticks()).toEqual(['8 kg', '9 kg']);
  expect(chart(close, false).ticks()).toContain('8.5 kg');
});

it('every day gets a dot while they stand apart, otherwise only the chosen one', () => {
  expect(chart().plainDots()).toHaveLength(3);
  const { wrapper, plainDots } = chart(crowded);
  expect(plainDots()).toHaveLength(0);
  expect(wrapper.findAll('circle')).toHaveLength(1);
});

it('lists every value for screen readers', () => {
  const rows = chart()
    .wrapper.findAll('tr')
    .map((row) => row.text());
  expect(rows).toEqual([
    expect.stringMatching(/1 paź 2026\s*20 kg/),
    expect.stringMatching(/2 paź 2026\s*22\.5 kg/),
    expect.stringMatching(/11 paź 2026\s*25 kg/),
  ]);
});

it('no points leave an empty readout and an empty list', () => {
  const { wrapper } = chart([]);
  expect(wrapper.find('output').text()).toBe('');
  expect(wrapper.findAll('tr')).toHaveLength(0);
});

it('draws at the width of its box, down to a floor that keeps labels readable', async () => {
  let resize: (width: number) => void = () => undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: (entries: { contentRect: { width: number } }[]) => void) {
        resize = (width) => callback([{ contentRect: { width } }]);
      }
      observe() {}
      disconnect() {}
    },
  );
  const { wrapper } = chart();
  const svg = wrapper.find('svg');
  expect(svg.attributes('width')).toBe('320');
  resize(512.4);
  await wrapper.vm.$nextTick();
  expect(svg.attributes('width')).toBe('512');
  resize(90);
  await wrapper.vm.$nextTick();
  expect(svg.attributes('width')).toBe('200');
});

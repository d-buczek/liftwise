import type { Range, WeekHardSets } from '@liftwise/core';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { i18n } from '../i18n';
import WeekBars from './WeekBars.vue';

enableAutoUnmount(afterEach);

const weeks: WeekHardSets[] = [
  { start: '2026-10-19', hardSets: 8 },
  { start: '2026-10-26', hardSets: 1.5 },
  { start: '2026-11-02', hardSets: 12 },
];

function bars(given: WeekHardSets[] = weeks, target: Range = { min: 10, max: 20 }) {
  const wrapper = mount(WeekBars, {
    global: { plugins: [i18n] },
    props: { weeks: given, target, label: 'Klatka: twarde serie' },
  });
  const plot = wrapper.find('.lw-bars__plot');
  return {
    wrapper,
    plot,
    press: (key: string) => plot.trigger('keydown', { key }),
    value: () => wrapper.find('.lw-bars__value').text(),
    date: () => wrapper.find('.lw-bars__date').text(),
    hits: () => wrapper.findAll('.lw-bars__hit'),
  };
}

it('shows the last week until something else is chosen', () => {
  const { value, date } = bars();
  expect(value()).toBe('12 serii');
  expect(date()).toBe('2 lis – 8 lis');
});

it('the arrow keys, Home and End walk the weeks and stop at the ends', async () => {
  const { press, value, date } = bars();
  await press('ArrowRight');
  expect(value()).toBe('12 serii');
  await press('ArrowLeft');
  expect(value()).toBe('1,5 serii');
  expect(date()).toBe('26 paź – 1 lis');
  await press('Home');
  expect(value()).toBe('8 serii');
  await press('ArrowLeft');
  expect(value()).toBe('8 serii');
  await press('End');
  expect(value()).toBe('12 serii');
});

it('takes only the keys it handles away from the page', () => {
  const { plot } = bars();
  const press = (key: string) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    plot.element.dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(press('ArrowLeft')).toBe(true);
  expect(press('Tab')).toBe(false);
});

it('a tap chooses a week and keeps it, a mouse leaving gives the readout back', async () => {
  const { hits, value } = bars();
  const first = hits()[0]!;
  await first.trigger('pointerdown');
  expect(value()).toBe('8 serii');
  await first.trigger('pointerleave', { pointerType: 'touch' });
  expect(value()).toBe('8 serii');
  await first.trigger('pointerleave', { pointerType: 'mouse' });
  expect(value()).toBe('12 serii');
});

it('new weeks start over at the last one', async () => {
  const { wrapper, press, value } = bars();
  await press('Home');
  await wrapper.setProps({ weeks: weeks.slice(0, 2) } as never);
  expect(value()).toBe('1,5 serii');
});

it('a week without sets is listed but draws no bar', () => {
  const empty = { start: '2026-11-02', hardSets: 0 };
  const { wrapper, value } = bars([weeks[0]!, empty]);
  expect(value()).toBe('0 serii');
  const [full, none] = wrapper.findAll('.lw-bars__bar');
  expect(full!.attributes('d')).not.toBe('');
  expect(none!.attributes('d')).toBe('');
  expect(wrapper.findAll('tr')[1]!.text()).toContain('0 serii');
});

it('lists every week for screen readers', () => {
  const rows = bars()
    .wrapper.findAll('tr')
    .map((row) => row.text());
  expect(rows).toEqual([
    expect.stringMatching(/19 paź – 25 paź\s*8 serii/),
    expect.stringMatching(/26 paź – 1 lis\s*1,5 serii/),
    expect.stringMatching(/2 lis – 8 lis\s*12 serii/),
  ]);
});

it('the axis runs from the first date to "ten tydzień", one week has only its date', () => {
  const axis = (given: WeekHardSets[]) =>
    bars(given)
      .wrapper.findAll('.lw-bars__axis text')
      .map((label) => label.text());
  expect(axis(weeks)).toEqual(['19 paź', 'ten tydzień']);
  expect(axis(weeks.slice(2))).toEqual(['2 lis']);
});

it('the axis grows to fit a week above the target', () => {
  const { wrapper } = bars([{ start: '2026-11-02', hardSets: 37 }]);
  const ticks = wrapper.findAll('.lw-bars__grid text').map((tick) => Number(tick.text()));
  expect(ticks).toEqual([0, 10, 20, 30, 40]);
});

it('the band covers the target range on the axis', () => {
  // Ticks 0–20 over the 160 px plot below the 20 px top: 20 sets at y 20, 10 sets at y 100.
  const band = bars().wrapper.find('.lw-bars__band');
  expect(band.attributes('y')).toBe('20');
  expect(band.attributes('height')).toBe('80');
});

it('no weeks and an empty target draw nothing broken', () => {
  const { wrapper } = bars([], { min: 0, max: 0 });
  expect(wrapper.find('output').text()).toBe('');
  expect(wrapper.find('svg').html()).not.toMatch(/NaN|Infinity/);
  expect(wrapper.find('.lw-bars__legend').text()).toBe('Zakres docelowy: 0–0 serii');
});

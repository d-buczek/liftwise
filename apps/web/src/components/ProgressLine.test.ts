import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import ProgressLine from './ProgressLine.vue';

enableAutoUnmount(afterEach);

it('shows a share as a fill and stays out of the accessibility tree', () => {
  const line = mount(ProgressLine, { props: { value: 0.5 } });
  expect(line.attributes('aria-hidden')).toBe('true');
  expect(
    line.find<HTMLElement>('.lw-line__fill').element.style.getPropertyValue('--lw-line-share'),
  ).toBe('0.5');
  expect(line.find('.lw-line__day').exists()).toBe(false);
});

it('shows a week as one dash per day, lit on the days given, each in its own band', () => {
  const days = [false, true, false, false, false, true, false];
  const line = mount(ProgressLine, { props: { days } });
  const dashes = line.findAll<HTMLElement>('.lw-line__day');
  expect(dashes.map((dash) => dash.classes('is-lit'))).toEqual(days);
  expect(dashes[6]?.element.style.getPropertyValue('--lw-line-band')).toBe('var(--lw-band-7)');
  expect(line.find('.lw-line__fill').exists()).toBe(false);
});

import type { MuscleTarget } from '@liftwise/core';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { i18n } from '../i18n';
import BalanceMeter from './BalanceMeter.vue';

enableAutoUnmount(afterEach);

function meter(hardSets: number, status: MuscleTarget['status'], scale = 25) {
  return mount(BalanceMeter, {
    global: { plugins: [i18n] },
    props: { scale, muscle: { group: 'chest', hardSets, target: { min: 10, max: 20 }, status } },
  });
}

it.each([
  [0, 'under', '0 serii, zakres 10–20: za mało'],
  [1, 'under', '1 seria, zakres 10–20: za mało'],
  [2, 'under', '2 serie, zakres 10–20: za mało'],
  [1.5, 'under', '1,5 serii, zakres 10–20: za mało'],
  [12, 'in_range', '12 serii, zakres 10–20: w normie'],
  [22, 'over', '22 serie, zakres 10–20: za dużo'],
] as const)('reads %s hard sets (%s) to a screen reader', (hardSets, status, label) => {
  expect(meter(hardSets, status).attributes('aria-label')).toBe(label);
});

it('shows half sets with a decimal comma next to the range', () => {
  const count = meter(10.5, 'in_range').find('.lw-meter__count').text();
  expect(count).toContain('10,5');
  expect(count).toContain('/ 10–20');
});

it('draws the bar and the band on the shared scale', () => {
  const wrapper = meter(5, 'under', 40);
  const bar = wrapper.find<HTMLElement>('.lw-meter__bar').element;
  const band = wrapper.find<HTMLElement>('.lw-meter__band').element;
  expect(bar.style.width).toBe('12.5%');
  expect(band.style.left).toBe('25%');
  expect(band.getAttribute('style')).toContain('calc(50% - 25%)');
});

it('a bar past the scale stops at the end of the track', () => {
  const bar = meter(60, 'over', 25).find<HTMLElement>('.lw-meter__bar').element;
  expect(bar.style.width).toBe('100%');
});

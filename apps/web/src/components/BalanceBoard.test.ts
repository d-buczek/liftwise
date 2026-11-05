import type { BalanceSnapshot, MuscleBalance } from '@liftwise/core';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { i18n } from '../i18n';
import BalanceBoard from './BalanceBoard.vue';
import BalanceMeter from './BalanceMeter.vue';

enableAutoUnmount(afterEach);

const target = { min: 10, max: 20 };
const snapshot: BalanceSnapshot = {
  muscles: [
    { group: 'chest', hardSets: 22, target, status: 'over', daysSince: 0 },
    { group: 'lats', hardSets: 12, target, status: 'in_range', daysSince: 1 },
    { group: 'quads', hardSets: 3, target, status: 'under', daysSince: 5 },
    { group: 'calves', hardSets: 0, target, status: 'under', daysSince: null },
  ],
  patterns: [
    { pattern: 'squat', daysSince: 3 },
    { pattern: 'hinge', daysSince: null },
  ],
};

function board(given: BalanceSnapshot = snapshot) {
  return mount(BalanceBoard, { global: { plugins: [i18n] }, props: { snapshot: given } });
}

// Ionic's hosts hide their textContent in the test DOM, so rows are found by their markup.
const rowOf = (wrapper: ReturnType<typeof board>, name: string) => {
  const row = wrapper.findAll('ion-item').find((item) => item.html().includes(name));
  if (!row) throw new Error(`no row "${name}"`);
  return row;
};

it('tags only a muscle group over its range', () => {
  const wrapper = board();
  expect(rowOf(wrapper, 'Klatka').find('.lw-board__tag').text()).toBe('za dużo');
  for (const name of ['Najszersze', 'Czworogłowe', 'Łydki']) {
    expect(rowOf(wrapper, name).find('.lw-board__tag').exists()).toBe(false);
  }
});

it('says how long ago each muscle group was trained', () => {
  const wrapper = board();
  expect(rowOf(wrapper, 'Klatka').find('.lw-board__since').text()).toBe('dziś');
  expect(rowOf(wrapper, 'Najszersze').find('.lw-board__since').text()).toBe('wczoraj');
  expect(rowOf(wrapper, 'Czworogłowe').find('.lw-board__since').text()).toBe('5 dni temu');
  expect(rowOf(wrapper, 'Łydki').find('.lw-board__since').text()).toBe('nigdy');
});

it('a muscle group links to its history, a pattern does not link anywhere', () => {
  const wrapper = board();
  const href = (name: string) => rowOf(wrapper, name).element.getAttribute('routerlink');
  expect(href('Czworogłowe')).toBe('/history/muscle/quads');
  expect(href('Przysiad')).toBeNull();
});

it('a pattern never done is a visible gap, a done one says when', () => {
  const wrapper = board();
  expect(rowOf(wrapper, 'Zawias biodrowy').find('.lw-board__tag').text()).toBe('nigdy');
  const squat = rowOf(wrapper, 'Przysiad');
  expect(squat.find('.lw-board__tag').exists()).toBe(false);
  expect(squat.html()).toContain('3 dni temu');
});

it('every row shares one scale with room above the highest of sets and targets', () => {
  const scales = (muscles: MuscleBalance[]) =>
    board({ muscles, patterns: [] })
      .findAllComponents(BalanceMeter)
      .map((meter) => (meter.props() as { scale: number }).scale);
  // 22 sets beat the target max of 20.
  expect(scales(snapshot.muscles)).toEqual([27.5, 27.5, 27.5, 27.5]);
  // A target of 20 beats the 12 sets.
  expect(scales(snapshot.muscles.slice(1, 2))).toEqual([25]);
});

it('with no sets and an empty target the bar stays at zero', () => {
  const muscle: MuscleBalance = {
    group: 'abs',
    hardSets: 0,
    target: { min: 0, max: 0 },
    status: 'in_range',
    daysSince: null,
  };
  const wrapper = board({ muscles: [muscle], patterns: [] });
  expect(wrapper.find<HTMLElement>('.lw-meter__bar').element.style.width).toBe('0%');
});

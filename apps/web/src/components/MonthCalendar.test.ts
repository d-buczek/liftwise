import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { i18n } from '../i18n';
import MonthCalendar from './MonthCalendar.vue';

enableAutoUnmount(afterEach);

function calendar() {
  const months: string[] = [];
  const wrapper = mount(MonthCalendar, {
    global: { plugins: [i18n] },
    props: {
      marks: new Map(),
      month: '2026-11',
      'onUpdate:month': (month: string) => months.push(month),
    },
  });
  const grid = wrapper.find('.lw-month__viewport');
  const touch = (clientX: number, clientY = 0) => ({ clientX, clientY });
  const swipe = async (from: number, to: number, toY = 0) => {
    await grid.trigger('touchstart', { touches: [touch(from)] });
    await grid.trigger('touchend', { changedTouches: [touch(to, toY)] });
  };
  return { grid, months, swipe, touch };
}

it('a swipe to the left turns to the next month, to the right to the previous one', async () => {
  const { months, swipe } = calendar();
  await swipe(300, 100);
  await swipe(100, 300);
  expect(months).toEqual(['2026-12', '2026-10']);
});

it('a short move or a mostly vertical one stays on the month', async () => {
  const { months, swipe } = calendar();
  await swipe(300, 270);
  await swipe(300, 200, 150);
  expect(months).toEqual([]);
});

it('a second finger or a scroll the browser took over cancels the swipe', async () => {
  const { grid, months, touch } = calendar();
  await grid.trigger('touchstart', { touches: [touch(300), touch(100)] });
  await grid.trigger('touchend', { changedTouches: [touch(100)] });
  await grid.trigger('touchstart', { touches: [touch(300)] });
  await grid.trigger('touchcancel');
  await grid.trigger('touchend', { changedTouches: [touch(100)] });
  expect(months).toEqual([]);
});

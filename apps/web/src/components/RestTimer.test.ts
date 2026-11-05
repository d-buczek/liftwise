import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { nextTick } from 'vue';
import { i18n } from '../i18n';
import { useRestStore } from '../stores/rest';
import RestTimer from './RestTimer.vue';

enableAutoUnmount(afterEach);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-01T18:00:00Z'));
  localStorage.clear();
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.useRealTimers();
});

function timer(restSeconds: number | null = 90) {
  const rest = useRestStore();
  if (restSeconds !== null) rest.start(restSeconds);
  const wrapper = mount(RestTimer, { global: { plugins: [i18n] } });
  const button = (text: string) =>
    wrapper.findAll('ion-button').find((candidate) => candidate.text() === text)!;
  const clock = () => wrapper.find('[role="timer"]');
  const finished = () => wrapper.find('[role="status"]');
  return { wrapper, rest, button, clock, finished };
}

const advance = async (seconds: number) => {
  vi.advanceTimersByTime(seconds * 1000);
  await nextTick();
};

it('shows nothing without a rest', () => {
  const { wrapper } = timer(null);
  expect(wrapper.find('ion-footer').exists()).toBe(false);
});

it('counts down in minutes and seconds, the bar shrinking with what is left', async () => {
  const { wrapper, clock } = timer(90);
  expect(clock().text()).toContain('1:30');
  expect(clock().attributes('aria-label')).toBe('Przerwa, zostało 1:30');

  await advance(45);
  expect(clock().attributes('aria-label')).toBe('Przerwa, zostało 0:45');
  expect(wrapper.find<HTMLElement>('.lw-rest__bar').element.style.transform).toBe('scaleX(0.5)');
});

it('"+15 s" and "−15 s" move the end of the rest', async () => {
  const { button, clock } = timer(60);
  await button('+15 s').trigger('click');
  expect(clock().text()).toContain('1:15');
  await button('−15 s').trigger('click');
  await button('−15 s').trigger('click');
  expect(clock().text()).toContain('0:45');
});

it('at the end the countdown gives way to the solid "Przerwa skończona" until it is closed', async () => {
  const { wrapper, button, clock, finished } = timer(30);
  await advance(30);
  expect(clock().exists()).toBe(false);
  expect(finished().text()).toBe('Przerwa skończona');
  // The class is what makes the bar solid, the one moment the timer asks for attention (§5.3).
  expect(wrapper.find('ion-footer').classes()).toContain('is-finished');

  await button('Zamknij').trigger('click');
  expect(wrapper.find('ion-footer').exists()).toBe(false);
});

it('shortened past its end the rest is over at once', async () => {
  const { button, clock, finished } = timer(10);
  await button('−15 s').trigger('click');
  expect(clock().exists()).toBe(false);
  expect(finished().text()).toBe('Przerwa skończona');
});

it('"Pomiń" ends the rest with no finished state, also when its time comes', async () => {
  const { wrapper, button } = timer(60);
  await button('Pomiń').trigger('click');
  expect(wrapper.find('ion-footer').exists()).toBe(false);

  await advance(60);
  expect(wrapper.find('ion-footer').exists()).toBe(false);
});

it('the next set clears a finished rest and counts again', async () => {
  const { rest, clock, finished } = timer(30);
  await advance(30);
  expect(finished().exists()).toBe(true);

  rest.start(45);
  await nextTick();
  expect(finished().exists()).toBe(false);
  expect(clock().text()).toContain('0:45');
});

import { IonicVue } from '@ionic/vue';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../i18n';
import { useThemeStore, type ThemePreference } from '../stores/theme';
import AppPage from './AppPage.vue';

enableAutoUnmount(afterEach);

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: false,
    addEventListener: () => undefined,
  } as unknown as MediaQueryList);
  setActivePinia(createPinia());
});

function page(
  theme: ThemePreference,
  props: { progress?: number; week?: boolean[]; steel?: number },
) {
  useThemeStore().preference = theme;
  return mount(AppPage, {
    global: { plugins: [IonicVue, i18n], stubs: { 'ion-page': false } },
    props: { title: 'Dzień', ...props },
  });
}

it('shows the stage of the steel in the temper theme only', () => {
  const temper = page('temper', { progress: 0.5, steel: 2 });
  const on = temper.findAll('.lw-steel i').filter((layer) => layer.classes('is-on'));
  expect(temper.findAll('.lw-steel i')).toHaveLength(4);
  expect(on.map((layer) => layer.attributes('data-stage'))).toEqual(['2']);

  expect(page('iron', { progress: 0.5, steel: 2 }).find('.lw-steel').exists()).toBe(false);
});

it('leaves a screen without progress with no line and no stages', () => {
  const plain = page('temper', {});
  expect(plain.find('.lw-line').exists()).toBe(false);
  expect(plain.find('.lw-steel').exists()).toBe(false);
});

it('shows a share of 0 too: the line of a day with nothing done yet', () => {
  expect(page('dark', { progress: 0 }).find('.lw-line__fill').exists()).toBe(true);
});

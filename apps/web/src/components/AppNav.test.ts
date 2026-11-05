import { enableAutoUnmount, mount, type DOMWrapper } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { createMemoryHistory, createRouter } from 'vue-router';
import { i18n } from '../i18n';
import AppNav from './AppNav.vue';

enableAutoUnmount(afterEach);

// Ionic's hosts hide their textContent in the test DOM, so the name is read from the markup.
const nameOf = (item: DOMWrapper<Element>) =>
  item
    .find('ion-label')
    .html()
    .replace(/<[^>]*>/g, '')
    .trim();

async function nav(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { template: '<div />' } }],
  });
  await router.push(path);
  const wrapper = mount(AppNav, { global: { plugins: [i18n, router] } });
  const active = () =>
    wrapper
      .findAll('ion-item')
      .filter((item) => item.classes('lw-nav__active'))
      .map(nameOf);
  return { wrapper, router, active };
}

it('lists the sections by name, each linking to its path', async () => {
  const { wrapper } = await nav('/calendar');
  const items = wrapper
    .findAll('ion-item')
    .map((item) => [nameOf(item), item.element.getAttribute('routerlink')]);
  expect(items).toEqual([
    ['Kalendarz', '/calendar'],
    ['Historia', '/history'],
    ['Agent', '/agent'],
    ['Ustawienia', '/settings'],
  ]);
});

it.each([
  ['/calendar', 'Kalendarz'],
  ['/calendar/2026-11-01/workout', 'Kalendarz'],
  ['/history/muscle/chest', 'Historia'],
  ['/agent/threads', 'Agent'],
  ['/settings/models', 'Ustawienia'],
])('on %s marks only %s as the current section', async (path, section) => {
  expect((await nav(path)).active()).toEqual([section]);
});

it('outside the sections marks none', async () => {
  expect((await nav('/pair')).active()).toEqual([]);
});

it('the mark follows navigation', async () => {
  const { wrapper, router, active } = await nav('/calendar');
  await router.push('/settings/profile');
  await wrapper.vm.$nextTick();
  expect(active()).toEqual(['Ustawienia']);
});

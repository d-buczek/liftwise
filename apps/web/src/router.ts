import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from './stores/auth';
import DevicesPage from './views/DevicesPage.vue';
import EmptyPage from './views/EmptyPage.vue';
import EquipmentPage from './views/EquipmentPage.vue';
import PairPage from './views/PairPage.vue';
import SettingsPage from './views/SettingsPage.vue';
import TabsPage from './views/TabsPage.vue';

declare module 'vue-router' {
  interface RouteMeta {
    // A screen without navigation (no tabs, no side menu).
    bare?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/pair', name: 'pair', component: PairPage, meta: { bare: true } },
  {
    path: '/',
    component: TabsPage,
    children: [
      { path: '', redirect: '/calendar' },
      { path: 'calendar', component: EmptyPage, props: { section: 'calendar' } },
      { path: 'history', component: EmptyPage, props: { section: 'history' } },
      { path: 'agent', component: EmptyPage, props: { section: 'agent' } },
      { path: 'settings', component: SettingsPage },
      { path: 'settings/equipment', component: EquipmentPage },
      { path: 'settings/devices', component: DevicesPage },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/calendar' },
];

export const router = createRouter({ history: createWebHistory(), routes });

// Nothing works before pairing, and a paired device has nothing to do on the pairing screen.
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.loaded) await auth.load();
  if (!auth.device && to.name !== 'pair') return { name: 'pair' };
  if (auth.device && to.name === 'pair') return '/calendar';
});

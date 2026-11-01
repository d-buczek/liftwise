import { localDateSchema } from '@liftwise/core';
import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';
import { useAuthStore } from './stores/auth';
import CalendarPage from './views/CalendarPage.vue';
import DayPage from './views/DayPage.vue';
import DevicesPage from './views/DevicesPage.vue';
import EmptyPage from './views/EmptyPage.vue';
import EquipmentPage from './views/EquipmentPage.vue';
import PairPage from './views/PairPage.vue';
import SettingsPage from './views/SettingsPage.vue';
import TabsPage from './views/TabsPage.vue';
import WorkoutPage from './views/WorkoutPage.vue';
import { today } from './workout/calendar';

declare module 'vue-router' {
  interface RouteMeta {
    // A screen without navigation (no tabs, no side menu).
    bare?: boolean;
  }
}

const validDate = (to: RouteLocationNormalized) =>
  localDateSchema.safeParse(to.params.date).success;

// A day and its workout under a section's path keep that tab active. An invalid date goes back
// to the calendar; a future day has no workout to log, only its plan.
function dayRoutes(section: string): RouteRecordRaw[] {
  const dayHref = (route: RouteLocationNormalized) => `/${section}/${String(route.params.date)}`;
  return [
    {
      path: `${section}/:date`,
      component: DayPage,
      props: (route) => ({
        date: route.params.date,
        backHref: `/${section}`,
        workoutHref: `${dayHref(route)}/workout`,
      }),
      beforeEnter: (to) => (validDate(to) ? true : '/calendar'),
    },
    {
      path: `${section}/:date/workout`,
      component: WorkoutPage,
      props: (route) => ({
        date: route.params.date,
        exerciseId: typeof route.query.exercise === 'string' ? route.query.exercise || null : null,
        dayHref: dayHref(route),
      }),
      beforeEnter: (to) => {
        if (!validDate(to)) return '/calendar';
        return String(to.params.date) <= today() ? true : dayHref(to);
      },
    },
  ];
}

const routes: RouteRecordRaw[] = [
  { path: '/pair', name: 'pair', component: PairPage, meta: { bare: true } },
  {
    path: '/',
    component: TabsPage,
    children: [
      { path: '', redirect: '/calendar' },
      { path: 'calendar', component: CalendarPage },
      ...dayRoutes('calendar'),
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

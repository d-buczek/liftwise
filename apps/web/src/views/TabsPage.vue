<script setup lang="ts">
import {
  IonIcon,
  IonLabel,
  IonPage,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/vue';
import { onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { SECTIONS, sectionStep } from '../navigation';

const { t } = useI18n();
const route = useRoute();

// Ionic switches tabs without a transition, so the new tab's page slides in from the side it sits
// on. A transform in px and opacity run on the compositor, at the display's refresh rate.
let shown = route.path;

// Only a tap on a tab or the side menu is a tab switch: a link across sections and the back button
// already get Ionic's own transition, and a second one on top would flicker.
const TAP_WINDOW_MS = 500;
let tappedAt = Number.NEGATIVE_INFINITY;

function noteTap(event: Event) {
  if ((event.target as Element).closest('ion-tab-button, ion-menu')) tappedAt = performance.now();
}

function slideIn(event: Event) {
  const step = sectionStep(shown, route.path);
  shown = route.path;
  if (step === 0 || performance.now() - tappedAt > TAP_WINDOW_MS) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  (event.target as HTMLElement).animate(
    [
      { opacity: 0, transform: `translate3d(${step * 32}px, 0, 0)` },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 200, easing: 'cubic-bezier(0.36, 0.66, 0.04, 1)' },
  );
}

// The lifecycle event doesn't bubble, so it is caught on its way down.
onMounted(() => {
  document.addEventListener('ionViewWillEnter', slideIn, true);
  document.addEventListener('click', noteTap, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('ionViewWillEnter', slideIn, true);
  document.removeEventListener('click', noteTap, true);
});
</script>

<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet />
      <!-- Hidden from the split-pane breakpoint up, where the side menu takes over. -->
      <ion-tab-bar slot="bottom">
        <ion-tab-button
          v-for="section in SECTIONS"
          :key="section.tab"
          :tab="section.tab"
          :href="section.path"
        >
          <ion-icon :icon="section.icon" aria-hidden="true" />
          <ion-label>{{ t(`nav.${section.tab}`) }}</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

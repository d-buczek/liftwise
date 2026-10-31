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
import { useI18n } from 'vue-i18n';
import { SECTIONS } from '../navigation';

const { t } = useI18n();
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

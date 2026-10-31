<script setup lang="ts">
import {
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSegment,
  IonSegmentButton,
} from '@ionic/vue';
import { barbellOutline, phonePortraitOutline } from 'ionicons/icons';
import { useI18n } from 'vue-i18n';
import AppPage from '../components/AppPage.vue';
import SyncStatus from '../components/SyncStatus.vue';
import { useLiveQuery } from '../composables/liveQuery';
import { db } from '../db/database';
import { THEME_PREFERENCES, useThemeStore } from '../stores/theme';

const { t } = useI18n();
const theme = useThemeStore();
const equipmentCount = useLiveQuery(
  () => db.equipment_items.filter((row) => row.deleted_at === null).count(),
  0,
);
</script>

<template>
  <app-page :title="t('nav.settings')">
    <ion-list class="lw-settings__first">
      <ion-item router-link="/settings/equipment">
        <ion-icon slot="start" :icon="barbellOutline" aria-hidden="true" />
        <ion-label>{{ t('settings.equipment') }}</ion-label>
        <ion-note slot="end">{{ t('settings.equipmentCount', equipmentCount) }}</ion-note>
      </ion-item>
      <ion-item router-link="/settings/devices">
        <ion-icon slot="start" :icon="phonePortraitOutline" aria-hidden="true" />
        <ion-label>{{ t('settings.devices') }}</ion-label>
      </ion-item>
    </ion-list>

    <h2 class="lw-heading">{{ t('sync.title') }}</h2>
    <ion-list>
      <sync-status />
    </ion-list>

    <h2 class="lw-heading">{{ t('settings.appearance') }}</h2>
    <ion-segment v-model="theme.preference" :aria-label="t('settings.theme.label')">
      <ion-segment-button v-for="value in THEME_PREFERENCES" :key="value" :value="value">
        <ion-label>{{ t(`settings.theme.${value}`) }}</ion-label>
      </ion-segment-button>
    </ion-segment>
  </app-page>
</template>

<style scoped>
.lw-settings__first {
  margin-top: 16px;
}
</style>

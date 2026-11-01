<script setup lang="ts">
import { DEFAULT_TRAINING_SETTINGS, type TrainingSettings } from '@liftwise/core';
import {
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonSegment,
  IonSegmentButton,
} from '@ionic/vue';
import { barbellOutline, phonePortraitOutline, timerOutline } from 'ionicons/icons';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppPage from '../components/AppPage.vue';
import SyncStatus from '../components/SyncStatus.vue';
import TrainingSettingsEditor from '../components/TrainingSettingsEditor.vue';
import { useFormat } from '../composables/format';
import { useLiveQuery } from '../composables/liveQuery';
import { db } from '../db/database';
import { THEME_PREFERENCES, useThemeStore } from '../stores/theme';
import { saveTrainingSettings } from '../workout/actions';
import { trainingSettings } from '../workout/queries';

const { t } = useI18n();
const format = useFormat();
const theme = useThemeStore();
const equipmentCount = useLiveQuery(
  () => db.equipment_items.filter((row) => row.deleted_at === null).count(),
  0,
);
const training = useLiveQuery(trainingSettings, DEFAULT_TRAINING_SETTINGS);
const editingTraining = ref(false);

const trainingSummary = computed(() => {
  const { rest_seconds, target_rir, weight_step_kg } = training.value;
  return t('training.summary', {
    rest: format.rest(rest_seconds),
    rir: format.rirRange(target_rir),
    step: format.kg(weight_step_kg),
  });
});

async function saveTraining(value: TrainingSettings) {
  editingTraining.value = false;
  await saveTrainingSettings(value);
}
</script>

<template>
  <app-page :title="t('nav.settings')">
    <ion-list class="lw-settings__first">
      <ion-item router-link="/settings/equipment">
        <ion-icon slot="start" :icon="barbellOutline" aria-hidden="true" />
        <ion-label>{{ t('settings.equipment') }}</ion-label>
        <ion-note slot="end">{{ t('settings.equipmentCount', equipmentCount) }}</ion-note>
      </ion-item>
      <ion-item button @click="editingTraining = true">
        <ion-icon slot="start" :icon="timerOutline" aria-hidden="true" />
        <ion-label>
          {{ t('training.title') }}
          <p>{{ trainingSummary }}</p>
        </ion-label>
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

    <ion-modal
      :is-open="editingTraining"
      :initial-breakpoint="1"
      :breakpoints="[0, 1]"
      class="lw-sheet"
      @did-dismiss="editingTraining = false"
    >
      <training-settings-editor
        v-if="editingTraining"
        :settings="training"
        @save="saveTraining"
        @close="editingTraining = false"
      />
    </ion-modal>
  </app-page>
</template>

<style scoped>
.lw-settings__first {
  margin-top: 16px;
}
</style>

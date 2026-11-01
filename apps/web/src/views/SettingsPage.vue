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
  toastController,
} from '@ionic/vue';
import {
  barbellOutline,
  bodyOutline,
  downloadOutline,
  gridOutline,
  phonePortraitOutline,
  pricetagOutline,
  timerOutline,
} from 'ionicons/icons';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppPage from '../components/AppPage.vue';
import SyncStatus from '../components/SyncStatus.vue';
import TrainingSettingsEditor from '../components/TrainingSettingsEditor.vue';
import { useFormat } from '../composables/format';
import { useLiveQuery } from '../composables/liveQuery';
import { useToday } from '../composables/today';
import { db } from '../db/database';
import { exportCsv, exportJson } from '../db/export';
import { saveFile } from '../native/files';
import { useSyncStore } from '../stores/sync';
import { THEME_PREFERENCES, useThemeStore } from '../stores/theme';
import { saveTrainingSettings } from '../workout/actions';
import { trainingSettings, workoutLabels } from '../workout/queries';

const { t, d } = useI18n();
const format = useFormat();
const theme = useThemeStore();
const equipmentCount = useLiveQuery(
  () => db.equipment_items.filter((row) => row.deleted_at === null).count(),
  0,
);
const labelCount = useLiveQuery(
  async () => (await workoutLabels()).filter((label) => !label.archived).length,
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

// Settings → Dane (§5.12): files from the local mirror, so the export works offline.
const sync = useSyncStore();
const today = useToday();
const exporting = ref(false);
const exportNote = computed(() =>
  sync.syncedAt
    ? t('data.note', { time: d(new Date(sync.syncedAt), 'dayTime') })
    : t('data.noteNever'),
);

async function exportData(kind: 'json' | 'csv') {
  exporting.value = true;
  try {
    await saveFile(await (kind === 'json' ? exportJson(today.value) : exportCsv(today.value)));
  } catch (error) {
    console.error(error);
    const toast = await toastController.create({ message: t('data.failed'), duration: 4000 });
    await toast.present();
  } finally {
    exporting.value = false;
  }
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
      <ion-item router-link="/settings/balance">
        <ion-icon slot="start" :icon="bodyOutline" aria-hidden="true" />
        <ion-label>
          {{ t('balance.settings') }}
          <p>{{ t('balance.settingsSummary') }}</p>
        </ion-label>
      </ion-item>
      <ion-item router-link="/settings/labels">
        <ion-icon slot="start" :icon="pricetagOutline" aria-hidden="true" />
        <ion-label>{{ t('labels.title') }}</ion-label>
        <ion-note slot="end">{{ t('labels.count', labelCount) }}</ion-note>
      </ion-item>
      <ion-item router-link="/settings/devices">
        <ion-icon slot="start" :icon="phonePortraitOutline" aria-hidden="true" />
        <ion-label>{{ t('settings.devices') }}</ion-label>
      </ion-item>
    </ion-list>

    <h2 class="lw-heading">{{ t('data.title') }}</h2>
    <ion-list>
      <ion-item button :detail="false" :disabled="exporting" @click="exportData('json')">
        <ion-icon slot="start" :icon="downloadOutline" aria-hidden="true" />
        <ion-label>
          {{ t('data.json') }}
          <p>{{ t('data.jsonHint') }}</p>
        </ion-label>
      </ion-item>
      <ion-item button :detail="false" :disabled="exporting" @click="exportData('csv')">
        <ion-icon slot="start" :icon="gridOutline" aria-hidden="true" />
        <ion-label>
          {{ t('data.csv') }}
          <p>{{ t('data.csvHint') }}</p>
        </ion-label>
      </ion-item>
    </ion-list>
    <p class="lw-settings__note">{{ exportNote }}</p>

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

.lw-settings__note {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--lw-muted);
}
</style>

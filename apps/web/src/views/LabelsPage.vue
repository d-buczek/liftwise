<script setup lang="ts">
import type { WorkoutLabel } from '@liftwise/core';
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonModal, IonNote } from '@ionic/vue';
import { add } from 'ionicons/icons';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppPage from '../components/AppPage.vue';
import LabelChip from '../components/LabelChip.vue';
import LabelEditor from '../components/LabelEditor.vue';
import { useLiveQuery } from '../composables/liveQuery';
import { saveLabel } from '../workout/actions';
import { workoutLabels } from '../workout/queries';

// Settings → Etykiety treningów (D48): add a label, rename it, change its color or archive it.
const { t } = useI18n();
const labels = useLiveQuery(workoutLabels, []);

const editorOpen = ref(false);
const editing = ref<WorkoutLabel | null>(null);

function open(label: WorkoutLabel | null) {
  editing.value = label;
  editorOpen.value = true;
}

async function save(label: WorkoutLabel) {
  editorOpen.value = false;
  await saveLabel(label);
}
</script>

<template>
  <app-page :title="t('labels.title')" back-href="/settings">
    <template #actions>
      <ion-button :aria-label="t('labels.add')" @click="open(null)">
        <ion-icon slot="icon-only" :icon="add" aria-hidden="true" />
      </ion-button>
    </template>

    <!-- A stable parent: Ionic moves the open modal, so it can't be the anchor of the v-if. -->
    <div>
      <ion-list v-if="labels.length > 0" class="lw-labels">
        <ion-item v-for="label in labels" :key="label.id" button @click="open(label)">
          <label-chip
            slot="start"
            :label="label"
            :class="{ 'lw-labels__archived': label.archived }"
          />
          <ion-label :class="{ 'lw-muted': label.archived }">
            {{ t(`labels.colors.${label.color}`) }}
          </ion-label>
          <ion-note v-if="label.archived" slot="end">{{ t('labels.archived') }}</ion-note>
        </ion-item>
      </ion-list>
      <div v-else class="lw-labels__empty">
        <p>{{ t('labels.empty') }}</p>
        <ion-button @click="open(null)">{{ t('labels.add') }}</ion-button>
      </div>
    </div>

    <ion-modal
      :is-open="editorOpen"
      :initial-breakpoint="1"
      :breakpoints="[0, 1]"
      class="lw-sheet"
      @did-dismiss="editorOpen = false"
    >
      <label-editor
        v-if="editorOpen"
        :label="editing"
        :labels="labels"
        @save="save"
        @close="editorOpen = false"
      />
    </ion-modal>
  </app-page>
</template>

<style scoped>
.lw-labels {
  margin-top: 16px;
}

.lw-labels__archived {
  opacity: 0.55;
}

.lw-labels__empty {
  max-width: 48ch;
  padding-top: 24px;
}
</style>

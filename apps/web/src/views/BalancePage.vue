<script setup lang="ts">
import {
  DEFAULT_BALANCE_SETTINGS,
  muscleGroupSchema,
  type MuscleGroup,
  type Range,
} from '@liftwise/core';
import { IonItem, IonLabel, IonList, IonModal, IonNote } from '@ionic/vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppPage from '../components/AppPage.vue';
import BalanceRangeEditor from '../components/BalanceRangeEditor.vue';
import { useFormat } from '../composables/format';
import { useLiveQuery } from '../composables/liveQuery';
import { saveBalanceSettings } from '../workout/actions';
import { balanceSettings } from '../workout/queries';

// Settings → Balans (§5.10): the weekly hard-set target of every muscle group (§5.8).
const { t } = useI18n();
const format = useFormat();
const balance = useLiveQuery(balanceSettings, DEFAULT_BALANCE_SETTINGS);

const editing = ref<MuscleGroup | null>(null);

async function save(range: Range) {
  const group = editing.value;
  editing.value = null;
  if (!group) return;
  await saveBalanceSettings({ weekly_sets: { ...balance.value.weekly_sets, [group]: range } });
}
</script>

<template>
  <app-page :title="t('balance.settings')" back-href="/settings">
    <p class="lw-balance__hint">{{ t('balance.settingsHint') }}</p>
    <ion-list>
      <ion-item
        v-for="group in muscleGroupSchema.options"
        :key="group"
        button
        @click="editing = group"
      >
        <ion-label>{{ format.sentence(format.muscle(group)) }}</ion-label>
        <ion-note slot="end" class="lw-balance__range lw-fig">
          {{ balance.weekly_sets[group].min }}–{{ balance.weekly_sets[group].max }}
        </ion-note>
      </ion-item>
    </ion-list>

    <ion-modal
      :is-open="editing !== null"
      :initial-breakpoint="1"
      :breakpoints="[0, 1]"
      class="lw-sheet"
      @did-dismiss="editing = null"
    >
      <balance-range-editor
        v-if="editing"
        :group="editing"
        :range="balance.weekly_sets[editing]"
        @save="save"
        @close="editing = null"
      />
    </ion-modal>
  </app-page>
</template>

<style scoped>
.lw-balance__hint {
  max-width: 60ch;
  margin: 16px 0 12px;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-balance__range {
  font-size: 16px;
  color: var(--ion-text-color);
}
</style>

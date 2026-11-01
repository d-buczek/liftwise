<script setup lang="ts">
import type { Exercise } from '@liftwise/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/format';
import { useLiveQuery } from '../composables/liveQuery';
import { catalog, equipment, historySets } from '../workout/queries';
import { pickerSections } from '../workout/search';

// Picking an exercise (§5.2): search by name and aliases, recent ones first; for "Zamień" the
// similar ones come before them. `exclude` are exercises not offered (the day's own).
const props = defineProps<{ swapFor?: Exercise | null; exclude?: string[] }>();
const emit = defineEmits<{ pick: [exercise: Exercise]; close: [] }>();

const { t } = useI18n();
const format = useFormat();
const query = ref('');

const data = useLiveQuery(
  async () => ({
    catalog: await catalog(),
    equipment: await equipment(),
    sets: await historySets(),
  }),
  { catalog: [], equipment: [], sets: [] },
);

const sections = computed(() =>
  pickerSections({
    ...data.value,
    query: query.value,
    swapFor: props.swapFor,
    exclude: props.exclude,
  }),
);
</script>

<template>
  <ion-header>
    <ion-toolbar>
      <ion-title>
        {{ swapFor ? t('picker.titleSwap', { name: swapFor.name_pl }) : t('picker.title') }}
      </ion-title>
      <ion-buttons slot="end">
        <ion-button @click="emit('close')">{{ t('common.cancel') }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
    <ion-toolbar>
      <ion-searchbar
        v-model="query"
        class="lw-picker__search"
        :placeholder="t('picker.search')"
        :debounce="100"
      />
    </ion-toolbar>
  </ion-header>
  <ion-content>
    <div class="lw-column">
      <template v-for="section in sections" :key="section.key">
        <h2 class="lw-heading">{{ t(`picker.${section.key}`) }}</h2>
        <ion-list>
          <ion-item
            v-for="exercise in section.exercises"
            :key="exercise.id"
            button
            :detail="false"
            @click="emit('pick', exercise)"
          >
            <ion-label>
              <h3>{{ exercise.name_pl }}</h3>
              <p>{{ format.muscles(exercise) }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
      </template>
      <p v-if="sections.length === 0" class="lw-muted lw-picker__empty">
        {{ t('picker.empty', { query }) }}
      </p>
    </div>
  </ion-content>
</template>

<style scoped>
.lw-picker__search {
  --box-shadow: none;
  padding-inline: 0;
}

.lw-picker__empty {
  padding-top: 24px;
}

h3 {
  font-size: 16px;
  font-weight: 600;
}
</style>

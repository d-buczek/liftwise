<script setup lang="ts">
import type { EquipmentItem, SyncRow } from '@liftwise/core';
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonModal } from '@ionic/vue';
import { add } from 'ionicons/icons';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppPage from '../components/AppPage.vue';
import EquipmentEditor from '../components/EquipmentEditor.vue';
import { useLiveQuery } from '../composables/liveQuery';
import { db } from '../db/database';
import { equipmentFields } from '../equipment/fields';

const { t, n } = useI18n();

const items = useLiveQuery(
  () => db.equipment_items.filter((row) => row.deleted_at === null).sortBy('created_at'),
  [],
);

const editorOpen = ref(false);
const editing = ref<EquipmentItem | null>(null);

function open(item: EquipmentItem | null) {
  editing.value = item;
  editorOpen.value = true;
}

// One line per item from its props: toggles that are on, numbers with their unit.
function summary(item: SyncRow<'equipment_items'>): string {
  const props: Record<string, unknown> = item.props;
  const parts = equipmentFields(item.type).flatMap((field) => {
    const value = props[field.key];
    const base = `equipment.props.${item.type}.${field.key}`;
    if (field.kind === 'boolean') return value === true ? [t(`${base}.summary`)] : [];
    return typeof value === 'number'
      ? [t(`${base}.summary`, { value: n(value, 'kg') })]
      : [t(`${base}.empty`)];
  });
  return parts.length > 0 ? parts.join(', ') : t('equipment.noOptions');
}
</script>

<template>
  <app-page :title="t('settings.equipment')" back-href="/settings">
    <template #actions>
      <ion-button :aria-label="t('equipment.add')" @click="open(null)">
        <ion-icon slot="icon-only" :icon="add" aria-hidden="true" />
      </ion-button>
    </template>

    <!-- A stable parent: Ionic moves the open modal, so it can't be the anchor of the v-if. -->
    <div>
      <ion-list v-if="items.length > 0" class="lw-equipment">
        <ion-item v-for="item in items" :key="item.id" button @click="open(item)">
          <ion-label>
            <h2>{{ t(`equipment.types.${item.type}`) }}</h2>
            <p>{{ summary(item) }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
      <div v-else class="lw-equipment__empty">
        <p>{{ t('equipment.empty') }}</p>
        <ion-button @click="open(null)">{{ t('equipment.add') }}</ion-button>
      </div>
    </div>

    <ion-modal :is-open="editorOpen" @did-dismiss="editorOpen = false">
      <equipment-editor :item="editing" @done="editorOpen = false" />
    </ion-modal>
  </app-page>
</template>

<style scoped>
.lw-equipment {
  margin-top: 16px;
}

.lw-equipment h2 {
  font-size: 27px;
  font-family: var(--lw-font-display);
  font-weight: 800;
}

.lw-equipment__empty {
  max-width: 48ch;
  padding-top: 24px;
}
</style>

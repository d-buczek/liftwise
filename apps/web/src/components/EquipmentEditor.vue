<script setup lang="ts">
import { newId, type EquipmentItem, type EquipmentType } from '@liftwise/core';
import {
  alertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { applyLocal } from '../db/mutate';
import {
  draftOf,
  equipmentFields,
  EQUIPMENT_TYPES,
  itemFromDraft,
  type EquipmentDraft,
} from '../equipment/fields';

// Edits one equipment item (null adds one); the fields come from the type's schema (§5.6).
const props = defineProps<{ item: EquipmentItem | null }>();
const emit = defineEmits<{ done: [] }>();

const { t, te } = useI18n();
const type = ref<EquipmentType>(props.item?.type ?? 'dumbbells');
const draft = ref<EquipmentDraft>(draftOf(type.value, props.item?.props));
const invalid = ref<string[]>([]);
const fields = computed(() => equipmentFields(type.value));

// Only a new item can change its type.
watch(type, (value) => {
  draft.value = draftOf(value);
  invalid.value = [];
});

const label = (key: string) => t(`equipment.props.${type.value}.${key}.label`);
const hint = (key: string) => {
  const path = `equipment.props.${type.value}.${key}.hint`;
  return te(path) ? t(path) : undefined;
};

// Stays set after a save: a tap while the sheet closes must not add the item again.
let saving = false;

async function save() {
  if (saving) return;
  const result = itemFromDraft(props.item?.id ?? newId(), type.value, draft.value);
  if ('invalid' in result) {
    invalid.value = result.invalid;
    return;
  }
  saving = true;
  try {
    await applyLocal([{ op: 'upsert', entity: 'equipment_items', row: result.item }]);
    emit('done');
  } catch (error) {
    saving = false;
    throw error;
  }
}

async function remove() {
  const item = props.item;
  if (!item) return;
  const alert = await alertController.create({
    header: t('equipment.deleteTitle'),
    message: t('equipment.deleteMessage', { name: t(`equipment.types.${item.type}`) }),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('common.delete'), role: 'destructive' },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  if (role !== 'destructive') return;
  await applyLocal([{ op: 'delete', entity: 'equipment_items', row: { id: item.id } }]);
  emit('done');
}
</script>

<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="emit('done')">{{ t('common.cancel') }}</ion-button>
      </ion-buttons>
      <ion-title>{{ item ? t('equipment.edit') : t('equipment.add') }}</ion-title>
      <ion-buttons slot="end">
        <ion-button :strong="true" @click="save">{{ t('common.save') }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
  <ion-content>
    <div class="lw-column">
      <ion-list>
        <ion-item v-if="item === null">
          <ion-select v-model="type" :label="t('equipment.type')" interface="popover">
            <ion-select-option v-for="value in EQUIPMENT_TYPES" :key="value" :value="value">
              {{ t(`equipment.types.${value}`) }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item v-for="field in fields" :key="`${type}-${field.key}`">
          <ion-toggle
            v-if="field.kind === 'boolean'"
            :checked="draft[field.key] === true"
            @ion-change="draft[field.key] = $event.detail.checked"
          >
            {{ label(field.key) }}
          </ion-toggle>
          <ion-input
            v-else
            :value="String(draft[field.key])"
            :label="label(field.key)"
            label-placement="stacked"
            inputmode="decimal"
            :helper-text="hint(field.key)"
            :error-text="t('equipment.invalidNumber')"
            :class="{ 'ion-invalid ion-touched': invalid.includes(field.key) }"
            @ion-input="draft[field.key] = String($event.detail.value ?? '')"
            @keyup.enter="save"
          />
        </ion-item>
      </ion-list>
      <ion-button v-if="item" class="lw-editor__delete" color="danger" fill="clear" @click="remove">
        {{ t('common.delete') }}
      </ion-button>
    </div>
  </ion-content>
</template>

<style scoped>
.lw-editor__delete {
  margin-top: 24px;
}
</style>

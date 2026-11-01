<script setup lang="ts">
import {
  LABEL_COLORS,
  LABEL_NAME_MAX,
  labelNameTaken,
  newId,
  nextLabelColor,
  workoutLabelSchema,
  type LabelColor,
  type WorkoutLabel,
} from '@liftwise/core';
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/vue';
import { checkmark } from 'ionicons/icons';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// A new or edited workout label (D48): a short name, a color from the palette and, for an
// existing label, the archive switch. `labels` are all labels, for the name check and the color
// a new one starts with.
const props = defineProps<{ label: WorkoutLabel | null; labels: WorkoutLabel[] }>();
const emit = defineEmits<{ save: [label: WorkoutLabel]; close: [] }>();

const { t } = useI18n();
const name = ref(props.label?.name ?? '');
const color = ref<LabelColor>(props.label?.color ?? nextLabelColor(props.labels));
const archived = ref(props.label?.archived ?? false);
const touched = ref(false);

const error = computed(() => {
  const value = name.value.trim();
  if (value.length === 0) return t('labels.nameEmpty');
  if (!archived.value && labelNameTaken(props.labels, value, props.label?.id)) {
    return t('labels.nameTaken');
  }
  return null;
});

function save() {
  touched.value = true;
  if (error.value) return;
  emit(
    'save',
    workoutLabelSchema.parse({
      id: props.label?.id ?? newId(),
      name: name.value,
      color: color.value,
      archived: archived.value,
    }),
  );
}
</script>

<template>
  <ion-header>
    <ion-toolbar>
      <ion-title>{{ label ? t('labels.edit') : t('labels.new') }}</ion-title>
      <ion-buttons slot="end">
        <ion-button @click="emit('close')">{{ t('common.cancel') }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
  <div class="lw-sheet__body">
    <div class="lw-column lw-label-editor">
      <ion-list>
        <ion-item>
          <ion-input
            v-model="name"
            :label="t('labels.name')"
            label-placement="stacked"
            :maxlength="LABEL_NAME_MAX"
            :counter="true"
            :helper-text="t('labels.nameHint')"
            :error-text="error ?? ''"
            :class="{ 'ion-invalid ion-touched': touched && error }"
            @keyup.enter="save"
          />
        </ion-item>
      </ion-list>
      <div role="radiogroup" :aria-label="t('labels.color')">
        <span class="lw-label-editor__caption">{{ t('labels.color') }}</span>
        <div class="lw-label-editor__colors">
          <button
            v-for="value in LABEL_COLORS"
            :key="value"
            type="button"
            role="radio"
            class="lw-label-editor__color"
            :style="{ '--lw-label': `var(--lw-label-${value})` }"
            :aria-checked="color === value"
            :aria-label="t(`labels.colors.${value}`)"
            @click="color = value"
          >
            <ion-icon v-if="color === value" :icon="checkmark" aria-hidden="true" />
          </button>
        </div>
      </div>
      <ion-list v-if="label">
        <ion-item>
          <ion-toggle v-model="archived">
            <ion-label>
              {{ t('labels.archive') }}
              <p>{{ t('labels.archiveHint') }}</p>
            </ion-label>
          </ion-toggle>
        </ion-item>
      </ion-list>
      <ion-button class="lw-label-editor__save" @click="save">{{ t('common.save') }}</ion-button>
    </div>
  </div>
</template>

<style scoped>
.lw-label-editor {
  display: grid;
  gap: 24px;
  padding-top: 16px;
}

.lw-label-editor__caption {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-label-editor__colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lw-label-editor__color {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  padding: 0;
  font-size: 24px;
  color: var(--lw-label-contrast);
  background: var(--lw-label);
  border: 0;
  border-radius: 12px;
  cursor: pointer;
}

.lw-label-editor__color[aria-checked='true'] {
  outline: 3px solid var(--ion-text-color);
  outline-offset: 2px;
}

.lw-label-editor__save {
  justify-self: end;
  width: 100%;
  max-width: 240px;
  height: 48px;
  margin: 0;
}
</style>

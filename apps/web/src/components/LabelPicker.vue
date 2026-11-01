<script setup lang="ts">
import type { WorkoutLabel } from '@liftwise/core';
import { IonButton, IonButtons, IonHeader, IonTitle, IonToolbar } from '@ionic/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import LabelChip from './LabelChip.vue';
import LabelEditor from './LabelEditor.vue';

// The day's label (D48): one tap on a label or "Bez etykiety"; "Nowa etykieta" opens the editor
// in place and the new label goes to the day. Archived labels are not offered.
const props = defineProps<{ labels: WorkoutLabel[]; current: string | null }>();
const emit = defineEmits<{
  pick: [labelId: string | null];
  create: [label: WorkoutLabel];
  close: [];
}>();

const { t } = useI18n();
const creating = ref(false);
const options = computed(() =>
  props.labels.filter((label) => !label.archived || label.id === props.current),
);
</script>

<template>
  <label-editor
    v-if="creating"
    :label="null"
    :labels="labels"
    @save="(label) => emit('create', label)"
    @close="creating = false"
  />
  <template v-else>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('labels.pick') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="emit('close')">{{ t('common.cancel') }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <div class="lw-sheet__body">
      <div class="lw-column lw-label-picker">
        <div class="lw-label-picker__options" role="radiogroup" :aria-label="t('labels.pick')">
          <button
            v-for="label in options"
            :key="label.id"
            type="button"
            role="radio"
            class="lw-label-picker__option"
            :aria-checked="label.id === current"
            @click="emit('pick', label.id)"
          >
            <label-chip :label="label" />
          </button>
          <button
            type="button"
            role="radio"
            class="lw-label-picker__option"
            :aria-checked="current === null"
            @click="emit('pick', null)"
          >
            {{ t('labels.none') }}
          </button>
        </div>
        <p v-if="labels.length === 0" class="lw-muted lw-label-picker__hint">
          {{ t('labels.emptyHint') }}
        </p>
        <ion-button fill="outline" class="lw-label-picker__new" @click="creating = true">
          {{ t('labels.new') }}
        </ion-button>
      </div>
    </div>
  </template>
</template>

<style scoped>
.lw-label-picker {
  padding-top: 16px;
}

.lw-label-picker__options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lw-label-picker__option {
  min-width: 64px;
  height: 48px;
  padding: 0 12px;
  font-family: inherit;
  font-size: 16px;
  color: var(--ion-text-color);
  background: transparent;
  border: 1px solid var(--lw-border);
  border-radius: 12px;
  cursor: pointer;
}

.lw-label-picker__option[aria-checked='true'] {
  border-color: var(--ion-text-color);
  box-shadow: inset 0 0 0 1px var(--ion-text-color);
}

.lw-label-picker__hint {
  margin: 12px 0 0;
  font-size: 14px;
}

.lw-label-picker__new {
  margin: 16px 0 0;
}
</style>

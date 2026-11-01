<script setup lang="ts">
import type { Exercise, WorkoutSet } from '@liftwise/core';
import { IonButton, IonIcon } from '@ionic/vue';
import { add, checkmark, ellipsisHorizontal } from 'ionicons/icons';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/format';

// One exercise of a day: its sets as tiles (planned outlined, done solid, like the calendar),
// the setup note and the progression hint chip (§5.2).
defineProps<{ exercise: Exercise | undefined; sets: WorkoutSet[]; hint: string | null }>();
const emit = defineEmits<{
  editSet: [set: WorkoutSet];
  addSet: [];
  applyHint: [];
  actions: [];
}>();

const { t } = useI18n();
const format = useFormat();

function setLabel(set: WorkoutSet, index: number): string {
  const state = [t(`day.${set.status}`), ...(set.warmup ? [t('day.warmup')] : [])].join(', ');
  return `${t('day.setLabel', { n: index + 1, value: format.set(set) })}, ${state}`;
}
</script>

<template>
  <article class="lw-block">
    <header class="lw-block__head">
      <h2 class="lw-block__name">{{ format.exerciseName(exercise) }}</h2>
      <ion-button
        fill="clear"
        class="lw-block__more"
        :aria-label="t('day.exerciseActions', { name: format.exerciseName(exercise) })"
        @click="emit('actions')"
      >
        <ion-icon slot="icon-only" :icon="ellipsisHorizontal" aria-hidden="true" />
      </ion-button>
    </header>
    <p v-if="exercise?.note" class="lw-block__note">{{ exercise.note }}</p>
    <button
      v-if="hint"
      type="button"
      class="lw-block__hint lw-num"
      :aria-label="t('hint.apply', { hint })"
      @click="emit('applyHint')"
    >
      {{ hint }}
    </button>

    <ol class="lw-block__sets">
      <li v-for="(set, index) in sets" :key="set.id">
        <button
          type="button"
          class="lw-tile"
          :class="{ 'is-done': set.status === 'done', 'is-warmup': set.warmup }"
          :aria-label="setLabel(set, index)"
          @click="emit('editSet', set)"
        >
          <span v-if="set.warmup" class="lw-tile__tag">{{ t('day.warmupShort') }}</span>
          <span class="lw-tile__weight lw-num">
            {{ format.kg(set.weight_kg) }}<small>{{ t('set.kg') }}</small>
          </span>
          <span class="lw-tile__value lw-num">
            {{
              set.duration_s === null
                ? t('set.times', { value: set.reps ?? 0 })
                : t('set.timeValue', { value: set.duration_s })
            }}
          </span>
          <ion-icon
            v-if="set.status === 'done'"
            class="lw-tile__check"
            :icon="checkmark"
            aria-hidden="true"
          />
        </button>
      </li>
      <li>
        <button
          type="button"
          class="lw-tile is-add"
          :aria-label="t('day.addSet')"
          @click="emit('addSet')"
        >
          <ion-icon :icon="add" aria-hidden="true" />
        </button>
      </li>
    </ol>
  </article>
</template>

<style scoped>
.lw-block {
  padding: 12px 16px 16px;
}

.lw-block + .lw-block {
  border-top: 1px solid var(--lw-border);
}

.lw-block__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lw-block__name {
  flex: 1;
  margin: 0;
  font-size: 20px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
  line-height: 1.2;
}

.lw-block__more {
  margin: -8px -12px -8px 0;
  --color: var(--lw-muted);
}

.lw-block__note {
  margin: 2px 0 0;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-block__hint {
  min-height: 36px;
  margin-top: 8px;
  padding: 0 12px;
  font-family: inherit;
  font-size: 16px;
  color: var(--ion-color-primary);
  background: transparent;
  border: 1px solid var(--ion-color-primary);
  border-radius: 18px;
  cursor: pointer;
}

.lw-block__sets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.lw-tile {
  position: relative;
  display: grid;
  align-content: center;
  justify-items: start;
  min-width: 76px;
  min-height: 64px;
  padding: 6px 10px;
  font-family: inherit;
  color: var(--ion-text-color);
  text-align: left;
  background: transparent;
  border: 1px solid var(--lw-border);
  border-radius: 10px;
  cursor: pointer;
}

.lw-tile__weight {
  font-size: 20px;
  line-height: 1.1;
}

.lw-tile__weight small {
  margin-left: 2px;
  font-size: 13px;
  font-weight: 600;
  opacity: 0.75;
}

.lw-tile__value {
  font-size: 16px;
  line-height: 1.2;
}

.lw-tile__tag {
  font-size: 13px;
  line-height: 1.1;
  opacity: 0.8;
}

.lw-tile.is-warmup {
  border-style: dashed;
}

.lw-tile.is-done {
  color: var(--ion-color-primary-contrast);
  background: var(--ion-color-primary);
  border-color: var(--ion-color-primary);
}

.lw-tile__check {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 14px;
}

.lw-tile.is-add {
  justify-items: center;
  min-width: 56px;
  font-size: 24px;
  color: var(--lw-muted);
  border-style: dashed;
}

.lw-tile:hover:not(.is-done) {
  background: var(--ion-background-color-step-50);
}
</style>

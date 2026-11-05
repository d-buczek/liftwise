<script setup lang="ts">
import { copyWorkout, defaultCopySource } from '@liftwise/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/format';
import { useLiveQuery } from '../composables/liveQuery';
import { copyDay, type CopyResult } from '../workout/actions';
import { dayLabels, dayMarks, monthOf } from '../workout/calendar';
import { exerciseBlocks } from '../workout/day';
import {
  allWorkouts,
  catalog,
  historySets,
  trainingSettings,
  workoutLabels,
} from '../workout/queries';
import LabelChip from './LabelChip.vue';
import MonthCalendar from './MonthCalendar.vue';

// "Kopiuj trening" (§5.2): pick the source day, by default the last workout before the target,
// or the last one with a label (D48), see what will be planned and copy; the light switch is
// "Kopiuj jako lżejszy" (D33).
const props = defineProps<{ targetDate: string; light: boolean }>();
const emit = defineEmits<{ done: [sourceDate: string, copy: CopyResult]; close: [] }>();

const { t } = useI18n();
const format = useFormat();
const light = ref(props.light);
const source = ref<string | null>(null);
const month = ref(monthOf(props.targetDate));
const busy = ref(false);

const data = useLiveQuery(
  async () => ({
    workouts: await allWorkouts(),
    sets: await historySets(),
    labels: await workoutLabels(),
    catalog: await catalog(),
    training: await trainingSettings(),
  }),
  null,
);

const workouts = computed(() => data.value?.workouts ?? []);
const marks = computed(() => dayMarks(workouts.value, data.value?.sets ?? []));
const labels = computed(() => dayLabels(workouts.value, data.value?.labels ?? []));
const exercises = computed(() => new Map(data.value?.catalog.map((ex) => [ex.id, ex])));
const last = computed(() =>
  data.value ? defaultCopySource(workouts.value, data.value.sets, props.targetDate) : null,
);
// "Ostatni A / B…" (D48): the last day with each active label, one tap picks it.
const lastLabelled = computed(() =>
  (data.value?.labels ?? []).flatMap((label) => {
    const workout =
      !label.archived &&
      defaultCopySource(workouts.value, data.value?.sets ?? [], props.targetDate, label.id);
    return workout ? [{ label, date: workout.date }] : [];
  }),
);

function pick(date: string) {
  source.value = date;
  month.value = monthOf(date);
}

// The default source once the history is read.
watch(last, (workout) => {
  if (workout && !source.value) pick(workout.date);
});

const preview = computed(() => {
  if (!data.value || !source.value) return [];
  const sets = copyWorkout({
    source: data.value.sets.filter((set) => set.date === source.value),
    target: { workoutId: '', sets: [] },
    light: light.value
      ? { exercises: data.value.catalog, training: data.value.training }
      : undefined,
    newId: () => '',
  });
  return exerciseBlocks(sets.map((set, i) => ({ ...set, id: String(i) })));
});

const selectable = (date: string) => date < props.targetDate && marks.value.has(date);

async function submit() {
  // A disabled ion-button stops clicks only from its next render. It stays busy after a copy: a
  // tap while the sheet closes must not copy again.
  if (!source.value || busy.value) return;
  busy.value = true;
  try {
    emit('done', source.value, await copyDay(source.value, props.targetDate, light.value));
  } catch (error) {
    busy.value = false;
    throw error;
  }
}
</script>

<template>
  <ion-header>
    <ion-toolbar>
      <ion-title>{{ light ? t('day.copyLight') : t('day.copy') }}</ion-title>
      <ion-buttons slot="end">
        <ion-button @click="emit('close')">{{ t('common.cancel') }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
  <ion-content>
    <div class="lw-column">
      <p v-if="data && !last" class="lw-copy__none">
        {{ t('copy.none') }}
      </p>
      <template v-else>
        <h2 class="lw-heading">{{ t('copy.source') }}</h2>
        <p class="lw-muted lw-copy__hint">{{ t('copy.sourceHint') }}</p>
        <div v-if="lastLabelled.length > 0" class="lw-copy__last">
          <span class="lw-muted">{{ t('copy.last') }}</span>
          <button
            v-for="item in lastLabelled"
            :key="item.label.id"
            type="button"
            class="lw-copy__last-option"
            :aria-pressed="source === item.date"
            :aria-label="
              t('copy.lastLabel', { name: item.label.name, date: format.dayMonth(item.date) })
            "
            @click="pick(item.date)"
          >
            <label-chip :label="item.label" />
          </button>
        </div>
        <month-calendar
          v-model:month="month"
          :marks="marks"
          :labels="labels"
          :selected="source"
          :disabled="(date) => !selectable(date)"
          @select="(date) => (source = date)"
        />

        <ion-list class="lw-copy__light">
          <ion-item>
            <ion-toggle v-model="light">
              <ion-label>
                {{ t('copy.light') }}
                <p>{{ t('copy.lightHint') }}</p>
              </ion-label>
            </ion-toggle>
          </ion-item>
        </ion-list>

        <template v-if="source">
          <h2 class="lw-heading">{{ t('copy.preview') }}</h2>
          <ion-list>
            <ion-item v-for="block in preview" :key="block.exerciseId">
              <ion-label class="ion-text-wrap">
                <h3>{{ format.exerciseName(exercises.get(block.exerciseId)) }}</h3>
                <p class="lw-num lw-copy__sets">
                  {{ block.sets.map((set) => format.set(set)).join(', ') }}
                </p>
              </ion-label>
            </ion-item>
          </ion-list>
          <ion-button expand="block" class="lw-copy__submit" :disabled="busy" @click="submit">
            {{ t('copy.submit', { date: format.dayMonth(targetDate) }) }}
          </ion-button>
        </template>
      </template>
    </div>
  </ion-content>
</template>

<style scoped>
.lw-copy__none {
  padding-top: 24px;
}

.lw-copy__hint {
  margin: 0;
  font-size: 14px;
}

.lw-copy__last {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 14px;
}

.lw-copy__last-option {
  min-width: 56px;
  height: 48px;
  padding: 0 10px;
  background: transparent;
  border: 1px solid var(--lw-border);
  border-radius: 12px;
  cursor: pointer;
}

.lw-copy__last-option[aria-pressed='true'] {
  border-color: var(--ion-text-color);
  box-shadow: inset 0 0 0 1px var(--ion-text-color);
}

.lw-copy__light {
  margin-top: 16px;
}

.lw-copy__sets {
  font-size: 16px;
  font-weight: 600;
}

h3 {
  font-size: 16px;
  font-weight: 600;
}

.lw-copy__submit {
  height: 56px;
  margin-top: 20px;
}
</style>

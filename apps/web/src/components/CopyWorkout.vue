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
import { dayMarks, monthOf } from '../workout/calendar';
import { exerciseBlocks } from '../workout/day';
import { catalog, historySets, trainingSettings } from '../workout/queries';
import MonthCalendar from './MonthCalendar.vue';

// "Kopiuj trening" (§5.2): pick the source day, by default the last workout before the target,
// see what will be planned and copy; the light switch is "Kopiuj jako lżejszy" (D33).
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
    sets: await historySets(),
    catalog: await catalog(),
    training: await trainingSettings(),
  }),
  null,
);

const workouts = computed(() => {
  const byId = new Map((data.value?.sets ?? []).map((set) => [set.workout_id, set.date]));
  return [...byId].map(([id, date]) => ({ id, date }));
});
const marks = computed(() => dayMarks(workouts.value, data.value?.sets ?? []));
const exercises = computed(() => new Map(data.value?.catalog.map((ex) => [ex.id, ex])));

// The default source once the history is read.
watch(data, (value) => {
  if (!value || source.value) return;
  const last = defaultCopySource(workouts.value, value.sets, props.targetDate);
  if (!last) return;
  source.value = last.date;
  month.value = monthOf(last.date);
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
  if (!source.value) return;
  busy.value = true;
  try {
    emit('done', source.value, await copyDay(source.value, props.targetDate, light.value));
  } finally {
    busy.value = false;
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
      <p v-if="data && workouts.every((w) => w.date >= targetDate)" class="lw-copy__none">
        {{ t('copy.none') }}
      </p>
      <template v-else>
        <h2 class="lw-heading">{{ t('copy.source') }}</h2>
        <p class="lw-muted lw-copy__hint">{{ t('copy.sourceHint') }}</p>
        <month-calendar
          v-model:month="month"
          :marks="marks"
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

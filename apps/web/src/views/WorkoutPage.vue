<script setup lang="ts">
import {
  DEFAULT_TRAINING_SETTINGS,
  exerciseSessions,
  weightStepKg,
  type Exercise,
  type WorkoutSet,
} from '@liftwise/core';
import {
  actionSheetController,
  IonButton,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonModal,
  toastController,
} from '@ionic/vue';
import { checkmark, chevronBack, chevronForward, createOutline, listOutline } from 'ionicons/icons';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppPage from '../components/AppPage.vue';
import ExercisePicker from '../components/ExercisePicker.vue';
import ExerciseSettings from '../components/ExerciseSettings.vue';
import RestTimer from '../components/RestTimer.vue';
import SetEditor from '../components/SetEditor.vue';
import SetLogger from '../components/SetLogger.vue';
import { useFormat } from '../composables/format';
import { useLiveQuery, useLiveQueryState } from '../composables/liveQuery';
import { showUndo } from '../composables/undo';
import { useRestStore } from '../stores/rest';
import { deleteSets, logSet, restoreSets, saveExercise, saveSets } from '../workout/actions';
import { today } from '../workout/calendar';
import { exerciseBlocks, plannedHint } from '../workout/day';
import {
  draftSource,
  loadGroups,
  repeatsPrevious,
  setRecords,
  startExercise,
  type Draft,
} from '../workout/logging';
import {
  catalog,
  dayData,
  equipment,
  historySets,
  maxDumbbellKg,
  trainingSettings,
} from '../workout/queries';

// The active workout (§5.2, §5.3): one exercise at a time with the draft of its next set,
// logged with "Zrobione" without a keyboard; the rest timer runs at the bottom.
const props = defineProps<{ date: string; exerciseId: string | null; dayHref: string }>();

const { t } = useI18n();
const format = useFormat();
const rest = useRestStore();

// The shown exercise; until chosen, the first with a planned set left. `extra` is one picked
// from outside the day's plan, so its history loads too.
const currentId = ref(props.exerciseId);
const extra = ref(props.exerciseId);
watch(
  () => props.exerciseId,
  (id) => {
    if (id) currentId.value = extra.value = id;
  },
);

const { data: view, loaded: dayLoaded } = useLiveQueryState(
  async () => {
    const day = await dayData(props.date);
    const ids = new Set(day.sets.map((set) => set.exercise_id));
    if (extra.value) ids.add(extra.value);
    return { ...day, history: await historySets([...ids]) };
  },
  { workouts: [], sets: [], history: [] },
  () => [props.date, extra.value],
);
const { data: exercises, loaded: catalogLoaded } = useLiveQueryState(
  async () => new Map((await catalog()).map((exercise) => [exercise.id, exercise])),
  new Map<string, Exercise>(),
);
// Nothing shows until the first read, so the empty state and placeholder names do not flash.
const loaded = computed(() => dayLoaded.value && catalogLoaded.value);
const training = useLiveQuery(trainingSettings, DEFAULT_TRAINING_SETTINGS);
const maxKg = useLiveQuery(async () => maxDumbbellKg(await equipment()), null);

const blocks = computed(() => exerciseBlocks(view.value.sets));
const current = computed(() => currentId.value ?? startExercise(blocks.value));
const exercise = computed(() => (current.value ? exercises.value.get(current.value) : undefined));
const sets = computed(
  () => blocks.value.find((block) => block.exerciseId === current.value)?.sets ?? [],
);

// Previous / next walk the day's exercises; one picked from outside comes last.
const order = computed(() => {
  const ids = blocks.value.map((block) => block.exerciseId);
  return current.value && !ids.includes(current.value) ? [...ids, current.value] : ids;
});
const index = computed(() => (current.value ? order.value.indexOf(current.value) : -1));
const previousId = computed(() => order.value[index.value - 1] ?? null);
const nextId = computed(() => order.value[index.value + 1] ?? null);

const source = computed(() =>
  draftSource({
    exercise: exercise.value,
    sets: sets.value,
    history: view.value.history,
    date: props.date,
  }),
);
// The draft starts over when its source changes (another exercise, a logged or edited set),
// not on unrelated updates; RIR clears after every set. A tap on the main button waits for that,
// so a quick second tap can't log the same draft twice.
const draft = ref<Draft>(source.value.draft);
const logging = ref(false);
const doneCount = computed(() => sets.value.filter((set) => set.status === 'done').length);
watch(
  () => JSON.stringify([current.value, source.value.draft, doneCount.value]),
  () => {
    draft.value = source.value.draft;
    logging.value = false;
  },
);

const repeat = computed(() => repeatsPrevious(source.value, draft.value));
const title = computed(() => {
  const planned = source.value.planned;
  return planned
    ? t('workout.setOf', { n: sets.value.indexOf(planned) + 1, total: sets.value.length })
    : t('workout.setNext', { n: sets.value.length + 1 });
});

const lastSession = computed(() =>
  exercise.value
    ? exerciseSessions(view.value.history, exercise.value, props.date).at(-1)
    : undefined,
);
const hint = computed(() => {
  if (!exercise.value) return null;
  const chip = plannedHint({
    exercise: exercise.value,
    training: training.value,
    sets: view.value.history,
    date: props.date,
    maxWeightKg: maxKg.value,
    block: sets.value,
  });
  return chip && { label: format.hint(chip.hint), sets: chip.sets };
});

const stepKg = computed(() => weightStepKg(exercise.value, training.value));

function go(id: string | null) {
  if (id) currentId.value = id;
}

// "Zrobione" / "Jak poprzednio": logs the draft, starts the rest (today only, a past day is
// filled in afterwards) and shows a new record.
async function done() {
  const id = current.value;
  if (!id || logging.value) return;
  logging.value = true;
  currentId.value = id;
  let set: WorkoutSet;
  try {
    set = await logSet(props.date, id, source.value.planned, draft.value);
  } catch (error) {
    logging.value = false;
    throw error;
  }
  if (props.date === today())
    rest.start(exercise.value?.rest_seconds ?? training.value.rest_seconds);
  const logged = exercise.value;
  if (!logged) return;
  const events = setRecords(await historySets([logged.id]), logged, set.id);
  if (events.length === 0) return;
  const toast = await toastController.create({
    message: format.records(events),
    color: 'warning',
    duration: 4000,
    position: 'top',
  });
  await toast.present();
}

// Modals: exercise picker, set editor, the exercise's settings.
const picking = ref(false);
const editing = ref<WorkoutSet | null>(null);
const settingsOpen = ref(false);

async function chooseExercise() {
  const sheet = await actionSheetController.create({
    header: t('workout.choose'),
    buttons: [
      ...order.value.map((id) => ({
        text: format.exerciseName(exercises.value.get(id)),
        handler: () => go(id),
      })),
      { text: t('workout.other'), handler: () => void (picking.value = true) },
      { text: t('common.cancel'), role: 'cancel' },
    ],
  });
  await sheet.present();
}

function picked(choice: Exercise) {
  picking.value = false;
  currentId.value = extra.value = choice.id;
}

function closeSliding(event: Event) {
  const sliding = (event.target as HTMLElement).closest('ion-item-sliding');
  void (sliding as HTMLIonItemSlidingElement | null)?.close();
}

function edit(set: WorkoutSet, event?: Event) {
  if (event) closeSliding(event);
  editing.value = set;
}

async function saveSet(set: WorkoutSet) {
  editing.value = null;
  await saveSets([set]);
}

async function removeSet(set: WorkoutSet) {
  editing.value = null;
  await deleteSets([set]);
  await showUndo(t('day.setRemoved'), () => restoreSets([set]));
}

async function applyHint() {
  if (hint.value) await saveSets(hint.value.sets);
}

async function saveSettings(changed: Exercise) {
  settingsOpen.value = false;
  await saveExercise(changed);
}

function details(set: WorkoutSet): string {
  const state =
    set.status === 'done'
      ? set.rir === null
        ? []
        : [t('workout.rir', { value: format.rir(set.rir) })]
      : [set.id === source.value.planned?.id ? t('workout.upNext') : t('day.planned')];
  return [...state, ...(set.warmup ? [t('day.warmup')] : [])].join(', ');
}
</script>

<template>
  <app-page :title="format.day(date)" :back-href="dayHref">
    <template #actions>
      <ion-button :aria-label="t('workout.choose')" @click="chooseExercise">
        <ion-icon slot="icon-only" :icon="listOutline" aria-hidden="true" />
      </ion-button>
    </template>

    <!-- A stable parent: Ionic moves open modals, so they can't anchor a v-if. -->
    <div>
      <template v-if="loaded && current">
        <header class="lw-workout__head">
          <div class="lw-workout__nav">
            <span class="lw-workout__position">
              {{ t('workout.position', { n: index + 1, total: order.length }) }}
            </span>
            <ion-button
              fill="clear"
              class="lw-workout__step"
              :disabled="!previousId"
              :aria-label="t('workout.previous')"
              @click="go(previousId)"
            >
              <ion-icon slot="icon-only" :icon="chevronBack" aria-hidden="true" />
            </ion-button>
            <ion-button
              fill="clear"
              class="lw-workout__step"
              :disabled="!nextId"
              :aria-label="t('workout.next')"
              @click="go(nextId)"
            >
              <ion-icon slot="icon-only" :icon="chevronForward" aria-hidden="true" />
            </ion-button>
          </div>
          <div class="lw-workout__title">
            <h2 class="lw-workout__name">{{ format.exerciseName(exercise) }}</h2>
            <ion-button
              v-if="exercise"
              fill="clear"
              class="lw-workout__edit"
              :aria-label="t('workout.edit', { name: format.exerciseName(exercise) })"
              @click="settingsOpen = true"
            >
              <ion-icon slot="icon-only" :icon="createOutline" aria-hidden="true" />
            </ion-button>
          </div>
          <p v-if="exercise?.note" class="lw-workout__note">{{ exercise.note }}</p>
          <button
            v-if="hint"
            type="button"
            class="lw-hint lw-num"
            :aria-label="t('hint.apply', { hint: hint.label })"
            @click="applyHint"
          >
            {{ hint.label }}
          </button>
          <p class="lw-workout__last">
            <template v-if="lastSession">
              <span class="lw-muted">{{
                t('workout.lastSession', { date: format.dayMonth(lastSession.date) })
              }}</span>
              <span class="lw-num">{{ format.session(loadGroups(lastSession.sets)) }}</span>
            </template>
            <span v-else class="lw-muted">{{ t('workout.firstSession') }}</span>
          </p>
        </header>

        <div class="lw-workout__card">
          <set-logger
            v-model="draft"
            :title="title"
            :step-kg="stepKg"
            :repeat="repeat"
            @done="done"
          />
        </div>
        <ion-button
          v-if="!source.planned && nextId"
          fill="outline"
          expand="block"
          class="lw-workout__onward"
          @click="go(nextId)"
        >
          {{ t('workout.nextNamed', { name: format.exerciseName(exercises.get(nextId)) }) }}
          <ion-icon slot="end" :icon="chevronForward" aria-hidden="true" />
        </ion-button>

        <h3 class="lw-heading">{{ t('workout.sets') }}</h3>
        <ion-list v-if="sets.length > 0" class="lw-workout__sets">
          <ion-item-sliding v-for="(set, n) in sets" :key="set.id">
            <ion-item
              button
              :detail="false"
              :class="{ 'is-next': set.id === source.planned?.id }"
              @click="edit(set)"
            >
              <span slot="start" class="lw-workout__index lw-num">{{ n + 1 }}</span>
              <ion-label>
                <span class="lw-workout__load lw-num">{{ format.set(set) }}</span>
                <p v-if="details(set)">{{ details(set) }}</p>
              </ion-label>
              <ion-icon
                v-if="set.status === 'done'"
                slot="end"
                color="primary"
                :icon="checkmark"
                :aria-label="t('day.done')"
              />
            </ion-item>
            <ion-item-options side="end">
              <ion-item-option @click="edit(set, $event)">{{
                t('workout.editSet')
              }}</ion-item-option>
              <ion-item-option color="danger" @click="removeSet(set)">
                {{ t('common.delete') }}
              </ion-item-option>
            </ion-item-options>
          </ion-item-sliding>
        </ion-list>
        <p v-else class="lw-muted">{{ t('workout.noSets') }}</p>
      </template>

      <div v-else-if="loaded" class="lw-workout__empty">
        <p class="lw-workout__lead">{{ t('workout.empty') }}</p>
        <ion-button @click="picking = true">{{ t('workout.choose') }}</ion-button>
      </div>
    </div>

    <ion-modal :is-open="picking" class="lw-dialog" @did-dismiss="picking = false">
      <exercise-picker v-if="picking" @pick="picked" @close="picking = false" />
    </ion-modal>
    <ion-modal
      :is-open="editing !== null"
      :initial-breakpoint="1"
      :breakpoints="[0, 1]"
      class="lw-sheet"
      @did-dismiss="editing = null"
    >
      <set-editor
        v-if="editing"
        :set="editing"
        :exercise="exercises.get(editing.exercise_id)"
        :step-kg="weightStepKg(exercises.get(editing.exercise_id), training)"
        @save="saveSet"
        @remove="removeSet"
        @close="editing = null"
      />
    </ion-modal>
    <ion-modal
      :is-open="settingsOpen"
      :initial-breakpoint="1"
      :breakpoints="[0, 1]"
      class="lw-sheet"
      @did-dismiss="settingsOpen = false"
    >
      <exercise-settings
        v-if="settingsOpen && exercise"
        :exercise="exercise"
        :training="training"
        @save="saveSettings"
        @close="settingsOpen = false"
      />
    </ion-modal>

    <template #footer>
      <rest-timer />
    </template>
  </app-page>
</template>

<style scoped>
.lw-workout__head {
  padding-top: 8px;
}

.lw-workout__nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.lw-workout__position {
  flex: 1;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-workout__step {
  --color: var(--ion-text-color);
  width: 48px;
  height: 48px;
  margin: 0;
}

.lw-workout__title {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.lw-workout__name {
  flex: 1;
  margin: 0;
  font-size: 26px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
  line-height: 1.15;
}

.lw-workout__edit {
  --color: var(--lw-muted);
  margin: -6px -8px 0 0;
}

.lw-workout__note {
  margin: 4px 0 0;
  color: var(--lw-muted);
}

.lw-workout__last {
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
  margin: 10px 0 0;
  font-size: 14px;
}

.lw-workout__last .lw-num {
  font-size: 16px;
}

.lw-workout__card {
  margin-top: 16px;
  padding: 16px;
  background: var(--lw-surface);
  border: 1px solid var(--lw-border);
  border-radius: 12px;
}

.lw-workout__onward {
  --border-radius: 12px;
  height: 52px;
  margin: 12px 0 0;
}

.lw-workout__sets ion-item {
  --border-width: 0;
  --inner-border-width: 0;
}

.lw-workout__sets ion-item-sliding + ion-item-sliding {
  border-top: 1px solid var(--lw-border);
}

.lw-workout__sets ion-item.is-next {
  --background: var(--lw-surface);
  box-shadow: inset 3px 0 var(--ion-color-primary);
}

.lw-workout__index {
  min-width: 20px;
  font-size: 16px;
  color: var(--lw-muted);
}

.lw-workout__load {
  font-size: 20px;
}

.lw-workout__empty {
  max-width: 48ch;
  padding-top: 24px;
}

.lw-workout__lead {
  margin: 0 0 16px;
  font-size: 20px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
}
</style>

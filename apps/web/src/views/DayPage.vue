<script setup lang="ts">
import {
  DEFAULT_TRAINING_SETTINGS,
  weightStepKg,
  type Exercise,
  type WorkoutSet,
} from '@liftwise/core';
import {
  actionSheetController,
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonReorder,
  IonReorderGroup,
  type ReorderEndCustomEvent,
} from '@ionic/vue';
import { ellipsisVertical } from 'ionicons/icons';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import AppPage from '../components/AppPage.vue';
import CopyWorkout from '../components/CopyWorkout.vue';
import ExerciseBlock from '../components/ExerciseBlock.vue';
import ExercisePicker from '../components/ExercisePicker.vue';
import RestTimer from '../components/RestTimer.vue';
import SetEditor from '../components/SetEditor.vue';
import { useFormat } from '../composables/format';
import { useLiveQuery } from '../composables/liveQuery';
import { showUndo } from '../composables/undo';
import { addExercise, deleteSets, restoreSets, saveSets, swapExercise } from '../workout/actions';
import { today } from '../workout/calendar';
import {
  exerciseBlocks,
  extraSet,
  nextPosition,
  plannedHint,
  reorderBlocks,
  type ExerciseBlock as Block,
} from '../workout/day';
import {
  catalog,
  dayData,
  equipment,
  historySets,
  maxDumbbellKg,
  trainingSettings,
} from '../workout/queries';

// A day (§5.2): its exercises with planned and done sets; copy a workout onto it, add, swap,
// remove and reorder exercises, edit sets with ± and apply progression hints. Today and past
// days open the workout screen to log sets; a future day is planning only.
const props = defineProps<{ date: string; backHref: string; workoutHref: string }>();

const { t } = useI18n();
const format = useFormat();
const router = useRouter();
const loggable = computed(() => props.date <= today());

function openWorkout(exerciseId?: string) {
  void router.push({
    path: props.workoutHref,
    query: exerciseId ? { exercise: exerciseId } : {},
  });
}

const view = useLiveQuery(
  async () => {
    const day = await dayData(props.date);
    const ids = [...new Set(day.sets.map((set) => set.exercise_id))];
    return { ...day, history: await historySets(ids) };
  },
  { workouts: [], sets: [], history: [] },
  () => props.date,
);
const exercises = useLiveQuery(
  async () => new Map((await catalog()).map((exercise) => [exercise.id, exercise])),
  new Map<string, Exercise>(),
);
const training = useLiveQuery(trainingSettings, DEFAULT_TRAINING_SETTINGS);
const maxKg = useLiveQuery(async () => maxDumbbellKg(await equipment()), null);

const blocks = computed(() => exerciseBlocks(view.value.sets));
const started = computed(() => view.value.sets.some((set) => set.status === 'done'));

// The hint per exercise and the planned sets it would change; no chip when nothing changes.
const hints = computed(() => {
  const result = new Map<string, { label: string; sets: WorkoutSet[] }>();
  for (const block of blocks.value) {
    const exercise = exercises.value.get(block.exerciseId);
    const chip =
      exercise &&
      plannedHint({
        exercise,
        training: training.value,
        sets: view.value.history,
        date: props.date,
        maxWeightKg: maxKg.value,
        block: block.sets,
      });
    if (chip) result.set(block.exerciseId, { label: format.hint(chip.hint), sets: chip.sets });
  }
  return result;
});

const stepKg = (exerciseId: string) =>
  weightStepKg(exercises.value.get(exerciseId), training.value);

// Modals: copy, exercise picker (add or swap), set editor.
const copyMode = ref<'copy' | 'light' | null>(null);
const picker = ref<{ swap: Block | null } | null>(null);
const editing = ref<WorkoutSet | null>(null);

// The copy ran in the modal; the toast offers to remove what it planned.
async function onCopyDone(sourceDate: string, sets: WorkoutSet[]) {
  copyMode.value = null;
  if (sets.length === 0) return;
  await showUndo(t('copy.copied', { date: format.dayMonth(sourceDate) }), () => deleteSets(sets));
}

function openCopy(mode: 'copy' | 'light') {
  copyMode.value = mode;
}

async function picked(exercise: Exercise) {
  const swap = picker.value?.swap;
  picker.value = null;
  if (swap) await swapExercise(swap.sets, exercise);
  else await addExercise(props.date, exercise);
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

async function addSet(block: Block) {
  await saveSets([extraSet(block, nextPosition(view.value.sets))]);
}

async function applyHint(exerciseId: string) {
  const hint = hints.value.get(exerciseId);
  if (hint) await saveSets(hint.sets);
}

async function exerciseActions(block: Block) {
  const name = format.exerciseName(exercises.value.get(block.exerciseId));
  const sheet = await actionSheetController.create({
    header: name,
    buttons: [
      { text: t('day.swap'), handler: () => void (picker.value = { swap: block }) },
      {
        text: t('day.removeExercise'),
        role: 'destructive',
        handler: () => void removeExercise(block, name),
      },
      { text: t('common.cancel'), role: 'cancel' },
    ],
  });
  await sheet.present();
}

async function removeExercise(block: Block, name: string) {
  await deleteSets(block.sets);
  await showUndo(t('day.removed', { name }), () => restoreSets(block.sets));
}

async function dayActions() {
  const sheet = await actionSheetController.create({
    header: format.day(props.date),
    buttons: [
      { text: t('day.copy'), handler: () => openCopy('copy') },
      { text: t('day.copyLight'), handler: () => openCopy('light') },
      { text: t('day.addExercise'), handler: () => void (picker.value = { swap: null }) },
      ...(blocks.value.length > 1
        ? [{ text: t('day.reorder'), handler: () => startReorder() }]
        : []),
      { text: t('common.cancel'), role: 'cancel' },
    ],
  });
  await sheet.present();
}

// Reorder mode works on a copy, so Ionic's DOM move and the list stay in step until saved.
const reordering = ref<Block[] | null>(null);
function startReorder() {
  reordering.value = [...blocks.value];
}

async function reorderEnd(event: ReorderEndCustomEvent) {
  const list = reordering.value;
  if (!list) return;
  const { from, to } = event.detail;
  const changed = reorderBlocks(list, from, to);
  reordering.value = event.detail.complete(list) as Block[];
  if (changed.length > 0) await saveSets(changed);
}
</script>

<template>
  <app-page :title="format.day(date)" :back-href="backHref">
    <template #actions>
      <ion-button v-if="reordering" @click="reordering = null">{{
        t('day.reorderDone')
      }}</ion-button>
      <ion-button v-else :aria-label="t('day.actions')" @click="dayActions">
        <ion-icon slot="icon-only" :icon="ellipsisVertical" aria-hidden="true" />
      </ion-button>
    </template>

    <!-- A stable parent: Ionic moves open modals, so they can't anchor a v-if. -->
    <div>
      <template v-if="reordering">
        <p class="lw-muted lw-day__hint">{{ t('day.reorderHint') }}</p>
        <ion-list>
          <ion-reorder-group :disabled="false" @ion-reorder-end="reorderEnd">
            <ion-item v-for="block in reordering" :key="block.exerciseId">
              <ion-label>
                {{ format.exerciseName(exercises.get(block.exerciseId)) }}
                <p>{{ t('day.sets', block.sets.length) }}</p>
              </ion-label>
              <ion-reorder slot="end" />
            </ion-item>
          </ion-reorder-group>
        </ion-list>
      </template>

      <template v-else-if="blocks.length > 0">
        <ion-button v-if="loggable" expand="block" class="lw-day__start" @click="openWorkout()">
          {{ started ? t('day.resume') : t('day.start') }}
        </ion-button>
        <div class="lw-day__blocks">
          <exercise-block
            v-for="block in blocks"
            :key="block.exerciseId"
            :exercise="exercises.get(block.exerciseId)"
            :sets="block.sets"
            :hint="hints.get(block.exerciseId)?.label ?? null"
            :openable="loggable"
            @edit-set="(set) => (editing = set)"
            @add-set="addSet(block)"
            @apply-hint="applyHint(block.exerciseId)"
            @actions="exerciseActions(block)"
            @open="openWorkout(block.exerciseId)"
          />
        </div>
        <div class="lw-day__more">
          <ion-button fill="outline" @click="picker = { swap: null }">
            {{ t('day.addExercise') }}
          </ion-button>
        </div>
      </template>

      <div v-else class="lw-day__empty">
        <p class="lw-day__lead">{{ t('day.empty') }}</p>
        <p class="lw-muted">{{ t('day.emptyHint') }}</p>
        <div class="lw-day__empty-actions">
          <ion-button @click="openCopy('copy')">{{ t('day.copy') }}</ion-button>
          <ion-button fill="outline" @click="openCopy('light')">{{
            t('day.copyLight')
          }}</ion-button>
          <ion-button fill="outline" @click="picker = { swap: null }">
            {{ t('day.addExercise') }}
          </ion-button>
        </div>
      </div>
    </div>

    <ion-modal :is-open="copyMode !== null" class="lw-dialog" @did-dismiss="copyMode = null">
      <copy-workout
        v-if="copyMode"
        :target-date="date"
        :light="copyMode === 'light'"
        @done="onCopyDone"
        @close="copyMode = null"
      />
    </ion-modal>
    <ion-modal :is-open="picker !== null" class="lw-dialog" @did-dismiss="picker = null">
      <exercise-picker
        v-if="picker"
        :swap-for="picker.swap ? exercises.get(picker.swap.exerciseId) : null"
        @pick="picked"
        @close="picker = null"
      />
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
        :step-kg="stepKg(editing.exercise_id)"
        @save="saveSet"
        @remove="removeSet"
        @close="editing = null"
      />
    </ion-modal>

    <template #footer>
      <rest-timer />
    </template>
  </app-page>
</template>

<style scoped>
.lw-day__start {
  --border-radius: 14px;
  height: 56px;
  margin: 16px 0 0;
  font-size: 20px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
}

.lw-day__blocks {
  margin-top: 16px;
  overflow: hidden;
  background: var(--lw-surface);
  border: 1px solid var(--lw-border);
  border-radius: 12px;
}

.lw-day__more {
  margin-top: 16px;
}

.lw-day__hint {
  margin: 16px 0 8px;
  font-size: 14px;
}

.lw-day__empty {
  max-width: 48ch;
  padding-top: 24px;
}

.lw-day__lead {
  margin: 0 0 4px;
  font-size: 20px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
}

.lw-day__empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.lw-day__empty-actions ion-button {
  margin: 0;
}
</style>

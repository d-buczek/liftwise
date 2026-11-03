<script setup lang="ts">
import type { PlanToolOutput, WorkoutPlan } from '@liftwise/core';
import { IonButton } from '@ionic/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { resolveProposal, undoChange, undoneGroups } from '../agent/actions';
import { useFormat } from '../composables/format';
import { loadGroups } from '../workout/logging';

// A proposed workout (§5.9.6): accepting replaces the day's planned sets; a change by chat or
// "Wygeneruj ponownie" brings a new card and this one shows it was replaced. Earlier threads have
// no `regenerate`: a new plan goes to today's conversation.
const props = defineProps<{
  output: PlanToolOutput;
  exerciseNames: Map<string, string>;
  ready: boolean;
  regenerate?: (date: string) => void;
}>();

const { t } = useI18n();
const format = useFormat();
const busy = ref(false);

const status = computed(() => props.output.status);
const groupId = computed(() => props.output.groupId ?? null);
const undone = computed(() => groupId.value !== null && undoneGroups.has(groupId.value));

type PlannedExercise = WorkoutPlan['exercises'][number];

const load = (sets: PlannedExercise['sets']) => format.session(loadGroups(sets));

const lines = computed(() =>
  props.output.plan.exercises.map((exercise) => {
    const warmups = exercise.sets.filter((set) => set.warmup);
    const working = exercise.sets.filter((set) => !set.warmup);
    return {
      id: exercise.exercise_id,
      name: props.exerciseNames.get(exercise.exercise_id) ?? t('day.unknownExercise'),
      working: working.length > 0 ? load(working) : null,
      warmup: warmups.length > 0 ? load(warmups) : null,
      rir: exercise.target_rir,
    };
  }),
);

async function run(action: () => Promise<void>) {
  busy.value = true;
  try {
    await action();
  } finally {
    busy.value = false;
  }
}

function accept() {
  void run(() => resolveProposal(props.output.proposalId, 'confirm'));
}

function undo() {
  const id = groupId.value;
  if (id) void run(() => undoChange(id));
}
</script>

<template>
  <section class="lw-plan" :class="`is-${status}`">
    <p class="lw-plan__status">{{ t(`agent.plan.status.${status}`) }}</p>
    <p class="lw-plan__title">{{ format.day(output.date) }}</p>
    <ul class="lw-plan__lines">
      <li v-for="line in lines" :key="line.id">
        <span class="lw-plan__name">{{ line.name }}</span>
        <span v-if="line.warmup" class="lw-plan__detail lw-num">
          {{ t('agent.plan.warmup', { load: line.warmup }) }}
        </span>
        <span v-if="line.working" class="lw-plan__detail lw-num">
          {{ line.working }}
          <template v-if="line.rir !== null">
            · {{ t('agent.plan.targetRir', { value: format.rir(line.rir) }) }}
          </template>
        </span>
      </li>
    </ul>
    <p class="lw-plan__rationale">{{ output.plan.rationale }}</p>

    <template v-if="status === 'pending'">
      <p v-if="output.replaces > 0" class="lw-plan__note">
        {{ t('agent.plan.replaces', output.replaces) }}
      </p>
      <p v-if="regenerate" class="lw-plan__note">{{ t('agent.plan.changeHint') }}</p>
      <div class="lw-plan__actions">
        <ion-button
          v-if="regenerate"
          fill="outline"
          :disabled="!ready || busy"
          @click="regenerate(output.date)"
        >
          {{ t('agent.plan.regenerate') }}
        </ion-button>
        <ion-button :disabled="!ready || busy" @click="accept">
          {{ t('agent.plan.accept') }}
        </ion-button>
      </div>
    </template>
    <div v-else-if="status === 'confirmed'" class="lw-plan__actions">
      <span v-if="undone" class="lw-plan__note">{{ t('agent.undo.undone') }}</span>
      <ion-button v-else-if="groupId" fill="outline" :disabled="busy" @click="undo">
        {{ t('agent.undo.action') }}
      </ion-button>
      <ion-button fill="outline" :router-link="`/calendar/${output.date}`">
        {{ t('agent.plan.openDay') }}
      </ion-button>
    </div>
  </section>
</template>

<style scoped>
.lw-plan {
  padding: 12px 16px;
  border: 1px solid var(--lw-border);
  border-radius: 12px;
}

.lw-plan.is-pending {
  border-color: var(--ion-color-primary);
}

.lw-plan__status {
  margin: 0 0 2px;
  font-size: 13px;
  color: var(--lw-muted);
}

.is-pending .lw-plan__status {
  color: var(--ion-color-primary);
}

.lw-plan__title {
  margin: 0;
  font-size: 16px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
}

.lw-plan__lines {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.lw-plan__lines li + li {
  margin-top: 8px;
}

.lw-plan__name {
  display: block;
  font-size: 15px;
}

.lw-plan__detail {
  display: block;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-plan__rationale {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.lw-plan__note {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-plan__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.lw-plan__actions .lw-plan__note {
  margin: 0;
}

.is-rejected .lw-plan__title,
.is-rejected .lw-plan__lines,
.is-rejected .lw-plan__rationale {
  color: var(--lw-muted);
}
</style>

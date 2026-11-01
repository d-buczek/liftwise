<script setup lang="ts">
import { recordSets } from '@liftwise/core';
import { IonIcon, useIonRouter } from '@ionic/vue';
import { chevronForward } from 'ionicons/icons';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppPage from '../components/AppPage.vue';
import { useFormat } from '../composables/format';
import { useLiveQuery } from '../composables/liveQuery';
import { exerciseLog } from '../workout/history';
import { exercise, historySets } from '../workout/queries';

// One exercise's history (§5.4): its sessions newest first, every done set with its RIR,
// warm-ups marked and the sets that set a record in amber; a session opens its day.
const props = defineProps<{ id: string }>();

const { t } = useI18n();
const format = useFormat();
const router = useIonRouter();

const data = useLiveQuery(
  async () => ({ exercise: await exercise(props.id), sets: await historySets([props.id]) }),
  { exercise: undefined, sets: [] },
  () => props.id,
);

const records = computed(() => {
  const found = data.value.exercise;
  return new Set(found ? recordSets(data.value.sets, [found]).map((event) => event.set_id) : []);
});

// Working sets are numbered; warm-ups carry their tag instead.
const sessions = computed(() =>
  exerciseLog(data.value.sets, props.id).map((session) => {
    let working = 0;
    return {
      date: session.date,
      sets: session.sets.map((set) => ({
        set,
        label: set.warmup ? t('day.warmupShort') : String(++working),
      })),
    };
  }),
);
</script>

<template>
  <app-page :title="t('history.exerciseTitle')" back-href="/history">
    <header class="lw-exercise">
      <h1 class="lw-exercise__name">{{ format.exerciseName(data.exercise) }}</h1>
      <p class="lw-muted">
        {{ sessions.length > 0 ? t('history.sessions', sessions.length) : t('history.noSessions') }}
      </p>
    </header>

    <div v-if="sessions.length > 0" class="lw-sessions">
      <article v-for="session in sessions" :key="session.date" class="lw-session">
        <h2 class="lw-session__head">
          <button
            type="button"
            class="lw-session__open"
            :aria-label="t('history.openSession', { date: format.day(session.date) })"
            @click="router.push(`/history/${session.date}`)"
          >
            {{ format.day(session.date) }}
          </button>
          <ion-icon class="lw-session__chevron" :icon="chevronForward" aria-hidden="true" />
        </h2>
        <ol class="lw-session__sets">
          <li
            v-for="row in session.sets"
            :key="row.set.id"
            class="lw-session__set"
            :class="{ 'is-warmup': row.set.warmup }"
          >
            <span class="lw-session__label">{{ row.label }}</span>
            <span class="lw-session__load lw-num">{{ format.set(row.set) }}</span>
            <span v-if="records.has(row.set.id)" class="lw-session__record">
              {{ t('history.record') }}
            </span>
            <span v-if="row.set.rir !== null" class="lw-session__rir">
              {{ t('workout.rir', { value: format.rir(row.set.rir) }) }}
            </span>
          </li>
        </ol>
      </article>
    </div>
  </app-page>
</template>

<style scoped>
.lw-exercise {
  padding-top: 16px;
}

.lw-exercise__name {
  margin: 0;
  font-size: 26px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
  line-height: 1.15;
}

.lw-exercise p {
  margin: 4px 0 0;
}

.lw-sessions {
  margin-top: 16px;
  overflow: hidden;
  background: var(--lw-surface);
  border: 1px solid var(--lw-border);
  border-radius: 12px;
}

/* The whole session opens its day: the date button stretches over the block. */
.lw-session {
  position: relative;
  padding: 12px 16px 14px;
}

.lw-session + .lw-session {
  border-top: 1px solid var(--lw-border);
}

.lw-session:has(.lw-session__open:hover) {
  background: var(--ion-background-color-step-50);
}

.lw-session__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.lw-session__open {
  flex: 1;
  min-height: 32px;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  background: none;
  border: 0;
  cursor: pointer;
}

.lw-session__open::after {
  position: absolute;
  inset: 0;
  content: '';
}

.lw-session__chevron {
  font-size: 18px;
  color: var(--lw-muted);
}

.lw-session__sets {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.lw-session__set {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-height: 32px;
}

.lw-session__label {
  flex: 0 0 48px;
  font-size: 14px;
  color: var(--lw-muted);
  font-variant-numeric: tabular-nums;
}

.lw-session__load {
  font-size: 20px;
}

.lw-session__set.is-warmup .lw-session__load {
  font-size: 16px;
  color: var(--lw-muted);
}

.lw-session__record {
  padding: 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ion-color-warning-contrast);
  background: var(--ion-color-warning);
  border-radius: 10px;
}

.lw-session__rir {
  margin-left: auto;
  font-size: 14px;
  color: var(--lw-muted);
}
</style>

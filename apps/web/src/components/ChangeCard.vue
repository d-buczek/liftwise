<script setup lang="ts">
import type { ProposalToolOutput, WriteToolOutput } from '@liftwise/core';
import { IonButton } from '@ionic/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { resolveProposal, undoChange, undoneGroups } from '../agent/actions';
import { changeSummary, type ChangeLine, type SetFields } from '../agent/changes';
import { useFormat } from '../composables/format';

// A change the agent wrote, with "Cofnij" (§5.9.2), or a proposal of a risky tool waiting for
// "Zatwierdź" (§5.9.3). A proposal can be resolved once the server has stored its message and
// the turn is over (`ready`).
const props = defineProps<{
  output: WriteToolOutput | ProposalToolOutput;
  exerciseNames: Map<string, string>;
  ready: boolean;
}>();

const { t } = useI18n();
const format = useFormat();
const busy = ref(false);

const proposal = computed(() => ('proposalId' in props.output ? props.output : null));
const summary = computed(() => changeSummary(props.output.changes));
const status = computed(() => proposal.value?.status ?? 'applied');
const title = computed(() => {
  const words = proposal.value ? 'agent.proposal.kinds' : 'agent.change.kinds';
  const parts = summary.value.counts.map(({ kind, count }) => t(`${words}.${kind}`, count));
  return format.sentence(parts.join(' · '));
});
// The group a "Cofnij" reverts: the write's, or the confirmed proposal's.
const groupId = computed(() => props.output.groupId ?? null);
const undone = computed(() => groupId.value !== null && undoneGroups.has(groupId.value));

const setText = (set: SetFields) => format.set(set);

function lineText(line: ChangeLine): string {
  switch (line.entity) {
    case 'sets': {
      const name = props.exerciseNames.get(line.exerciseId) ?? t('day.unknownExercise');
      const { before, after } = line;
      const shown = after ?? before;
      if (!shown) return name;
      const value =
        before && after && setText(before) !== setText(after)
          ? `${setText(before)} → ${setText(after)}`
          : setText(shown);
      const tags = [
        ...(shown.warmup ? [t('agent.change.warmup')] : []),
        ...(shown.status === 'planned' ? [t('agent.change.planned')] : []),
      ];
      return [name, value, ...tags].join(' · ');
    }
    case 'workouts':
      return format.day(line.date);
    case 'exercises':
      return line.name;
    case 'athlete_profile':
      return t('profile.title');
    case 'settings':
      return t(`agent.change.settingKeys.${line.key}`);
  }
}

const isDeleted = (line: ChangeLine) => line.entity === 'sets' && line.after === null;

async function run(action: () => Promise<void>) {
  busy.value = true;
  try {
    await action();
  } finally {
    busy.value = false;
  }
}

function undo() {
  const id = groupId.value;
  if (id) void run(() => undoChange(id));
}

function resolve(action: 'confirm' | 'reject') {
  const id = proposal.value?.proposalId;
  if (id) void run(() => resolveProposal(id, action));
}
</script>

<template>
  <section class="lw-change" :class="`is-${status}`">
    <p v-if="proposal" class="lw-change__status">
      {{ t(`agent.proposal.status.${status}`) }}
    </p>
    <p class="lw-change__title">{{ title }}</p>
    <ul v-if="summary.lines.length > 0" class="lw-change__lines">
      <li
        v-for="line in summary.lines"
        :key="line.id"
        :class="{ 'is-deleted': isDeleted(line), 'is-text': line.entity === 'athlete_profile' }"
      >
        <template v-if="line.entity === 'athlete_profile'">{{ line.content }}</template>
        <template v-else>{{ lineText(line) }}</template>
      </li>
    </ul>

    <div class="lw-change__actions">
      <template v-if="status === 'pending'">
        <ion-button fill="outline" :disabled="!ready || busy" @click="resolve('reject')">
          {{ t('agent.proposal.reject') }}
        </ion-button>
        <ion-button :disabled="!ready || busy" @click="resolve('confirm')">
          {{ t('agent.proposal.confirm') }}
        </ion-button>
      </template>
      <span v-else-if="undone" class="lw-change__note">{{ t('agent.undo.undone') }}</span>
      <ion-button v-else-if="groupId" fill="outline" :disabled="busy" @click="undo">
        {{ t('agent.undo.action') }}
      </ion-button>
    </div>
  </section>
</template>

<style scoped>
.lw-change {
  padding: 12px 16px;
  border: 1px solid var(--lw-border);
  border-radius: 12px;
}

.lw-change.is-pending {
  border-color: var(--ion-color-primary);
}

.lw-change__status {
  margin: 0 0 2px;
  font-size: 13px;
  color: var(--lw-muted);
}

.is-pending .lw-change__status {
  color: var(--ion-color-primary);
}

.lw-change__title {
  margin: 0;
  font-size: 16px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
}

.lw-change__lines {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  font-size: 14px;
}

.lw-change__lines li + li {
  margin-top: 2px;
}

.lw-change__lines .is-deleted {
  color: var(--lw-muted);
  text-decoration: line-through;
}

.lw-change__lines .is-text {
  max-height: 12em;
  overflow-y: auto;
  white-space: pre-wrap;
  color: var(--lw-muted);
}

.lw-change__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.lw-change__actions:empty {
  display: none;
}

.lw-change__note {
  font-size: 14px;
  color: var(--lw-muted);
}

.is-rejected .lw-change__title,
.is-rejected .lw-change__lines {
  color: var(--lw-muted);
}
</style>

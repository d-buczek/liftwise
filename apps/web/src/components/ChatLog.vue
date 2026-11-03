<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageView } from '../agent/messages';
import { useLiveQuery } from '../composables/liveQuery';
import { catalog } from '../workout/queries';
import ChangeCard from './ChangeCard.vue';
import PlanCard from './PlanCard.vue';

// A thread's messages: the user's on the right, the agent's text and cards on the left.
// `busy` while a turn runs: proposals wait for its end. `regenerate` asks for another workout
// proposal, where the conversation can go on.
defineProps<{
  messages: MessageView[];
  busy?: boolean;
  regenerate?: (date: string) => void;
}>();

const { t } = useI18n();
const exercises = useLiveQuery(catalog, []);
const exerciseNames = computed(
  () => new Map(exercises.value.map((exercise) => [exercise.id, exercise.name_pl])),
);
</script>

<template>
  <ol class="lw-chat">
    <li
      v-for="message in messages"
      :key="message.id"
      class="lw-chat__message"
      :class="`is-${message.role}`"
    >
      <template v-for="item in message.items" :key="item.key">
        <p v-if="item.kind === 'text'" class="lw-chat__text">{{ item.text }}</p>
        <p v-else-if="item.kind === 'working'" class="lw-chat__working">
          {{ t(item.planning ? 'agent.plan.working' : 'agent.working') }}
        </p>
        <plan-card
          v-else-if="item.kind === 'plan'"
          :output="item.output"
          :exercise-names="exerciseNames"
          :ready="message.stored && !busy"
          :regenerate="regenerate"
        />
        <change-card
          v-else
          :output="item.output"
          :exercise-names="exerciseNames"
          :ready="message.stored && !busy"
        />
      </template>
    </li>
  </ol>
</template>

<style scoped>
.lw-chat {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 16px 0;
  padding: 0;
  list-style: none;
}

.lw-chat__message {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lw-chat__message.is-user {
  align-items: flex-end;
}

.lw-chat__text {
  margin: 0;
  font-size: 16px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.is-user .lw-chat__text {
  max-width: 85%;
  padding: 10px 14px;
  background: var(--lw-surface);
  border: 1px solid var(--lw-border);
  border-radius: 16px 16px 4px;
}

.lw-chat__working {
  margin: 0;
  font-size: 14px;
  color: var(--lw-muted);
}
</style>

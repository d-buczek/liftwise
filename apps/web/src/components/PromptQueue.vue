<script setup lang="ts">
import { IonButton } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { UNREACHABLE } from '../api/client';
import { useChatFailureText } from '../composables/chatFailure';
import { useFormat } from '../composables/format';
import { useToday } from '../composables/today';
import type { QueuedPrompt } from '../db/database';
import { usePromptQueueStore } from '../stores/promptQueue';
import { useSyncStore } from '../stores/sync';

// "Do przetworzenia" (§5.9.8): prompts said without the network, with the time they were said.
// Each goes to the agent when the server is reachable; its answer then appears in the thread.

const { t } = useI18n();
const format = useFormat();
const failureText = useChatFailureText();
const queue = usePromptQueueStore();
const sync = useSyncStore();
const today = useToday();

// "18:05", or "1 lis · 18:05" when said on another day.
function said(prompt: QueuedPrompt) {
  const date = prompt.localTime.slice(0, 10);
  const time = prompt.localTime.slice(11, 16);
  return date === today.value ? time : `${format.dayMonth(date)} · ${time}`;
}

function state(prompt: QueuedPrompt) {
  if (queue.sending === prompt.seq) return t('agent.queue.sending');
  if (prompt.status === 'failed') return t('agent.queue.failed');
  if (!sync.online) return t('agent.queue.waiting');
  // The device has a network, but the last sync didn't reach the server.
  if (sync.error === UNREACHABLE) return t('agent.queue.noServer');
  return t('agent.queue.queued');
}
</script>

<template>
  <section v-if="queue.prompts.length > 0" class="lw-queue" aria-labelledby="lw-queue-title">
    <h2 id="lw-queue-title" class="lw-heading">{{ t('agent.queue.title') }}</h2>
    <ol class="lw-queue__list">
      <li v-for="prompt in queue.prompts" :key="prompt.seq" class="lw-queue__item">
        <p class="lw-queue__text">{{ prompt.text }}</p>
        <p class="lw-queue__meta" aria-live="polite">
          <time :datetime="prompt.localTime">{{ said(prompt) }}</time> · {{ state(prompt) }}
        </p>
        <p v-if="prompt.status === 'failed' && prompt.error" class="lw-queue__error" role="alert">
          {{ failureText(prompt.error) }}
        </p>
        <div class="lw-queue__actions">
          <ion-button
            v-if="prompt.error?.code === 'provider_unavailable'"
            size="small"
            fill="outline"
            router-link="/settings/models"
          >
            {{ t('models.title') }}
          </ion-button>
          <ion-button
            v-if="prompt.status === 'failed'"
            size="small"
            fill="outline"
            @click="queue.retry(prompt.seq)"
          >
            {{ t('common.retry') }}
          </ion-button>
          <ion-button
            size="small"
            fill="clear"
            color="medium"
            :disabled="queue.sending === prompt.seq"
            @click="queue.remove(prompt.seq)"
          >
            {{ t('common.delete') }}
          </ion-button>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.lw-queue {
  margin: 16px 0;
}

.lw-queue__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lw-queue__item {
  padding: 10px 14px 4px;
  border: 1px dashed var(--lw-border);
  border-radius: 16px;
}

.lw-queue__text {
  margin: 0;
  font-size: 16px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.lw-queue__meta {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--lw-muted);
  font-variant-numeric: tabular-nums;
}

.lw-queue__error {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--ion-color-danger);
}

.lw-queue__actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.lw-queue__actions ion-button {
  min-height: 48px;
  margin: 0;
}
</style>

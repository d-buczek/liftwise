<script setup lang="ts">
import { newId } from '@liftwise/core';
import {
  IonButton,
  IonFooter,
  IonIcon,
  IonTextarea,
  onIonViewDidEnter,
  onIonViewWillLeave,
} from '@ionic/vue';
import { arrowUp, mic, micOutline, stop, timeOutline } from 'ionicons/icons';
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { chatFailure, useAgentChat } from '../agent/chat';
import { UNREACHABLE } from '../api/client';
import { chatView } from '../agent/messages';
import { threadMessages, threadsOn } from '../agent/queries';
import AppPage from '../components/AppPage.vue';
import ChatLog from '../components/ChatLog.vue';
import PromptQueue from '../components/PromptQueue.vue';
import { useChatFailureText } from '../composables/chatFailure';
import { useLiveQuery } from '../composables/liveQuery';
import { useToday } from '../composables/today';
import { useVoiceInput } from '../composables/voice';
import { speechNeedsNetwork, speechSupported } from '../native/speech';
import { useAuthStore } from '../stores/auth';
import { usePromptQueueStore } from '../stores/promptQueue';
import { useSyncStore } from '../stores/sync';

// The agent (§5.9): today's conversation. Typed or spoken text goes to the server, which answers
// with text and cards; the data and the stored messages come back with the sync after the turn.
// Without the network a prompt waits in the queue with the time it was said (§5.9.8).

const { t } = useI18n();
const failureText = useChatFailureText();
const auth = useAuthStore();
const sync = useSyncStore();
const queue = usePromptQueueStore();
const today = useToday();

// One thread per day (§5.9.5): the mirror's, or a new id the server creates the thread with on
// the first message. The thread this page wrote to stays until the day ends.
const todays = useLiveQuery(() => threadsOn(today.value), [], today);
const fresh = ref({ date: today.value, id: newId() });
const used = ref<{ date: string; id: string } | null>(null);
watch(today, (date) => (fresh.value = { date, id: newId() }));
const threadId = computed(() =>
  used.value?.date === today.value ? used.value.id : (todays.value[0]?.id ?? fresh.value.id),
);

const stored = useLiveQuery(() => threadMessages(threadId.value), [], threadId);
const chat = useAgentChat(threadId, () => auth.token);
const messages = computed(() => chatView(stored.value, chat.messages.value));
const busy = computed(() => chat.status.value === 'submitted' || chat.status.value === 'streaming');

// The turn's writes and its stored messages.
watch(busy, (running, was) => {
  if (was && !running) void sync.sync();
});

const draft = ref('');
const canSend = computed(() => !busy.value && draft.value.trim().length > 0);

const voice = useVoiceInput(draft);
const showMic = speechSupported();
const micDisabled = computed(() => busy.value || (speechNeedsNetwork() && !sync.online));
onIonViewWillLeave(() => voice.stop());

// When the latest live request went out: the time a prompt that didn't get through keeps.
let sentAt = new Date();

const noServer = computed(() => sync.online && sync.error === UNREACHABLE);

// Without the network or the server, or behind prompts still waiting (they run in order), a prompt
// goes to the queue.
async function send(text = draft.value) {
  const message = text.trim();
  if (!message || busy.value) return;
  voice.stop();
  used.value = { date: today.value, id: threadId.value };
  draft.value = '';
  if (!sync.online || noServer.value || queue.prompts.length > 0) {
    await queue.enqueue(threadId.value, message);
    return;
  }
  sentAt = new Date();
  await chat.sendMessage({ text: message });
}

// Enter sends, Shift+Enter breaks the line.
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void send();
}

const failure = computed(() => (chat.error.value ? chatFailure(chat.error.value) : null));

// The user message is on the server (or was never stored): it goes again with the same id.
function retry() {
  sentAt = new Date();
  void chat.regenerate();
}

// The device looked online but the request didn't get through (a weak signal at the gym): the
// prompt goes to the queue under its id, so a copy the server did get isn't sent twice; an answer
// that broke off comes with the sync.
watch(failure, (value) => {
  if (value?.code !== UNREACHABLE) return;
  const all = chat.messages.value;
  const index = all.findLastIndex((message) => message.role === 'user');
  const message = all[index];
  if (!message) return;
  const text = message.parts
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n')
    .trim();
  chat.messages.value = all.slice(0, index);
  chat.clearError();
  if (text) void queue.enqueue(threadId.value, text, { id: message.id, at: sentAt });
});

const EXAMPLES = ['log', 'edit', 'ask'] as const;

const end = ref<HTMLElement | null>(null);
const scrollToEnd = () => end.value?.scrollIntoView({ block: 'end' });
onIonViewDidEnter(scrollToEnd);
watch(
  () => [messages.value.length, messages.value.at(-1), queue.prompts.length],
  () => void nextTick(scrollToEnd),
);
</script>

<template>
  <app-page :title="t('nav.agent')">
    <template #actions>
      <ion-button router-link="/agent/threads" :aria-label="t('agent.threads.title')">
        <ion-icon slot="icon-only" :icon="timeOutline" aria-hidden="true" />
      </ion-button>
    </template>

    <div
      v-if="messages.length === 0 && !busy && queue.prompts.length === 0"
      class="lw-agent__empty"
    >
      <p class="lw-agent__lead">{{ t('agent.empty') }}</p>
      <div class="lw-agent__examples">
        <button
          v-for="example in EXAMPLES"
          :key="example"
          type="button"
          class="lw-agent__example"
          @click="draft = t(`agent.examples.${example}`)"
        >
          {{ t(`agent.examples.${example}`) }}
        </button>
      </div>
    </div>

    <chat-log :messages="messages" :busy="busy" />
    <p v-if="chat.status.value === 'submitted'" class="lw-agent__thinking" aria-live="polite">
      {{ t('agent.thinking') }}
    </p>
    <div v-if="failure" class="lw-agent__error" role="alert">
      <p>{{ failureText(failure) }}</p>
      <ion-button
        v-if="failure.code === 'provider_unavailable'"
        fill="outline"
        router-link="/settings/models"
      >
        {{ t('models.title') }}
      </ion-button>
      <ion-button fill="outline" :disabled="!sync.online" @click="retry">
        {{ t('common.retry') }}
      </ion-button>
    </div>
    <prompt-queue />
    <div ref="end" class="lw-agent__end" />

    <template #footer>
      <ion-footer class="lw-composer">
        <div class="lw-column">
          <p v-if="voice.error.value" class="lw-composer__note" role="alert">
            {{ t(`agent.voice.errors.${voice.error.value}`) }}
          </p>
          <p v-else-if="!sync.online" class="lw-composer__note">{{ t('agent.offline') }}</p>
          <p v-else-if="noServer" class="lw-composer__note">{{ t('agent.noServer') }}</p>
          <div class="lw-composer__row">
            <ion-textarea
              v-model="draft"
              class="lw-composer__input"
              :aria-label="t('agent.input')"
              :placeholder="
                voice.listening.value ? t('agent.voice.listening') : t('agent.placeholder')
              "
              :auto-grow="true"
              :rows="1"
              :maxlength="4000"
              enterkeyhint="send"
              @keydown="onKeydown"
            />
            <ion-button
              v-if="showMic"
              :fill="voice.listening.value ? 'solid' : 'outline'"
              class="lw-composer__button"
              :class="{ 'is-listening': voice.listening.value }"
              :disabled="micDisabled && !voice.listening.value"
              :aria-label="voice.listening.value ? t('agent.voice.stop') : t('agent.voice.start')"
              :aria-pressed="voice.listening.value"
              @click="voice.toggle()"
            >
              <ion-icon
                slot="icon-only"
                :icon="voice.listening.value ? mic : micOutline"
                aria-hidden="true"
              />
            </ion-button>
            <ion-button
              v-if="busy"
              fill="outline"
              class="lw-composer__button"
              :aria-label="t('agent.stop')"
              @click="chat.stop()"
            >
              <ion-icon slot="icon-only" :icon="stop" aria-hidden="true" />
            </ion-button>
            <ion-button
              v-else
              class="lw-composer__button"
              :disabled="!canSend"
              :aria-label="t('agent.send')"
              @click="send()"
            >
              <ion-icon slot="icon-only" :icon="arrowUp" aria-hidden="true" />
            </ion-button>
          </div>
        </div>
      </ion-footer>
    </template>
  </app-page>
</template>

<style scoped>
.lw-agent__empty {
  padding-top: 40px;
}

.lw-agent__lead {
  max-width: 24ch;
  margin: 0 0 16px;
  font-size: 26px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
  line-height: 1.2;
}

.lw-agent__examples {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lw-agent__example {
  min-height: 48px;
  padding: 0 14px;
  font-family: inherit;
  font-size: 16px;
  color: var(--ion-text-color);
  text-align: left;
  background: transparent;
  border: 1px solid var(--lw-border);
  border-radius: 12px;
  cursor: pointer;
}

.lw-agent__thinking {
  margin: 0;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-agent__error {
  margin: 8px 0 0;
  color: var(--ion-color-danger);
}

.lw-agent__error p {
  margin: 0 0 8px;
}

.lw-agent__end {
  height: 16px;
}

.lw-composer {
  padding: 8px 0;
  background: var(--ion-background-color);
  border-top: 1px solid var(--lw-border);
}

.lw-composer__note {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-composer__row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.lw-composer__input {
  flex: 1;
  --padding-start: 14px;
  --padding-end: 14px;
  min-height: 48px;
  max-height: 160px;
  overflow-y: auto;
  font-size: 16px;
  border: 1px solid var(--lw-border);
  border-radius: 12px;
}

.lw-composer__button {
  width: 48px;
  height: 48px;
  margin: 0;
}

.lw-composer__button.is-listening {
  animation: lw-listening 1.4s ease-in-out infinite;
}

@keyframes lw-listening {
  50% {
    opacity: 0.6;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lw-composer__button.is-listening {
    animation: none;
  }
}
</style>

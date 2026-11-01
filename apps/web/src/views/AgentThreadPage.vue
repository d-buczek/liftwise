<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { chatView } from '../agent/messages';
import { thread, threadMessages } from '../agent/queries';
import AppPage from '../components/AppPage.vue';
import ChatLog from '../components/ChatLog.vue';
import { useFormat } from '../composables/format';
import { useLiveQuery } from '../composables/liveQuery';

// An earlier conversation, read-only; its cards still undo and confirm.
const props = defineProps<{ id: string }>();

const { t } = useI18n();
const format = useFormat();
const row = useLiveQuery(
  () => thread(props.id),
  undefined,
  () => props.id,
);
const stored = useLiveQuery(
  () => threadMessages(props.id),
  [],
  () => props.id,
);
const messages = computed(() => chatView(stored.value, []));
</script>

<template>
  <app-page
    :title="row ? format.day(row.date) : t('agent.threads.title')"
    back-href="/agent/threads"
  >
    <chat-log :messages="messages" />
  </app-page>
</template>

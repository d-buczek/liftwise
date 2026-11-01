<script setup lang="ts">
import { IonItem, IonLabel, IonList } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { threadList } from '../agent/queries';
import AppPage from '../components/AppPage.vue';
import { useFormat } from '../composables/format';
import { useLiveQueryState } from '../composables/liveQuery';
import { useToday } from '../composables/today';

// Earlier conversations by day (§5.9.5): browsable, never sent to the model again.
const { t } = useI18n();
const format = useFormat();
const today = useToday();
const { data: threads, loaded } = useLiveQueryState(threadList, []);
</script>

<template>
  <app-page :title="t('agent.threads.title')" back-href="/agent">
    <p v-if="loaded && threads.length === 0" class="lw-threads__empty">
      {{ t('agent.threads.empty') }}
    </p>
    <ion-list v-else class="lw-threads">
      <ion-item
        v-for="thread in threads"
        :key="thread.id"
        :router-link="thread.date === today ? '/agent' : `/agent/threads/${thread.id}`"
      >
        <ion-label>
          {{ thread.date === today ? t('agent.threads.today') : format.day(thread.date) }}
          <p>{{ thread.preview }}</p>
        </ion-label>
      </ion-item>
    </ion-list>
  </app-page>
</template>

<style scoped>
.lw-threads {
  margin-top: 16px;
}

.lw-threads__empty {
  margin: 24px 0 0;
  color: var(--lw-muted);
}
</style>

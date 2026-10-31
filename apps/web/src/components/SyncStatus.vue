<script setup lang="ts">
import { IonItem, IonLabel } from '@ionic/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useErrorMessage } from '../i18n';
import { useSyncStore } from '../stores/sync';

// Sync state with the queued changes; a tap syncs now.
const { t, d } = useI18n();
const errorMessage = useErrorMessage();
const sync = useSyncStore();

const state = computed(() => {
  if (sync.status !== 'synced' || !sync.syncedAt) return t(`sync.${sync.status}`);
  const at = new Date(sync.syncedAt);
  const today = at.toDateString() === new Date().toDateString();
  return t('sync.synced', { time: d(at, today ? 'time' : 'dayTime') });
});
</script>

<template>
  <ion-item
    class="lw-sync"
    button
    :detail="false"
    :disabled="sync.status === 'offline'"
    :aria-label="`${state}. ${t('sync.now')}`"
    @click="sync.sync()"
  >
    <span slot="start" class="lw-sync__dot" :class="`lw-sync__dot--${sync.status}`" />
    <ion-label>
      <p class="lw-sync__state">{{ state }}</p>
      <p>{{ t('sync.pending', sync.pending) }}</p>
      <p v-if="sync.status === 'error' && sync.error" class="lw-sync__error">
        {{ errorMessage(sync.error) }}
      </p>
    </ion-label>
  </ion-item>
</template>

<style scoped>
.lw-sync {
  /* An offline device still shows its state at full contrast. */
  --opacity: 1;
  opacity: 1;
}

.lw-sync__dot {
  width: 10px;
  height: 10px;
  margin-inline-end: 12px;
  border: 2px solid var(--lw-muted);
  border-radius: 50%;
}

.lw-sync__dot--synced,
.lw-sync__dot--syncing {
  border-color: var(--ion-color-primary);
  background: var(--ion-color-primary);
}

.lw-sync__dot--error {
  border-color: var(--ion-color-danger);
  background: var(--ion-color-danger);
}

.lw-sync__state {
  color: var(--ion-text-color);
  font-weight: 600;
}

.lw-sync__error {
  color: var(--ion-color-danger);
}
</style>

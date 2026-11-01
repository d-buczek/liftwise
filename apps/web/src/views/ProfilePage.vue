<script setup lang="ts">
import { IonButton, IonTextarea } from '@ionic/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppPage from '../components/AppPage.vue';
import { useLiveQueryState } from '../composables/liveQuery';
import { saveAthleteProfile } from '../workout/actions';
import { athleteProfile } from '../workout/queries';

// Settings → Profil zawodnika (§5.9.5): a markdown document the agent gets with every message.
// Saved through the outbox like other settings; the agent proposes its own edits for confirmation.
const { t } = useI18n();
const { data: saved, loaded } = useLiveQueryState(athleteProfile, '');
const draft = ref<string | null>(null);

// An unedited draft follows the saved text, e.g. a confirmed edit of the agent.
watch(
  [saved, loaded],
  ([value, ready], old) => {
    if (ready && (draft.value === null || draft.value === old?.[0])) draft.value = value;
  },
  { immediate: true },
);

const changed = computed(() => draft.value !== null && draft.value !== saved.value);

async function save() {
  if (draft.value === null) return;
  await saveAthleteProfile(draft.value);
}
</script>

<template>
  <app-page :title="t('profile.title')" back-href="/settings">
    <p class="lw-profile__hint">{{ t('profile.hint') }}</p>
    <ion-textarea
      v-if="draft !== null"
      v-model="draft"
      class="lw-profile__text"
      :aria-label="t('profile.title')"
      :placeholder="t('profile.placeholder')"
      :auto-grow="true"
      :rows="10"
    />
    <ion-button expand="block" class="lw-profile__save" :disabled="!changed" @click="save">
      {{ t('common.save') }}
    </ion-button>
  </app-page>
</template>

<style scoped>
.lw-profile__hint {
  margin: 16px 0 12px;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-profile__text {
  --padding-start: 14px;
  --padding-end: 14px;
  font-size: 16px;
  border: 1px solid var(--lw-border);
  border-radius: 12px;
}

.lw-profile__save {
  margin: 16px 0 24px;
}
</style>

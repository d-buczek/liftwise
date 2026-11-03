<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { mic, micOutline } from 'ionicons/icons';
import { onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  PAIN_AREAS,
  TIME_CHIPS,
  TIME_MAX,
  type CheckinAnswers,
  type PainArea,
} from '../agent/checkin';
import { useVoiceInput } from '../composables/voice';
import { speechNeedsNetwork, speechSupported } from '../native/speech';
import { useSyncStore } from '../stores/sync';
import ChoiceChips from './ChoiceChips.vue';

// The check-in before a workout proposal (§5.9.6): every answer is optional, a tap is enough.
const emit = defineEmits<{ submit: [answers: CheckinAnswers]; close: [] }>();

const { t } = useI18n();
const sync = useSyncStore();

const timeMin = ref<number | null>(null);
const wellbeing = ref<number | null>(null);
const pain = ref<PainArea[]>([]);
const note = ref('');

const timeOptions = TIME_CHIPS.map((minutes) => ({
  value: minutes,
  label: t('agent.plan.timeChip', {
    time: minutes >= TIME_MAX ? `${TIME_MAX}+` : String(minutes),
  }),
}));
const wellbeingOptions = [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }));

function togglePain(area: PainArea) {
  pain.value = pain.value.includes(area)
    ? pain.value.filter((other) => other !== area)
    : [...pain.value, area];
}

const voice = useVoiceInput(note);
const showMic = speechSupported();
onBeforeUnmount(() => voice.stop());

function submit() {
  voice.stop();
  emit('submit', {
    timeMin: timeMin.value,
    wellbeing: wellbeing.value,
    pain: pain.value,
    note: note.value,
  });
}
</script>

<template>
  <ion-header>
    <ion-toolbar>
      <ion-title>{{ t('agent.plan.action') }}</ion-title>
      <ion-buttons slot="end">
        <ion-button @click="emit('close')">{{ t('common.cancel') }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
  <div class="lw-sheet__body">
    <div class="lw-column lw-checkin">
      <choice-chips
        v-model="timeMin"
        :label="t('agent.plan.time')"
        :options="timeOptions"
        :clear-to="null"
      />
      <choice-chips
        v-model="wellbeing"
        :label="t('agent.plan.wellbeing')"
        :options="wellbeingOptions"
        :clear-to="null"
      />
      <div>
        <span class="lw-checkin__label">{{ t('agent.plan.pain') }}</span>
        <div class="lw-checkin__areas">
          <button
            v-for="area in PAIN_AREAS"
            :key="area"
            type="button"
            role="checkbox"
            class="lw-checkin__area"
            :aria-checked="pain.includes(area)"
            @click="togglePain(area)"
          >
            {{ t(`agent.plan.painAreas.${area}`) }}
          </button>
        </div>
        <div class="lw-checkin__note">
          <ion-textarea
            v-model="note"
            class="lw-checkin__input"
            :aria-label="t('agent.plan.note')"
            :placeholder="voice.listening.value ? t('agent.voice.listening') : t('agent.plan.note')"
            :auto-grow="true"
            :rows="1"
            :maxlength="500"
          />
          <ion-button
            v-if="showMic"
            :fill="voice.listening.value ? 'solid' : 'outline'"
            class="lw-checkin__mic"
            :disabled="speechNeedsNetwork() && !sync.online && !voice.listening.value"
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
        </div>
        <p v-if="voice.error.value" class="lw-checkin__error" role="alert">
          {{ t(`agent.voice.errors.${voice.error.value}`) }}
        </p>
      </div>
      <ion-button expand="block" class="lw-checkin__submit" @click="submit">
        {{ t('agent.plan.submit') }}
      </ion-button>
    </div>
  </div>
</template>

<style scoped>
.lw-checkin {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.lw-checkin__label {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-checkin__areas {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lw-checkin__area {
  height: 48px;
  padding: 0 14px;
  font-family: inherit;
  font-size: 16px;
  color: var(--ion-text-color);
  background: transparent;
  border: 1px solid var(--lw-border);
  border-radius: 12px;
  cursor: pointer;
}

.lw-checkin__area[aria-checked='true'] {
  color: var(--ion-color-primary-contrast);
  background: var(--ion-color-primary);
  border-color: var(--ion-color-primary);
}

.lw-checkin__note {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.lw-checkin__input {
  flex: 1;
  min-height: 48px;
  --padding-start: 12px;
  --padding-end: 12px;
  border: 1px solid var(--lw-border);
  border-radius: 12px;
}

.lw-checkin__mic {
  width: 48px;
  height: 48px;
  margin: 0;
}

.lw-checkin__error {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--ion-color-danger);
}

.lw-checkin__submit {
  margin: 0;
}
</style>

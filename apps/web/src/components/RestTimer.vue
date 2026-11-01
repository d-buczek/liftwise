<script setup lang="ts">
import { IonButton, IonFooter } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { useFormat } from '../composables/format';
import { REST_ADJUST_S, useRestStore } from '../stores/rest';

// The rest bar at the bottom of the workout (§5.3): the countdown, ±15 s and skip; at the end
// it turns solid until dismissed or the next set.
const { t } = useI18n();
const format = useFormat();
const rest = useRestStore();
</script>

<template>
  <ion-footer
    v-if="rest.running || rest.finished"
    class="lw-rest"
    :class="{ 'is-finished': rest.finished }"
  >
    <div v-if="rest.running" class="lw-rest__track" aria-hidden="true">
      <div class="lw-rest__bar" :style="{ transform: `scaleX(${rest.progress})` }" />
    </div>
    <div class="lw-rest__row">
      <template v-if="rest.running">
        <div
          class="lw-rest__time"
          role="timer"
          :aria-label="t('rest.timer', { time: format.clock(rest.remainingS) })"
        >
          <span class="lw-rest__label">{{ t('rest.label') }}</span>
          <span class="lw-num">{{ format.clock(rest.remainingS) }}</span>
        </div>
        <ion-button
          fill="outline"
          class="lw-rest__button"
          :aria-label="t('rest.lessLabel', { value: REST_ADJUST_S })"
          @click="rest.adjust(-REST_ADJUST_S)"
        >
          {{ t('rest.less', { value: REST_ADJUST_S }) }}
        </ion-button>
        <ion-button
          fill="outline"
          class="lw-rest__button"
          :aria-label="t('rest.moreLabel', { value: REST_ADJUST_S })"
          @click="rest.adjust(REST_ADJUST_S)"
        >
          {{ t('rest.more', { value: REST_ADJUST_S }) }}
        </ion-button>
        <ion-button fill="clear" class="lw-rest__button" @click="rest.skip()">
          {{ t('rest.skip') }}
        </ion-button>
      </template>
      <template v-else>
        <p class="lw-rest__finished" role="status">{{ t('rest.finished') }}</p>
        <ion-button fill="outline" class="lw-rest__button" @click="rest.dismiss()">
          {{ t('common.close') }}
        </ion-button>
      </template>
    </div>
  </ion-footer>
</template>

<style scoped>
.lw-rest {
  background: var(--lw-surface);
  border-top: 1px solid var(--lw-border);
  box-shadow: none;
}

.lw-rest__track {
  height: 3px;
  background: var(--lw-border);
}

/* The rest left, shrinking towards the start. */
.lw-rest__bar {
  height: 100%;
  background: var(--ion-color-primary);
  transform-origin: left;
  transition: transform 0.25s linear;
}

.lw-rest__row {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: var(--lw-content-max);
  min-height: 72px;
  margin-inline: auto;
  padding: 8px 16px;
}

.lw-rest__time {
  display: grid;
  flex: 1;
  line-height: 1;
}

.lw-rest__label {
  font-size: 13px;
  color: var(--lw-muted);
}

.lw-rest__time .lw-num {
  font-size: 40px;
}

.lw-rest__button {
  --border-radius: 12px;
  --border-color: var(--lw-border);
  --color: var(--ion-text-color);
  height: 48px;
  margin: 0;
  font-size: 16px;
}

.lw-rest__finished {
  flex: 1;
  margin: 0;
  font-size: 26px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
}

/* The one moment the timer asks for attention. */
.lw-rest.is-finished {
  color: var(--ion-color-primary-contrast);
  background: var(--ion-color-primary);
  border-top-color: var(--ion-color-primary);
}

.lw-rest.is-finished .lw-rest__button {
  --border-color: currentColor;
  --color: var(--ion-color-primary-contrast);
}

@media (prefers-reduced-motion: reduce) {
  .lw-rest__bar {
    transition: none;
  }
}
</style>

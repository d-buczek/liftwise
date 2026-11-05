<script setup lang="ts">
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { useThemeStore } from '../stores/theme';
import ProgressLine from './ProgressLine.vue';

// Every screen: a toolbar with the title and a content column of limited width. A screen that
// measures progress (§5.13) shows its line under the toolbar: `progress` as a share of the work,
// `week` as the days of a week. In the temper theme the share also sets the color of the steel.
defineProps<{
  title: string;
  backHref?: string;
  progress?: number;
  week?: boolean[];
  steel?: number;
}>();

const { t } = useI18n();
const theme = useThemeStore();
</script>

<template>
  <ion-page class="lw-page">
    <div
      v-if="steel !== undefined && theme.current === 'temper'"
      class="lw-steel"
      aria-hidden="true"
    >
      <i
        v-for="stage in 4"
        :key="stage"
        :data-stage="stage - 1"
        :class="{ 'is-on': steel === stage - 1 }"
      />
    </div>
    <ion-header>
      <ion-toolbar :class="{ 'lw-page__lined': progress !== undefined || week }">
        <ion-buttons v-if="backHref" slot="start">
          <ion-back-button :default-href="backHref" :text="t('common.back')" />
        </ion-buttons>
        <ion-title>
          <span class="lw-page__title">
            <span class="lw-page__title-text">{{ title }}</span>
            <slot name="title-end" />
          </span>
        </ion-title>
        <ion-buttons slot="end">
          <slot name="actions" />
        </ion-buttons>
      </ion-toolbar>
      <progress-line v-if="progress !== undefined || week" :value="progress" :days="week" />
    </ion-header>
    <ion-content>
      <div class="lw-column">
        <slot />
      </div>
    </ion-content>
    <slot name="footer" />
  </ion-page>
</template>

<style scoped>
/* The line takes the place of the hairline under the toolbar. */
.lw-page__lined {
  --border-width: 0;
}

/* What follows the title stays whole: a long title gives way with its ellipsis. */
.lw-page__title {
  display: flex;
  align-items: center;
  gap: 4px;
}

.lw-page__title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

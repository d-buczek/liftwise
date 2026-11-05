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

// Every screen: a toolbar with the title and a content column of limited width.
defineProps<{ title: string; backHref?: string }>();

const { t } = useI18n();
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
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

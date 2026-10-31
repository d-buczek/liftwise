<script setup lang="ts">
import { IonToast } from '@ionic/vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';
import { useI18n } from 'vue-i18n';

// A new version waits for the user, so it never reloads in the middle of a workout.
const { t } = useI18n();
const { needRefresh, updateServiceWorker } = useRegisterSW();

const buttons = [{ text: t('update.reload'), handler: () => void updateServiceWorker() }];
</script>

<template>
  <ion-toast
    :is-open="needRefresh"
    :message="t('update.available')"
    :buttons="buttons"
    position="top"
    @did-dismiss="needRefresh = false"
  />
</template>

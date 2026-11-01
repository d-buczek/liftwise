<script setup lang="ts">
import { IonButton } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import AppPage from '../components/AppPage.vue';

// Sections built in later tickets (LW-09, LW-12) until they get their screens.
defineProps<{ section: 'history' | 'agent' }>();

const { t } = useI18n();
</script>

<template>
  <app-page :title="t(`nav.${section}`)">
    <div class="lw-empty">
      <p class="lw-empty__lead">{{ t(`empty.${section}`) }}</p>
      <p class="lw-muted">{{ t('empty.hint') }}</p>
      <ion-button fill="outline" router-link="/settings/equipment">
        {{ t('empty.action') }}
      </ion-button>
    </div>
  </app-page>
</template>

<style scoped>
.lw-empty {
  padding-top: 40px;
}

.lw-empty__lead {
  max-width: 24ch;
  margin: 0 0 12px;
  font-size: 26px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
  line-height: 1.2;
}
</style>

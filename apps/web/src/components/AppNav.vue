<script setup lang="ts">
import { APP_NAME } from '@liftwise/core';
import { IonContent, IonIcon, IonItem, IonLabel, IonList, IonMenu } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { SECTIONS } from '../navigation';

// Side menu of the split pane; shown only on wide screens, phones use the tab bar.
defineProps<{ disabled?: boolean }>();

const { t } = useI18n();
const route = useRoute();
</script>

<template>
  <ion-menu content-id="main" :swipe-gesture="false" :disabled="disabled">
    <ion-content class="lw-nav">
      <div class="lw-nav__layout">
        <p class="lw-nav__brand">{{ APP_NAME }}</p>
        <nav :aria-label="t('nav.label')">
          <ion-list lines="none">
            <ion-item
              v-for="section in SECTIONS"
              :key="section.tab"
              button
              :detail="false"
              :router-link="section.path"
              router-direction="root"
              :class="{ 'lw-nav__active': route.path.startsWith(section.path) }"
            >
              <ion-icon slot="start" :icon="section.icon" aria-hidden="true" />
              <ion-label>{{ t(`nav.${section.tab}`) }}</ion-label>
            </ion-item>
          </ion-list>
        </nav>
        <div class="lw-nav__footer">
          <slot name="footer" />
        </div>
      </div>
    </ion-content>
  </ion-menu>
</template>

<style scoped>
.lw-nav {
  --background: var(--lw-menu-background);
}

.lw-nav__layout {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 0 12px 16px;
}

.lw-nav__brand {
  margin: 28px 12px 20px;
  font-size: 26px;
  font-stretch: 62%;
  font-weight: 800;
  line-height: 1;
}

.lw-nav ion-list {
  background: transparent;
}

.lw-nav ion-item {
  --background: transparent;
  --border-radius: 8px;
  --color: var(--lw-muted);
  margin-bottom: 2px;
  font-weight: 500;
}

.lw-nav ion-item.lw-nav__active {
  --background: var(--lw-surface);
  --color: var(--ion-text-color);
  font-weight: 700;
}

.lw-nav ion-item.lw-nav__active ion-icon {
  color: var(--ion-color-primary);
}

.lw-nav__footer {
  margin-top: auto;
  padding: 0 12px;
}
</style>

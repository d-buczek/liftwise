<script setup lang="ts">
import { IonApp, IonRouterOutlet, IonSplitPane } from '@ionic/vue';
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppNav from './components/AppNav.vue';
import SyncStatus from './components/SyncStatus.vue';
import UpdateToast from './components/UpdateToast.vue';
import { useAuthStore } from './stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const bare = computed(() => route.meta.bare === true);

// A revoked token (401 during sync) or revoking this device ends the session.
watch(
  () => auth.device,
  (device) => {
    if (!device) void router.replace({ name: 'pair' });
  },
);
</script>

<template>
  <ion-app>
    <ion-split-pane content-id="main" when="lg" :disabled="bare">
      <app-nav :disabled="bare">
        <template #footer>
          <sync-status />
        </template>
      </app-nav>
      <ion-router-outlet id="main" />
    </ion-split-pane>
    <update-toast />
  </ion-app>
</template>

<style>
ion-split-pane {
  --side-width: 240px;
  --side-max-width: 240px;
}
</style>

<script setup lang="ts">
import { APP_NAME } from '@liftwise/core';
import { IonButton, IonContent, IonInput, IonPage } from '@ionic/vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../api/client';
import { useErrorMessage } from '../i18n';
import { useAuthStore } from '../stores/auth';

const { t } = useI18n();
const errorMessage = useErrorMessage();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

// The QR code of another device opens /pair?code=…
const code = ref(typeof route.query.code === 'string' ? route.query.code : '');
const coarse = window.matchMedia('(pointer: coarse)').matches;
const name = ref(t(coarse ? 'pair.defaultName.mobile' : 'pair.defaultName.desktop'));
const token = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

async function run(pair: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    await pair();
    await router.replace('/calendar');
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.code : 'unknown';
  } finally {
    busy.value = false;
  }
}

const submitCode = () => run(() => auth.pairWithCode(code.value, name.value));
const submitToken = () => run(() => auth.pairWithToken(token.value.trim()));
</script>

<template>
  <ion-page>
    <ion-content>
      <main class="lw-pair">
        <p class="lw-pair__brand">{{ APP_NAME }}</p>
        <h1 class="lw-pair__title">{{ t('pair.title') }}</h1>
        <p v-if="auth.storageFailed" class="lw-pair__error" role="alert">
          {{ t('pair.storageFailed') }}
        </p>
        <p class="lw-muted">{{ t('pair.intro') }}</p>

        <div class="lw-pair__form">
          <ion-input
            v-model="code"
            class="lw-pair__code"
            label-placement="stacked"
            fill="outline"
            autocapitalize="characters"
            autocomplete="off"
            :spellcheck="false"
            :maxlength="16"
            @keyup.enter="submitCode"
          >
            <span slot="label" class="lw-pair__code-label">{{ t('pair.code') }}</span>
          </ion-input>
          <ion-input
            v-model="name"
            :label="t('pair.name')"
            label-placement="stacked"
            fill="outline"
            :maxlength="64"
            @keyup.enter="submitCode"
          />
          <p v-if="error" class="lw-pair__error" role="alert">{{ errorMessage(error) }}</p>
          <ion-button expand="block" :disabled="busy" @click="submitCode">
            {{ t('pair.submit') }}
          </ion-button>
        </div>

        <details class="lw-pair__first">
          <summary>{{ t('pair.firstDevice') }}</summary>
          <i18n-t keypath="pair.tokenIntro" tag="p" class="lw-muted">
            <template #command><code>device:create</code></template>
          </i18n-t>
          <div class="lw-pair__form">
            <ion-input
              v-model="token"
              type="password"
              :label="t('pair.token')"
              label-placement="stacked"
              fill="outline"
              autocomplete="off"
              @keyup.enter="submitToken"
            />
            <ion-button fill="outline" expand="block" :disabled="busy" @click="submitToken">
              {{ t('pair.submitToken') }}
            </ion-button>
          </div>
        </details>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.lw-pair {
  max-width: 420px;
  margin: 0 auto;
  padding: 48px 20px 32px;
}

.lw-pair__brand {
  margin: 0 0 40px;
  font-size: 20px;
  font-stretch: 62%;
  font-weight: 800;
}

.lw-pair__title {
  margin: 0 0 8px;
  font-size: 40px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
  line-height: 1.1;
}

.lw-pair__form {
  display: grid;
  gap: 16px;
  margin-top: 24px;
}

/* The code reads like numerals cast into a plate. */
.lw-pair__code {
  font-size: 40px;
  font-stretch: var(--lw-narrow);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

/* The label is light DOM, so it can drop the code's type. */
.lw-pair__code-label {
  font-size: 16px;
  font-stretch: 100%;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
}

.lw-pair__error {
  margin: 0;
  color: var(--ion-color-danger);
}

.lw-pair__first {
  margin-top: 40px;
  padding-top: 16px;
  border-top: 1px solid var(--lw-border);
}

.lw-pair__first summary {
  cursor: pointer;
  font-weight: 600;
}
</style>

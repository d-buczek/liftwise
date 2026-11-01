<script setup lang="ts">
import type { ModelSettings, Provider, ProvidersResponse } from '@liftwise/core';
import {
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  onIonViewWillEnter,
} from '@ionic/vue';
import { checkmarkCircle, closeCircleOutline } from 'ionicons/icons';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../api/client';
import AppPage from '../components/AppPage.vue';
import ChoiceChips from '../components/ChoiceChips.vue';
import { useLiveQueryState } from '../composables/liveQuery';
import { useErrorMessage } from '../i18n';
import { useAuthStore } from '../stores/auth';
import { saveModelSettings } from '../workout/actions';
import { savedModelSettings } from '../workout/queries';

// Settings → Modele (§5.10, §6.7): which providers have a key on the server, and the provider
// and model id of each role. Only providers with a key can be chosen; no key is ever shown.

const ROLES = ['fast', 'planner'] as const;
type Role = (typeof ROLES)[number];

const { t } = useI18n();
const errorMessage = useErrorMessage();
const auth = useAuthStore();
const status = ref<ProvidersResponse | null>(null);
const error = ref<string | null>(null);
const { data: saved, loaded } = useLiveQueryState(savedModelSettings, null);
const form = ref<ModelSettings | null>(null);

async function load() {
  if (!auth.token) return;
  error.value = null;
  try {
    status.value = await api.providers(auth.token);
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.code : 'unknown';
  }
}
onIonViewWillEnter(load);

// A plain copy to edit (`structuredClone` can't copy the reactive response).
const copy = ({ fast, planner }: ModelSettings): ModelSettings => ({
  fast: { ...fast },
  planner: { ...planner },
});

// The form starts from the saved choice, or from what the server uses without one.
watch(
  [loaded, status],
  () => {
    if (form.value || !loaded.value || !status.value) return;
    form.value = copy(saved.value ?? status.value.models);
  },
  { immediate: true },
);

const configured = computed(
  () => status.value?.providers.filter((provider) => provider.configured) ?? [],
);
const providerOptions = computed(() =>
  configured.value.map(({ id }) => ({ value: id, label: t(`models.providers.${id}`) })),
);
const defaultModel = (provider: Provider, role: Role) =>
  status.value?.providers.find((candidate) => candidate.id === provider)?.defaults[role] ?? '';
const isConfigured = (provider: Provider) => configured.value.some(({ id }) => id === provider);

// Another provider brings its default model for the role.
function setProvider(role: Role, provider: Provider) {
  if (!form.value || form.value[role].provider === provider) return;
  form.value[role] = { provider, model: defaultModel(provider, role) };
}

const current = computed(() => saved.value ?? status.value?.models ?? null);
const changed = computed(
  () => form.value !== null && JSON.stringify(form.value) !== JSON.stringify(current.value),
);
const valid = computed(
  () =>
    form.value !== null &&
    ROLES.every((role) => {
      const choice = form.value?.[role];
      return choice && choice.model.trim() !== '' && isConfigured(choice.provider);
    }),
);

async function save() {
  if (!form.value || !valid.value) return;
  const value: ModelSettings = {
    fast: { ...form.value.fast, model: form.value.fast.model.trim() },
    planner: { ...form.value.planner, model: form.value.planner.model.trim() },
  };
  await saveModelSettings(value);
  form.value = copy(value);
}
</script>

<template>
  <app-page :title="t('models.title')" back-href="/settings">
    <template v-if="error">
      <p class="lw-models__error" role="alert">{{ errorMessage(error) }}</p>
      <ion-button fill="outline" @click="load">{{ t('common.retry') }}</ion-button>
    </template>

    <template v-if="status">
      <h2 class="lw-heading">{{ t('models.providersTitle') }}</h2>
      <ion-list>
        <ion-item v-for="provider in status.providers" :key="provider.id">
          <ion-icon
            slot="start"
            :icon="provider.configured ? checkmarkCircle : closeCircleOutline"
            :color="provider.configured ? 'primary' : 'medium'"
            aria-hidden="true"
          />
          <ion-label>{{ t(`models.providers.${provider.id}`) }}</ion-label>
          <ion-note slot="end">
            {{ provider.configured ? t('models.configured') : t('models.missing') }}
          </ion-note>
        </ion-item>
      </ion-list>
      <p class="lw-models__note">{{ t('models.keysHint') }}</p>

      <p v-if="configured.length === 0" class="lw-models__error" role="alert">
        {{ t('models.noProvider') }}
      </p>
      <template v-else-if="form">
        <section v-for="role in ROLES" :key="role" class="lw-models__role">
          <h2 class="lw-heading">{{ t(`models.roles.${role}`) }}</h2>
          <p class="lw-models__note">{{ t(`models.roleHints.${role}`) }}</p>
          <choice-chips
            :model-value="form[role].provider"
            :label="t('models.provider')"
            :options="providerOptions"
            @update:model-value="setProvider(role, $event)"
          />
          <p v-if="!isConfigured(form[role].provider)" class="lw-models__error" role="alert">
            {{
              t('models.providerMissing', {
                provider: t(`models.providers.${form[role].provider}`),
              })
            }}
          </p>
          <ion-list class="lw-models__model">
            <ion-item>
              <ion-input
                v-model="form[role].model"
                :label="t('models.model')"
                label-placement="stacked"
                autocapitalize="off"
                :spellcheck="false"
                :helper-text="
                  t('models.defaultModel', { model: defaultModel(form[role].provider, role) })
                "
              />
              <ion-button
                slot="end"
                fill="clear"
                :disabled="form[role].model === defaultModel(form[role].provider, role)"
                @click="form[role].model = defaultModel(form[role].provider, role)"
              >
                {{ t('models.useDefault') }}
              </ion-button>
            </ion-item>
          </ion-list>
        </section>

        <ion-button
          expand="block"
          class="lw-models__save"
          :disabled="!changed || !valid"
          @click="save"
        >
          {{ t('common.save') }}
        </ion-button>
      </template>
    </template>
  </app-page>
</template>

<style scoped>
.lw-models__note {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--lw-muted);
}

.lw-models__error {
  margin: 16px 0 8px;
  color: var(--ion-color-danger);
}

.lw-models__role .lw-models__note {
  margin: 0 0 12px;
}

.lw-models__model {
  margin-top: 12px;
}

.lw-models__save {
  margin: 24px 0;
}
</style>

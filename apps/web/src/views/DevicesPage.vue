<script setup lang="ts">
import {
  alertController,
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  onIonViewWillEnter,
} from '@ionic/vue';
import { trashOutline } from 'ionicons/icons';
import { computed, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError, type DeviceInfo } from '../api/client';
import AppPage from '../components/AppPage.vue';
import QrCode from '../components/QrCode.vue';
import { useErrorMessage } from '../i18n';
import { useAuthStore } from '../stores/auth';

// Devices live on the server only, so this screen needs the network (§6.9).
const { t, d } = useI18n();
const errorMessage = useErrorMessage();
const auth = useAuthStore();
const token = () => auth.token ?? '';

const devices = ref<DeviceInfo[] | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);

async function handle(caught: unknown) {
  // This device was revoked elsewhere: back to pairing.
  if (caught instanceof ApiError && caught.status === 401) return auth.forget();
  error.value = caught instanceof ApiError ? caught.code : 'unknown';
}

async function load() {
  error.value = null;
  try {
    devices.value = (await api.listDevices(token())).devices;
  } catch (caught) {
    await handle(caught);
  }
}
onIonViewWillEnter(load);

function when(iso: string) {
  const at = new Date(iso);
  return d(at, at.toDateString() === new Date().toDateString() ? 'time' : 'dayTime');
}

// Pairing a new device: a one-time code, valid for 5 minutes, as text and QR.
const pairing = ref<{ code: string; expiresAt: number } | null>(null);
const now = ref(Date.now());
const timer = setInterval(() => (now.value = Date.now()), 1_000);
onUnmounted(() => clearInterval(timer));

const secondsLeft = computed(() =>
  pairing.value ? Math.max(0, Math.ceil((pairing.value.expiresAt - now.value) / 1_000)) : 0,
);
const countdown = computed(
  () => `${Math.floor(secondsLeft.value / 60)}:${String(secondsLeft.value % 60).padStart(2, '0')}`,
);
// Grouped by four, easier to read out and type; redeem ignores the space.
const shownCode = computed(() => pairing.value?.code.replace(/^(.{4})/, '$1 ') ?? '');
const pairUrl = computed(
  () => `${window.location.origin}/pair?code=${encodeURIComponent(pairing.value?.code ?? '')}`,
);

async function createCode() {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const { code, expiresAt } = await api.createPairingCode(token());
    pairing.value = { code, expiresAt: Date.parse(expiresAt) };
    now.value = Date.now();
  } catch (caught) {
    await handle(caught);
  } finally {
    busy.value = false;
  }
}

function finishPairing() {
  pairing.value = null;
  void load();
}

async function revoke(device: DeviceInfo) {
  const alert = await alertController.create({
    header: t('devices.revokeTitle', { name: device.name }),
    message: device.current ? t('devices.revokeCurrent') : t('devices.revokeMessage'),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('devices.revoke'), role: 'destructive' },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  if (role !== 'destructive') return;
  try {
    await api.revokeDevice(token(), device.id);
    if (device.current) await auth.forget();
    else await load();
  } catch (caught) {
    await handle(caught);
  }
}
</script>

<template>
  <app-page :title="t('settings.devices')" back-href="/settings">
    <p v-if="error" class="lw-devices__error" role="alert">{{ errorMessage(error) }}</p>
    <ion-button v-if="error && devices === null" fill="outline" @click="load">
      {{ t('common.retry') }}
    </ion-button>

    <section v-if="pairing" class="lw-pairing" aria-live="polite">
      <p class="lw-muted">{{ t('devices.pairIntro') }}</p>
      <div class="lw-pairing__codes">
        <p class="lw-pairing__code lw-num" :class="{ 'lw-pairing__code--expired': !secondsLeft }">
          {{ shownCode }}
        </p>
        <qr-code
          v-if="secondsLeft"
          class="lw-pairing__qr"
          :text="pairUrl"
          :label="t('devices.qr')"
        />
      </div>
      <p v-if="secondsLeft" class="lw-muted">{{ t('devices.expiresIn', { time: countdown }) }}</p>
      <p v-else>{{ t('devices.expired') }}</p>
      <div class="lw-pairing__actions">
        <ion-button v-if="!secondsLeft" :disabled="busy" @click="createCode">
          {{ t('devices.newCode') }}
        </ion-button>
        <ion-button fill="outline" @click="finishPairing">{{ t('devices.done') }}</ion-button>
      </div>
    </section>
    <ion-button v-else-if="devices" class="lw-devices__pair" :disabled="busy" @click="createCode">
      {{ t('devices.pair') }}
    </ion-button>

    <ion-list v-if="devices" class="lw-devices">
      <ion-item v-for="device in devices" :key="device.id">
        <ion-label>
          <h2>
            {{ device.name }}
            <ion-note v-if="device.current" color="primary">{{ t('devices.current') }}</ion-note>
          </h2>
          <p>{{ t('devices.added', { date: d(new Date(device.createdAt), 'day') }) }}</p>
          <p>
            {{
              device.lastSeenAt
                ? t('devices.lastSeen', { date: when(device.lastSeenAt) })
                : t('devices.neverSeen')
            }}
          </p>
        </ion-label>
        <ion-button
          slot="end"
          fill="clear"
          color="danger"
          :aria-label="`${t('devices.revoke')}: ${device.name}`"
          @click="revoke(device)"
        >
          <ion-icon slot="icon-only" :icon="trashOutline" aria-hidden="true" />
        </ion-button>
      </ion-item>
    </ion-list>
  </app-page>
</template>

<style scoped>
.lw-devices__error {
  color: var(--ion-color-danger);
}

.lw-devices__pair {
  margin: 16px 0;
}

.lw-devices h2 {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-weight: 600;
}

.lw-pairing {
  margin: 16px 0 24px;
  padding: 20px;
  border: 1px solid var(--lw-border);
  border-radius: 12px;
  background: var(--lw-surface);
}

.lw-pairing__codes {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: center;
  margin: 8px 0;
}

/* The one loud element of the screen: the code, cast-plate numerals. */
.lw-pairing__code {
  margin: 0;
  font-size: 64px;
  line-height: 1;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.lw-pairing__code--expired {
  color: var(--lw-muted);
  text-decoration: line-through;
}

.lw-pairing__qr {
  width: 176px;
}

.lw-pairing__actions {
  display: flex;
  gap: 8px;
}
</style>

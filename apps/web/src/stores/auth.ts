import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api/client';
import type { DeviceAuth } from '../db/database';
import { forgetDevice, loadDevice, saveDevice } from '../native/deviceStorage';

// This device's pairing (§6.8). Without a token the app shows only the pairing screen.
export const useAuthStore = defineStore('auth', () => {
  const device = ref<DeviceAuth | null>(null);
  const loaded = ref(false);
  const storageFailed = ref(false);
  const token = computed(() => device.value?.token ?? null);

  // Unreadable storage must not stop the app from mounting: the pairing screen explains it, and
  // the next navigation reads again, as `loaded` stays false.
  async function load() {
    try {
      device.value = await loadDevice();
      storageFailed.value = false;
      loaded.value = true;
    } catch (error) {
      console.error(error);
      device.value = null;
      storageFailed.value = true;
    }
  }

  async function save(deviceId: string, newToken: string) {
    const auth: DeviceAuth = { id: 'device', deviceId, token: newToken };
    await saveDevice(auth);
    device.value = auth;
    storageFailed.value = false;
    loaded.value = true;
  }

  // Another paired device showed the code (QR or text).
  async function pairWithCode(code: string, name: string) {
    const { deviceId, token: newToken } = await api.redeemPairingCode(code, name);
    await save(deviceId, newToken);
  }

  // The first device: the token printed once by `device:create`; listing devices checks it.
  async function pairWithToken(newToken: string) {
    const { devices } = await api.listDevices(newToken);
    const current = devices.find((candidate) => candidate.current);
    if (!current) throw new Error('the device list has no current device');
    await save(current.id, newToken);
  }

  // The local mirror and outbox stay: pairing again pushes what is still queued.
  async function forget() {
    await forgetDevice();
    device.value = null;
    storageFailed.value = false;
  }

  return { device, loaded, storageFailed, token, load, pairWithCode, pairWithToken, forget };
});

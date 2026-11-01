import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Capacitor } from '@capacitor/core';
import { db, type DeviceAuth } from '../db/database';

// This device's pairing (§6.8): Keystore-backed secure storage on Android, IndexedDB on the PC.
const KEY = 'device';

function isDeviceAuth(value: unknown): value is DeviceAuth {
  return (
    typeof value === 'object' &&
    value !== null &&
    'deviceId' in value &&
    typeof value.deviceId === 'string' &&
    'token' in value &&
    typeof value.token === 'string'
  );
}

export async function loadDevice(): Promise<DeviceAuth | null> {
  if (!Capacitor.isNativePlatform()) return (await db.device.get(KEY)) ?? null;
  // An unreadable value (e.g. its Keystore key is gone) means pairing again.
  const value = await SecureStorage.get(KEY, false).catch(() => null);
  return isDeviceAuth(value) ? { id: KEY, deviceId: value.deviceId, token: value.token } : null;
}

export async function saveDevice(auth: DeviceAuth) {
  if (Capacitor.isNativePlatform()) await SecureStorage.set(KEY, auth, false);
  else await db.device.put(auth);
}

export async function forgetDevice() {
  if (Capacitor.isNativePlatform()) await SecureStorage.remove(KEY);
  else await db.device.delete(KEY);
}

import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Capacitor } from '@capacitor/core';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { db, type DeviceAuth } from '../db/database';
import { forgetDevice, loadDevice, saveDevice } from './deviceStorage';

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    get: vi.fn<typeof SecureStorage.get>(),
    set: vi.fn<typeof SecureStorage.set>(),
    remove: vi.fn<typeof SecureStorage.remove>(),
  },
}));

const auth: DeviceAuth = { id: 'device', deviceId: 'd1', token: 'secret' };

describe('device storage', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await db.device.clear();
  });

  it('keeps the pairing in IndexedDB in the browser', async () => {
    await saveDevice(auth);
    expect(await loadDevice()).toEqual(auth);
    await forgetDevice();
    expect(await loadDevice()).toBeNull();
    expect(SecureStorage.set).not.toHaveBeenCalled();
  });

  it('keeps it in the secure storage on Android, never in IndexedDB', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    await saveDevice(auth);
    expect(SecureStorage.set).toHaveBeenCalledWith('device', auth, false);
    expect(await db.device.count()).toBe(0);

    vi.mocked(SecureStorage.get).mockResolvedValue({ deviceId: 'd1', token: 'secret' });
    expect(await loadDevice()).toEqual(auth);

    await forgetDevice();
    expect(SecureStorage.remove).toHaveBeenCalledWith('device');
  });

  it('treats a broken or unreadable value as no pairing', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.mocked(SecureStorage.get).mockResolvedValue({ token: 42 });
    expect(await loadDevice()).toBeNull();
    vi.mocked(SecureStorage.get).mockRejectedValue(new Error('key permanently invalidated'));
    expect(await loadDevice()).toBeNull();
  });
});

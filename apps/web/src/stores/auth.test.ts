import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '../api/client';
import { db } from '../db/database';
import { mockApi, pulledBench, resetDb } from '../testing';
import { useAuthStore } from './auth';

// A new start of the app: the store knows only what is in the device's storage.
async function restart() {
  setActivePinia(createPinia());
  const auth = useAuthStore();
  await auth.load();
  return auth;
}

const device = (id: string, current: boolean) => ({
  id,
  name: id,
  createdAt: '2026-11-01T10:00:00.000Z',
  lastSeenAt: null,
  current,
});

describe('auth store', () => {
  beforeEach(async () => {
    await resetDb();
    setActivePinia(createPinia());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('knows only after loading whether the device is paired', async () => {
    const auth = useAuthStore();
    expect(auth.loaded).toBe(false);
    await auth.load();
    expect(auth.loaded).toBe(true);
    expect(auth.token).toBeNull();
  });

  describe('pairing with a code', () => {
    it('sends the code and name, and the pairing survives a restart', async () => {
      const api = mockApi(() => ({ status: 200, body: { deviceId: 'phone', token: 'new-token' } }));
      await useAuthStore().pairWithCode('ABC123', 'Telefon');

      const [path, init] = api.mock.calls[0] ?? [];
      expect(path).toBe('/api/auth/pairing/redeem');
      expect(JSON.parse(init?.body as string)).toEqual({ code: 'ABC123', name: 'Telefon' });
      expect(useAuthStore().token).toBe('new-token');

      const restarted = await restart();
      expect(restarted.token).toBe('new-token');
      expect(restarted.device?.deviceId).toBe('phone');
    });

    it('stays unpaired when the code is refused, and the caller gets the reason', async () => {
      mockApi(() => ({ status: 400, body: { error: 'invalid_code' } }));
      const error: unknown = await useAuthStore()
        .pairWithCode('WRONG', 'Telefon')
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe('invalid_code');
      expect(useAuthStore().token).toBeNull();
      expect((await restart()).token).toBeNull();
    });
  });

  describe('pairing with a token', () => {
    it("checks the token by listing devices and keeps this device's id", async () => {
      const api = mockApi(() => ({
        status: 200,
        body: { devices: [device('other', false), device('mine', true)] },
      }));
      await useAuthStore().pairWithToken('printed-token');

      const headers = new Headers(api.mock.calls[0]?.[1]?.headers);
      expect(headers.get('Authorization')).toBe('Bearer printed-token');
      const restarted = await restart();
      expect(restarted.token).toBe('printed-token');
      expect(restarted.device?.deviceId).toBe('mine');
    });

    it('does not keep an expired or revoked token', async () => {
      mockApi(() => ({ status: 401, body: { error: 'unauthorized' } }));
      await expect(useAuthStore().pairWithToken('expired')).rejects.toMatchObject({
        status: 401,
        code: 'unauthorized',
      });
      expect(useAuthStore().token).toBeNull();
      expect(await db.device.count()).toBe(0);
    });

    it('does not keep a token when it cannot be checked offline', async () => {
      vi.stubGlobal('fetch', async () => Promise.reject(new TypeError('Failed to fetch')));
      await expect(useAuthStore().pairWithToken('printed-token')).rejects.toMatchObject({
        code: 'unreachable',
      });
      expect(useAuthStore().token).toBeNull();
      expect(await db.device.count()).toBe(0);
    });

    it('refuses a device list that does not say which device this is', async () => {
      mockApi(() => ({ status: 200, body: { devices: [device('other', false)] } }));
      await expect(useAuthStore().pairWithToken('printed-token')).rejects.toThrow('current device');
      expect(useAuthStore().token).toBeNull();
      expect(await db.device.count()).toBe(0);
    });
  });

  it("doesn't claim a pairing it couldn't store: it would be gone after a restart", async () => {
    mockApi(() => ({ status: 200, body: { deviceId: 'phone', token: 'new-token' } }));
    vi.spyOn(db.device, 'put').mockRejectedValue(new Error('QuotaExceededError'));

    await expect(useAuthStore().pairWithCode('ABC123', 'Telefon')).rejects.toThrow('Quota');
    expect(useAuthStore().token).toBeNull();
  });

  describe('forgetting the device', () => {
    beforeEach(async () => {
      await db.device.put({ id: 'device', deviceId: 'phone', token: 'old-token' });
    });

    it('clears the token, also after a restart', async () => {
      const auth = await restart();
      expect(auth.token).toBe('old-token');
      await auth.forget();
      expect(auth.token).toBeNull();
      expect((await restart()).token).toBeNull();
    });

    it('keeps the local data and the outbox, so pairing again pushes what is queued', async () => {
      const row = pulledBench(1);
      await db.equipment_items.put(row);
      await db.outbox.add({
        entity: 'equipment_items',
        entityId: row.id,
        mutation: { op: 'delete', entity: 'equipment_items', row: { id: row.id } } as never,
      });

      await (await restart()).forget();

      expect(await db.equipment_items.get(row.id)).toEqual(row);
      expect(await db.outbox.count()).toBe(1);
    });

    it('stays paired when the stored token could not be removed: it would come back', async () => {
      const auth = await restart();
      vi.spyOn(db.device, 'delete').mockRejectedValue(new Error('storage failed'));
      await expect(auth.forget()).rejects.toThrow('storage failed');
      expect(auth.token).toBe('old-token');
    });
  });
});

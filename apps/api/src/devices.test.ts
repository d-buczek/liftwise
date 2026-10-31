import { describe, expect, it } from 'vite-plus/test';
import { call, createDevice } from '../test/helpers';

type DeviceList = { devices: { id: string; name: string; current: boolean }[] };

describe('devices', () => {
  it('lists active devices and marks the current one', async () => {
    const pc = await createDevice('PC');
    const phone = await createDevice('Phone');
    await createDevice('Old', { revoked_at: new Date().toISOString() });

    const response = await call('/api/devices', { token: phone.token });
    const { devices } = await response.json<DeviceList>();
    expect(devices.map(({ id, name, current }) => ({ id, name, current }))).toEqual([
      { id: pc.id, name: 'PC', current: false },
      { id: phone.id, name: 'Phone', current: true },
    ]);
  });

  it('revokes a device so its token stops working', async () => {
    const pc = await createDevice('PC');
    const phone = await createDevice('Phone');

    const response = await call(`/api/devices/${phone.id}`, { method: 'DELETE', token: pc.token });
    expect(response.status).toBe(204);
    expect((await call('/api/devices', { token: phone.token })).status).toBe(401);

    const again = await call(`/api/devices/${phone.id}`, { method: 'DELETE', token: pc.token });
    expect(again.status).toBe(404);
  });

  it('drops the unused pairing codes of a revoked device', async () => {
    const pc = await createDevice('PC');
    const phone = await createDevice('Phone');
    const created = await call('/api/auth/pairing', { method: 'POST', token: phone.token });
    const { code } = await created.json<{ code: string }>();

    await call(`/api/devices/${phone.id}`, { method: 'DELETE', token: pc.token });
    const response = await call('/api/auth/pairing/redeem', {
      method: 'POST',
      json: { code, name: 'Thief' },
    });
    expect(response.status).toBe(400);
  });

  it('returns 404 for unknown devices', async () => {
    const { token } = await createDevice();
    const response = await call('/api/devices/nope', { method: 'DELETE', token });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });
});

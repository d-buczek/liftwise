import { newId } from '@liftwise/core';
import { describe, expect, it } from 'vite-plus/test';
import { call, createDevice, db } from '../../test/helpers';
import { pairingCodes, pairingFailures } from '../db/schema';

type Pairing = { code: string; expiresAt: string };
type Redeemed = { deviceId: string; token: string };

async function createCode(token: string) {
  const response = await call('/api/auth/pairing', { method: 'POST', token });
  expect(response.status).toBe(201);
  return response.json<Pairing>();
}

const redeem = (code: string, name = 'Phone') =>
  call('/api/auth/pairing/redeem', { method: 'POST', json: { code, name } });

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe('pairing', () => {
  it('requires an authorized device to create a code', async () => {
    expect((await call('/api/auth/pairing', { method: 'POST' })).status).toBe(401);
  });

  it('pairs a new device with a code', async () => {
    const pc = await createDevice('PC');
    const { code, expiresAt } = await createCode(pc.token);
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(4 * 60_000);

    // Typed by hand: lower case, grouped.
    const typed = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
    const response = await redeem(typed);
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const { deviceId, token } = await response.json<Redeemed>();

    const list = await call('/api/devices', { token });
    expect(list.status).toBe(200);
    const { devices } = await list.json<{ devices: { id: string; current: boolean }[] }>();
    expect(devices.map((device) => [device.id, device.current])).toEqual([
      [pc.id, false],
      [deviceId, true],
    ]);
  });

  it('accepts a code only once', async () => {
    const { code } = await createCode((await createDevice()).token);
    expect((await redeem(code)).status).toBe(201);
    const again = await redeem(code);
    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({ error: 'invalid_code' });
  });

  it('rejects expired codes', async () => {
    const { code } = await createCode((await createDevice()).token);
    await db()
      .update(pairingCodes)
      .set({ expires_at: ago(1000) });
    expect((await redeem(code)).status).toBe(400);
  });

  it('replaces an unused code with a new one', async () => {
    const { token } = await createDevice();
    const first = await createCode(token);
    const second = await createCode(token);
    expect((await redeem(first.code)).status).toBe(400);
    expect((await redeem(second.code)).status).toBe(201);
  });

  it('rejects a malformed body without counting a failure', async () => {
    const response = await call('/api/auth/pairing/redeem', {
      method: 'POST',
      json: { code: 'ABCDEFGH', name: ' ' },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
    expect(await db().$count(pairingFailures)).toBe(0);

    const long = await redeem('A'.repeat(33));
    expect(await long.json()).toEqual({ error: 'invalid_request' });
  });

  it('blocks redeeming after 5 failures in 10 minutes', async () => {
    const { code } = await createCode((await createDevice()).token);
    for (let i = 0; i < 5; i++) expect((await redeem('WRONG234')).status).toBe(400);

    const blocked = await redeem(code);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'too_many_attempts' });
  });

  it('holds the limit for parallel attempts', async () => {
    const { code } = await createCode((await createDevice()).token);
    const statuses = await Promise.all(
      Array.from({ length: 10 }, async () => (await redeem('WRONG234')).status),
    );
    expect(statuses.filter((status) => status === 400)).toHaveLength(5);
    expect(statuses.filter((status) => status === 429)).toHaveLength(5);
    expect((await redeem(code)).status).toBe(429);
  });

  it('forgets failures older than 10 minutes', async () => {
    const { code } = await createCode((await createDevice()).token);
    await db()
      .insert(pairingFailures)
      .values(Array.from({ length: 5 }, () => ({ id: newId(), at: ago(11 * 60_000) })));

    expect((await redeem('WRONG234')).status).toBe(400);
    // The failure above also deletes the old ones.
    expect(await db().$count(pairingFailures)).toBe(1);
    expect((await redeem(code)).status).toBe(201);
  });
});
